import test from "node:test";
import assert from "node:assert/strict";
import { announceMixlrRecordingOnce, fetchLatestMixlrRecording, isNewMixlrRecording, mixlrAnnouncement, MIXLR_LOOKUP_INTERVAL_MS, shouldCheckMixlr } from "./mixlr-domain.js";

test("Mixlr lookup follows the one-hour cache interval", () => {
  const checkedAt = new Date("2026-10-04T10:00:00.000Z");
  assert.equal(shouldCheckMixlr(null, checkedAt), true);
  assert.equal(shouldCheckMixlr(checkedAt, new Date(checkedAt.getTime() + MIXLR_LOOKUP_INTERVAL_MS - 1)), false);
  assert.equal(shouldCheckMixlr(checkedAt, new Date(checkedAt.getTime() + MIXLR_LOOKUP_INTERVAL_MS)), true);
});

test("detects unknown Mixlr IDs once and ignores an already-known recording", () => {
  assert.equal(isNewMixlrRecording(null, "mixlr-123"), true);
  assert.equal(isNewMixlrRecording("mixlr-123", "mixlr-123"), false);
  assert.equal(isNewMixlrRecording("mixlr-old", "mixlr-new"), true);
});

test("normalizes Mixlr metadata and builds a preference-aware internal push destination", async () => {
  let fetchCount = 0;
  const recording = await fetchLatestMixlrRecording(async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ data: [{ id: "mixlr-123", attributes: {
      title: "Sunday Message | 4th October, 2026",
      url: "https://cdn.mixlr.com/audio/123.mp3",
      created_at: "2026-10-04T08:00:00.000Z",
      duration: 3600,
    } }] }), { status: 200 });
  }, new Date("2026-10-04T10:00:00.000Z"));
  assert.equal(fetchCount, 1);
  assert.equal(recording?.id, "mixlr-123");
  assert.equal(recording?.audioUrl, "https://cdn.mixlr.com/audio/123.mp3");
  assert.equal(recording?.recordingCreatedAt, "2026-10-04T08:00:00.000Z");
  const announcement = mixlrAnnouncement(recording!.id);
  assert.equal(announcement.title, "New Message from GIC");
  assert.equal(announcement.body, "The latest service recording is now available.");
  assert.equal(announcement.type, "GENERAL_ANNOUNCEMENT");
  assert.equal(announcement.audience, "everyone");
  assert.equal(announcement.destinationUrl, "/mixlr/mixlr-123");
  assert.equal(announcement.destinationRoute, announcement.destinationUrl);
});

test("creates one push campaign when the same recording is discovered repeatedly", async () => {
  const knownIds = new Set<string>();
  const campaigns: ReturnType<typeof mixlrAnnouncement>[] = [];
  const claimRecording = async () => {
    if (knownIds.has("mixlr-duplicate")) return false;
    knownIds.add("mixlr-duplicate");
    return true;
  };
  const createCampaign = async (announcement: ReturnType<typeof mixlrAnnouncement>) => {
    campaigns.push(announcement);
    return `campaign-${campaigns.length}`;
  };
  assert.equal(await announceMixlrRecordingOnce("mixlr-duplicate", claimRecording, createCampaign), "campaign-1");
  assert.equal(await announceMixlrRecordingOnce("mixlr-duplicate", claimRecording, createCampaign), null);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].destinationUrl, "/mixlr/mixlr-duplicate");
});