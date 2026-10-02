import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { events as eventRecords, members, notificationPreferences, notifications } from "../db/schema.js";
import { eq, isNull, desc, count, and } from "drizzle-orm";
import { z } from "zod";
import { birthdayCelebration, getLagosDateParts } from "../services/notifications/birthday.service.js";
import { notificationMediaService } from "../services/notifications/media.service.js";
import { isAllowedMemberRoute } from "../lib/member-routes.js";

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

app.get("/birthday", async (c) => {
  const user = c.get("user");
  const member = await db.query.members.findFirst({ where: eq(members.id, user.sub) });
  if (!member) return c.json({ celebration: null }, 404);
  return c.json({ celebration: birthdayCelebration(member, getLagosDateParts()) });
});

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

app.get("/tap/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const notification = await db.query.notifications.findFirst({
    where: and(eq(notifications.id, id), eq(notifications.memberId, user.sub)),
  });
  if (!notification) return c.json({ destinationType: "none", route: "/home" }, 404);

  const now = new Date();
  await db.update(notifications).set({ openedAt: notification.openedAt || now, readAt: notification.readAt || now }).where(eq(notifications.id, id));
  const destinationRoute = notification.destinationType === "internal_route" ? notification.destinationRoute : notification.destinationUrl;
  if (isAllowedMemberRoute(destinationRoute)) {
    const eventId = destinationRoute.match(/^\/events\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1];
    if (eventId && !["sunday-service", "midweek-service"].includes(eventId)) {
      const event = await db.query.events.findFirst({ where: and(eq(eventRecords.id, eventId), eq(eventRecords.status, "PUBLISHED")) });
      if (!event) return c.json({ destinationType: "none", route: "/home" });
    }
    await db.update(notifications).set({ destinationOpenedAt: now }).where(eq(notifications.id, id));
    return c.json({ destinationType: "internal_route", route: destinationRoute });
  }
  if (notification.destinationType === "media_page" && notification.destinationMediaId) {
    const media = await db.query.notificationMedia.findFirst({ where: (table, { eq }) => eq(table.id, notification.destinationMediaId!) });
    if (media) {
      const asset = await notificationMediaService.getMemberAsset(media.id);
      if (asset) return c.json({ destinationType: "media_page", route: `/notification/${id}` });
    }
  }
  return c.json({ destinationType: "none", route: "/home" });
});

app.get("/tap/:id/media", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const notification = await db.query.notifications.findFirst({
    where: and(eq(notifications.id, id), eq(notifications.memberId, user.sub)),
  });
  if (!notification || notification.destinationType !== "media_page" || !notification.destinationMediaId) {
    return c.json({ error: "Media destination is unavailable." }, 404);
  }
  const asset = await notificationMediaService.getMemberAsset(notification.destinationMediaId);
  if (!asset) return c.json({ error: "Media destination is unavailable." }, 404);
  await db.update(notifications).set({ destinationOpenedAt: notification.destinationOpenedAt || new Date() }).where(eq(notifications.id, id));
  return c.json({ media: { mediaType: asset.media.mediaType, mimeType: asset.media.mimeType, originalFilename: asset.media.originalFilename, url: asset.url } });
});

app.get("/unread-count", async (c) => {
  const user = c.get("user");
  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.memberId, user.sub), isNull(notifications.readAt)));
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
