import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { db } from "../../db/index.js";
import { notificationMedia } from "../../db/schema.js";
import { getFirebaseApp } from "../../lib/firebase.js";
import { validateNotificationMedia } from "./media-validation.js";

function storageBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "global-impact-church-9b8fd.firebasestorage.app";
  return getStorage(getFirebaseApp()).bucket(bucketName);
}

export class NotificationMediaService {
  async upload(file: File, createdBy: string) {
    const declaredMimeType = file.type.toLowerCase();
    const mimeType = declaredMimeType === "image/jpg" ? "image/jpeg" : declaredMimeType;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaType = validateNotificationMedia(mimeType, file.size, buffer);

    const id = randomUUID();
    const storagePath = `notification-media/${id}`;
    await storageBucket().file(storagePath).save(buffer, {
      resumable: false,
      metadata: { contentType: mimeType, cacheControl: "private, max-age=0, no-transform" },
    });

    try {
      const originalFilename = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 255) || "notification-media";
      const [media] = await db.insert(notificationMedia).values({
        id,
        storagePath,
        mediaType,
        originalFilename,
        mimeType,
        fileSize: file.size,
        createdBy,
      }).returning();
      return media;
    } catch (error) {
      await storageBucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => {});
      throw error;
    }
  }

  async getMemberAsset(mediaId: string) {
    const media = await db.query.notificationMedia.findFirst({
      where: (table, { eq }) => eq(table.id, mediaId),
    });
    if (!media) return null;
    const file = storageBucket().file(media.storagePath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      responseDisposition: `inline; filename="${media.originalFilename.replace(/"/g, "_")}"`,
      responseType: media.mimeType,
    });
    return { media, url };
  }
}

export const notificationMediaService = new NotificationMediaService();