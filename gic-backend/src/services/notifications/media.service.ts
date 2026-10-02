import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../../db/index.js";
import { notificationMedia } from "../../db/schema.js";
import { validateNotificationMedia } from "./media-validation.js";

export class R2MediaStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2MediaStorageError";
  }
}

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new R2MediaStorageError("Cloudflare R2 is not configured. Set the R2 account ID, bucket name, access key ID, and secret access key in the backend environment.");
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function getR2Client() {
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export class NotificationMediaService {
  async upload(file: File, createdBy: string) {
    const declaredMimeType = file.type.toLowerCase();
    const mimeType = declaredMimeType === "image/jpg" ? "image/jpeg" : declaredMimeType;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaType = validateNotificationMedia(mimeType, file.size, buffer);

    const id = randomUUID();
    const storagePath = `notification-media/${id}`;
    const { bucketName } = getR2Config();
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: storagePath,
      Body: buffer,
      ContentLength: file.size,
      ContentType: mimeType,
      CacheControl: "private, max-age=0, no-transform",
    }));

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
      await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: storagePath })).catch(() => {});
      throw error;
    }
  }

  async getMemberAsset(mediaId: string) {
    const media = await db.query.notificationMedia.findFirst({
      where: (table, { eq }) => eq(table.id, mediaId),
    });
    if (!media) return null;
    const { bucketName } = getR2Config();
    const client = getR2Client();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: media.storagePath }));
    } catch (error) {
      const code = (error as { name?: string; $metadata?: { httpStatusCode?: number } }).name;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (code === "NotFound" || status === 404) return null;
      throw error;
    }
    const safeFilename = media.originalFilename.replace(/["\\\r\n]/g, "_");
    const url = await getSignedUrl(client, new GetObjectCommand({
      Bucket: bucketName,
      Key: media.storagePath,
      ResponseContentDisposition: `inline; filename="${safeFilename}"`,
      ResponseContentType: media.mimeType,
    }), { expiresIn: 15 * 60 });
    return { media, url };
  }
}

export const notificationMediaService = new NotificationMediaService();