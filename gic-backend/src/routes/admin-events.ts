import { Hono } from "hono";
import { z } from "zod";
import { desc, count, and, eq, gte } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { events } from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { recordActivity } from "../services/activity.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);
app.get("/", async (c) => c.json({ events: await db.query.events.findMany({ orderBy: [desc(events.startsAt)] }) }));
app.post("/", async (c) => {
  const parsed = z.object({ title: z.string().trim().min(1), description: z.string().optional(), startsAt: z.string().datetime(), endsAt: z.string().datetime().optional(), location: z.string().optional(), imageUrl: z.string().optional(), isPaid: z.boolean().default(false), price: z.number().int().nonnegative().optional(), notifyOnPublish: z.boolean().default(false), status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT") }).superRefine((value, ctx) => {
    if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End time must be after start time" });
    if (value.isPaid && value.price === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Price is required for paid events" });
  }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  const [event] = await db.insert(events).values({ ...parsed.data, startsAt: new Date(parsed.data.startsAt), endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null, createdBy: c.get("user").sub }).returning();
  if (event.notifyOnPublish && event.status === "PUBLISHED") {
    const notification = await notificationService.createDraft({ title: event.title, body: event.description || `${event.title} has been published.`, type: "EVENT_PUBLISHED", audience: "everyone", destinationUrl: "/events", createdBy: c.get("user").sub });
    await notificationService.sendNow(notification.id);
  }
  await recordActivity({ actorId: c.get("user").sub, actorName: c.get("user").name, action: "Created event", target: event.title, targetId: event.id, metadata: { status: event.status } });
  return c.json({ event }, 201);
});

app.get("/summary", async (c) => {
  const now = new Date();
  const [upcoming] = await db.select({ value: count() }).from(events).where(and(eq(events.status, "PUBLISHED"), gte(events.startsAt, now)));
  return c.json({ upcomingEvents: Number(upcoming?.value || 0), asOf: now.toISOString() });
});
export default app;
