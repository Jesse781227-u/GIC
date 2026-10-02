import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { adminNotifications } from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { eq, desc } from "drizzle-orm";
import { recordActivity } from "../services/activity.service.js";
import { notificationMediaService, R2MediaStorageError } from "../services/notifications/media.service.js";
import { isAllowedMemberRoute } from "../lib/member-routes.js";
import { NotificationMediaValidationError } from "../services/notifications/media-validation.js";

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
  destinationType: z.enum(["internal_route", "media_page"]),
  destinationRoute: z.string().optional(),
  destinationMediaId: z.string().uuid().optional(),
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

  const { destinationType, destinationRoute, destinationMediaId } = parsed.data;
  if (destinationType === "internal_route" && !isAllowedMemberRoute(destinationRoute)) {
    return c.json({ error: "Destination must be a supported internal member route." }, 400);
  }
  if (destinationType === "media_page" && !destinationMediaId) {
    return c.json({ error: "Choose uploaded media for the media destination." }, 400);
  }
  if (destinationType !== "internal_route" && destinationRoute) return c.json({ error: "Unexpected destination route." }, 400);
  if (destinationType !== "media_page" && destinationMediaId) return c.json({ error: "Unexpected destination media." }, 400);
  if (destinationMediaId) {
    const media = await db.query.notificationMedia.findFirst({ where: (table, { eq }) => eq(table.id, destinationMediaId) });
    if (!media) return c.json({ error: "Uploaded media is unavailable." }, 400);
  }

  const result = await notificationService.createDraft({
    ...parsed.data,
    createdBy: user.sub,
  });

  await recordActivity({ actorId: user.sub, actorName: user.name, action: "Created message", target: parsed.data.title, targetId: result.id, metadata: { audience: parsed.data.audience, scheduledAt: parsed.data.scheduledAt || null } });

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

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const notification = await db.query.adminNotifications.findFirst({
    where: eq(adminNotifications.id, id),
  });

  if (!notification) return c.json({ error: "Not found" }, 404);

  await db.delete(adminNotifications).where(eq(adminNotifications.id, id));

  const user = c.get("user");
  await recordActivity({
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
    await notificationService.sendNow(id);
    const user = c.get("user");
    const notification = await db.query.adminNotifications.findFirst({ where: eq(adminNotifications.id, id) });
    if (notification) await recordActivity({ actorId: user.sub, actorName: user.name, action: "Sent message", target: notification.title, targetId: id, metadata: { audience: notification.audience } });
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/media", bodyLimit({ maxSize: 26 * 1024 * 1024 }), async (c) => {
  const user = c.get("user");
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
    const media = await notificationMediaService.upload(file, user.sub);
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
