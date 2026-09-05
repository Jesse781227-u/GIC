import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { adminNotifications } from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { eq, desc } from "drizzle-orm";

const app = new Hono();

app.use("*", authMiddleware, adminMiddleware);

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum([
    "GENERAL_ANNOUNCEMENT",
    "EVENT_PUBLISHED",
    "EVENT_REMINDER",
    "EVENT_UPDATED",
    "EVENT_CANCELLED",
    "REGISTRATION_CONFIRMATION",
    "REGISTRATION_CANCELLED",
    "FORM_AVAILABLE",
    "MINISTRY_UPDATE",
    "SYSTEM_NOTIFICATION"
  ]),
  audience: z.enum(["everyone", "ministry", "event_registrants", "members"]),
  destinationUrl: z.string().optional(),
  scheduledAt: z.string().optional(),
  audienceMinistryId: z.string().optional(),
  audienceEventId: z.string().optional(),
  audienceMemberIds: z.array(z.string()).optional(),
});

app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.issues }, 400);
  }

  const result = await notificationService.createDraft({
    ...parsed.data,
    createdBy: user.sub,
  });

  return c.json({ id: result.id, status: result.status }, 201);
});

app.get("/", async (c) => {
  const items = await db.query.adminNotifications.findMany({
    orderBy: [desc(adminNotifications.createdAt)],
    limit: 100,
  });
  
  return c.json({ items });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const notif = await db.query.adminNotifications.findFirst({
    where: eq(adminNotifications.id, id),
  });
  
  if (!notif) return c.json({ error: "Not found" }, 404);
  return c.json({ notification: notif });
});

app.post("/:id/send", async (c) => {
  const id = c.req.param("id");
  try {
    await notificationService.sendNow(id);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  await notificationService.cancel(id);
  return c.json({ success: true });
});

export default app;
