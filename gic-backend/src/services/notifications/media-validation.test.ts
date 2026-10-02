import test from "node:test";
import assert from "node:assert/strict";
import { validateNotificationMedia } from "./media-validation.js";

test("accepts supported image and MP4 signatures", () => {
  assert.equal(validateNotificationMedia("image/jpeg", 3, Buffer.from([0xff, 0xd8, 0xff])), "image");
  assert.equal(validateNotificationMedia("image/jpg", 3, Buffer.from([0xff, 0xd8, 0xff])), "image");
  assert.equal(validateNotificationMedia("image/gif", 6, Buffer.from("GIF89a")), "image");
  assert.equal(validateNotificationMedia("video/mp4", 8, Buffer.from([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70])), "video");
});

test("rejects unsupported MIME types, mismatched signatures, and oversized files", () => {
  assert.throws(() => validateNotificationMedia("text/html", 3, Buffer.from("<h1")), /Upload a JPEG/);
  assert.throws(() => validateNotificationMedia("video/mp4", 3, Buffer.from("abc")), /does not match/);
  assert.throws(() => validateNotificationMedia("video/mp4", 25 * 1024 * 1024 + 1, Buffer.alloc(25 * 1024 * 1024 + 1)), /25 MB/);
  assert.throws(() => validateNotificationMedia("image/jpeg", 3, Buffer.from([0, 0, 0])), /does not match/);
});