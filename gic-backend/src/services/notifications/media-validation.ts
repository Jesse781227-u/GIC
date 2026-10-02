const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

export class NotificationMediaValidationError extends Error {}

export function validateNotificationMedia(mimeType: string, size: number, buffer: Buffer) {
  const normalizedMimeType = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const mediaType = allowedImageTypes.has(normalizedMimeType) ? "image" : normalizedMimeType === "video/mp4" ? "video" : null;
  if (!mediaType) throw new NotificationMediaValidationError("Upload a JPEG, PNG, WebP, GIF image, or MP4 video.");
  const maxBytes = mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!size || size > maxBytes || buffer.length !== size) {
    throw new NotificationMediaValidationError(mediaType === "video" ? "MP4 files must be 25 MB or smaller." : "Images must be 8 MB or smaller.");
  }

  const signatureMatches = normalizedMimeType === "image/jpeg"
    ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : normalizedMimeType === "image/png"
      ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : normalizedMimeType === "image/webp"
        ? buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
        : normalizedMimeType === "image/gif"
          ? ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
          : buffer.toString("ascii", 4, 8) === "ftyp";
  if (!signatureMatches) throw new NotificationMediaValidationError("The uploaded file does not match its declared media type.");
  return mediaType;
}