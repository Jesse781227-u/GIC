import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { adminNotifications, cells, events, members, ministries, segments } from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { eq, desc, and, inArray } from "drizzle-orm";
import { recordActivity } from "../services/activity.service.js";
import { notificationMediaService, R2MediaStorageError } from "../services/notifications/media.service.js";
import { isAllowedMemberRoute } from "../lib/member-routes.js";
import { NotificationMediaValidationError } from "../services/notifications/media-validation.js";
import { churchIdForUser } from "../lib/tenant.js";

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
  audience: z.enum(["everyone", "ministry", "cell", "segment", "event_registrants", "members"]),
  destinationType: z.enum(["internal_route", "media_page"]),
  destinationRoute: z.string().optional(),
  destinationMediaId: z.string().uuid().optional(),
  scheduledAt: z.string().optional(),
  audienceMinistryId: z.string().optional(),
  audienceCellId: z.string().uuid().optional(),
  audienceSegmentId: z.string().uuid().optional(),
  audienceEventId: z.string().optional(),
  audienceMemberIds: z.array(z.string()).optional(),
});

app.post("/", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.issues }, 400);
  }

  const { destinationType, destinationRoute, destinationMediaId } = parsed.data;
  const audienceSelectorPresent = parsed.data.audience === "everyone"
    || (parsed.data.audience === "ministry" && Boolean(parsed.data.audienceMinistryId))
    || (parsed.data.audience === "cell" && Boolean(parsed.data.audienceCellId))
    || (parsed.data.audience === "segment" && Boolean(parsed.data.audienceSegmentId))
    || (parsed.data.audience === "event_registrants" && Boolean(parsed.data.audienceEventId))
    || (parsed.data.audience === "members" && Boolean(parsed.data.audienceMemberIds?.length));
  if (!audienceSelectorPresent) return c.json({ error: "Choose an audience and its group/event members." }, 400);
  if (destinationType === "internal_route" && !isAllowedMemberRoute(destinationRoute)) {
    return c.json({ error: "Destination must be a supported internal member route." }, 400);
  }
  if (destinationType === "media_page" && !destinationMediaId) {
    return c.json({ error: "Choose uploaded media for the media destination." }, 400);
  }
  if (destinationType !== "internal_route" && destinationRoute) return c.json({ error: "Unexpected destination route." }, 400);
  if (destinationType !== "media_page" && destinationMediaId) return c.json({ error: "Unexpected destination media." }, 400);
  if (destinationMediaId) {
    const media = await db.query.notificationMedia.findFirst({ where: (table, { and, eq }) => and(eq(table.id, destinationMediaId), eq(table.churchId, churchId)) });
    if (!media) return c.json({ error: "Uploaded media is unavailable." }, 400);
  }
  if (parsed.data.audienceMinistryId && !await db.query.ministries.findFirst({ where: and(eq(ministries.id, parsed.data.audienceMinistryId), eq(ministries.churchId, churchId), eq(ministries.active, true)) })) return c.json({ error: "Ministry audience is unavailable." }, 400);
  if (parsed.data.audienceCellId && !await db.query.cells.findFirst({ where: and(eq(cells.id, parsed.data.audienceCellId), eq(cells.churchId, churchId), eq(cells.active, true)) })) return c.json({ error: "Cell audience is unavailable." }, 400);
  if (parsed.data.audienceSegmentId && !await db.query.segments.findFirst({ where: and(eq(segments.id, parsed.data.audienceSegmentId), eq(segments.churchId, churchId), eq(segments.active, true)) })) return c.json({ error: "Segment audience is unavailable." }, 400);
  if (parsed.data.audienceEventId && !await db.query.events.findFirst({ where: and(eq(events.id, parsed.data.audienceEventId), eq(events.churchId, churchId), eq(events.status, "PUBLISHED")) })) return c.json({ error: "Event audience is unavailable." }, 400);
  if (parsed.data.audienceMemberIds?.length) {
    const matches = await db.query.members.findMany({ where: and(eq(members.churchId, churchId), inArray(members.id, parsed.data.audienceMemberIds), eq(members.active, true)) });
    if (matches.length !== parsed.data.audienceMemberIds.length) return c.json({ error: "Selected members must all be active members of this church." }, 400);
  }

  const result = await notificationService.createDraft({
    ...parsed.data,
    createdBy: user.sub,
    churchId,
  });

  await recordActivity({ churchId, actorId: user.sub, actorName: user.name, action: "Created message", target: parsed.data.title, targetId: result.id, metadata: { audience: parsed.data.audience, audienceMinistryId: parsed.data.audienceMinistryId, audienceCellId: parsed.data.audienceCellId, audienceSegmentId: parsed.data.audienceSegmentId, audienceEventId: parsed.data.audienceEventId, scheduledAt: parsed.data.scheduledAt || null } });

  return c.json({ id: result.id, status: result.status }, 201);
});

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const items = await db.query.adminNotifications.findMany({
    where: eq(adminNotifications.churchId, churchId),
    orderBy: [desc(adminNotifications.createdAt)],
    limit: 100,
  });
  
  return c.json({ items });
});

app.get("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const id = c.req.param("id");
  const notif = await db.query.adminNotifications.findFirst({
    where: and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)),
  });
  
  if (!notif) return c.json({ error: "Not found" }, 404);
  return c.json({ notification: notif });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const notification = await db.query.adminNotifications.findFirst({
    where: and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)),
  });

  if (!notification) return c.json({ error: "Not found" }, 404);

  await db.delete(adminNotifications).where(and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)));

  const user = c.get("user");
  await recordActivity({
    churchId,
    actorId: user.sub,
    actorName: user.name,
    action: "Deleted message",
    target: notification.title,
    targetId: id,
    metadata: { audience: notification.audience },
  }).catch((error) => console.error("Failed to record message deletion activity", error));

  return c.json({ success: true, deletedId: id });
});

app.post("/:id/send", async (c) => {
  const id = c.req.param("id");
  try {
    const churchId = churchIdForUser(c.get("user"));
    const scoped = await db.query.adminNotifications.findFirst({ where: and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)) });
    if (!scoped) return c.json({ error: "Notification not found" }, 404);
    await notificationService.sendNow(id);
    const user = c.get("user");
    const notification = await db.query.adminNotifications.findFirst({ where: and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)) });
    if (notification) await recordActivity({ churchId, actorId: user.sub, actorName: user.name, action: "Sent message", target: notification.title, targetId: id, metadata: { audience: notification.audience, audienceMinistryId: notification.audienceMinistryId, audienceCellId: notification.audienceCellId, audienceSegmentId: notification.audienceSegmentId, audienceEventId: notification.audienceEventId } });
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/media", bodyLimit({ maxSize: 26 * 1024 * 1024 }), async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (error) {
    console.warn("Invalid notification media multipart request:", error);
    return c.json({ error: "Choose an image or MP4 file and try again." }, 400);
  }
  const file = form.get("file");
  if (!isUploadFile(file)) return c.json({ error: "Choose an image or MP4 file." }, 400);
  try {
    const media = await notificationMediaService.upload(file, user.sub, churchId);
    return c.json({ media: { id: media.id, mediaType: media.mediaType, originalFilename: media.originalFilename, mimeType: media.mimeType, fileSize: media.fileSize } }, 201);
  } catch (error) {
    if (error instanceof NotificationMediaValidationError) return c.json({ error: error.message }, 400);
    console.error("Notification media upload failed:", error);
    if (error instanceof R2MediaStorageError) return c.json({ error: error.message }, 503);
    const failure = describeMediaInfrastructureFailure(error);
    return c.json({ error: failure }, 500);
  }
});

app.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const notification = await db.query.adminNotifications.findFirst({ where: and(eq(adminNotifications.id, id), eq(adminNotifications.churchId, churchId)) });
  if (!notification) return c.json({ error: "Notification not found" }, 404);
  await notificationService.cancel(id);
  return c.json({ success: true });
});

export default app;

function isUploadFile(value: unknown): value is File {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; type?: unknown; size?: unknown; arrayBuffer?: unknown };
  return typeof candidate.name === "string"
    && typeof candidate.type === "string"
    && typeof candidate.size === "number"
    && typeof candidate.arrayBuffer === "function";
}

function describeMediaInfrastructureFailure(error: unknown) {
  const failure = error as { code?: string | number; message?: string };
  const code = String(failure?.code || "").toLowerCase();
  const name = String((error as { name?: string })?.name || "").toLowerCase();
  const message = String(failure?.message || "").toLowerCase();
  if (["accessdenied", "invalidaccesskeyid", "signaturedoesnotmatch"].includes(name) || code === "403") {
    return "Cloudflare R2 rejected the request. Verify the R2 access key ID, secret, and bucket permissions in the backend environment.";
  }
  if (code === "404" || /bucket.*(not found|does not exist)/.test(message)) {
    return "The configured Cloudflare R2 bucket was not found. Verify CLOUDFLARE_R2_BUCKET_NAME and the R2 account ID.";
  }
  if (code === "42p01" || /relation [^ ]*notification_media[^ ]* does not exist/.test(message)) {
    return "The notification media database migration is missing. Deploy the backend database migrations and retry.";
  }
  return "Media storage failed. Check the backend logs for the notification media upload error.";
}
