import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { notificationPreferences, notifications } from "../db/schema.js";
import { eq, isNull, desc, count } from "drizzle-orm";
import { z } from "zod";

const preferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  generalAnnouncements: z.boolean().optional(),
  eventUpdates: z.boolean().optional(),
  reminders: z.boolean().optional(),
  ministryUpdates: z.boolean().optional(),
  registrationUpdates: z.boolean().optional(),
});

const app = new Hono();

app.use("*", authMiddleware);

app.get("/preferences", async (c) => {
  const user = c.get("user");

  const preferences = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.memberId, user.sub),
  });

  if (!preferences) {
    const defaults = {
      memberId: user.sub,
      pushEnabled: true,
      emailEnabled: false,
      generalAnnouncements: true,
      eventUpdates: true,
      reminders: true,
      ministryUpdates: true,
      registrationUpdates: true,
    };

    const [created] = await db.insert(notificationPreferences).values(defaults).returning();
    return c.json({ preferences: created });
  }

  return c.json({ preferences });
});

app.put("/preferences", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = preferencesSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.issues }, 400);
  }

  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.memberId, user.sub),
  });

  const updates = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (!existing) {
    const [created] = await db
      .insert(notificationPreferences)
      .values({
        memberId: user.sub,
        pushEnabled: true,
        emailEnabled: false,
        generalAnnouncements: true,
        eventUpdates: true,
        reminders: true,
        ministryUpdates: true,
        registrationUpdates: true,
        ...updates,
      })
      .returning();
    return c.json({ preferences: created });
  }

  const [updated] = await db
    .update(notificationPreferences)
    .set(updates)
    .where(eq(notificationPreferences.memberId, user.sub))
    .returning();

  return c.json({ preferences: updated });
});

app.get("/", async (c) => {
  const user = c.get("user");
  const items = await db.query.notifications.findMany({
    where: eq(notifications.memberId, user.sub),
    orderBy: [desc(notifications.createdAt)],
    limit: 50,
  });
  return c.json({ items });
});

app.get("/unread-count", async (c) => {
  const user = c.get("user");
  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(eq(notifications.memberId, user.sub));
  return c.json({ count: result?.count ?? 0 });
});

app.patch("/:id/read", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const notif = await db.query.notifications.findFirst({
    where: eq(notifications.id, id),
  });

  if (!notif) return c.json({ error: "Not found" }, 404);
  // Security: ensure this notification belongs to the authenticated member
  if (notif.memberId !== user.sub) return c.json({ error: "Forbidden" }, 403);

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id));

  return c.json({ success: true });
});

app.patch("/read-all", async (c) => {
  const user = c.get("user");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.memberId, user.sub));
  return c.json({ success: true });
});

export default app;
