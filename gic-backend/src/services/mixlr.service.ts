import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminNotifications, mixlrChannelState, mixlrRecordings } from "../db/schema.js";
import { DEFAULT_CHURCH_ID } from "../lib/tenant.js";
import { announceMixlrRecordingOnce, fetchLatestMixlrRecording, MIXLR_CHANNEL_KEY, shouldCheckMixlr, type MixlrRecording } from "./mixlr-domain.js";
import { notificationService } from "./notifications/notification.service.js";

export async function getCachedLatestMixlrRecording() {
  const [recording] = await db.select().from(mixlrRecordings).orderBy(desc(mixlrRecordings.createdAt)).limit(1);
  if (!recording) return null;
  const state = await db.query.mixlrChannelState.findFirst({ where: eq(mixlrChannelState.channelKey, MIXLR_CHANNEL_KEY) });
  return {
    id: recording.id,
    title: recording.title,
    displayTitle: `# ${recording.title.split(" | ")[0].replace(/^#\s*/, "").trim()}`,
    displayDate: recording.recordingCreatedAt
      ? new Date(recording.recordingCreatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })
      : null,
    audioUrl: recording.audioUrl,
    url: recording.recordingUrl,
    duration: recording.duration,
    recordingCreatedAt: recording.recordingCreatedAt?.toISOString() || null,
    source: "Mixlr" as const,
    fetchedAt: (state?.lastCheckedAt || recording.updatedAt || new Date()).toISOString(),
  };
}

export async function getCachedMixlrRecording(id: string) {
  const recording = await db.query.mixlrRecordings.findFirst({ where: eq(mixlrRecordings.id, id) });
  if (!recording) return null;
  return {
    id: recording.id,
    title: recording.title,
    displayTitle: `# ${recording.title.split(" | ")[0].replace(/^#\s*/, "").trim()}`,
    displayDate: recording.recordingCreatedAt
      ? new Date(recording.recordingCreatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })
      : null,
    audioUrl: recording.audioUrl,
    url: recording.recordingUrl,
    duration: recording.duration,
    recordingCreatedAt: recording.recordingCreatedAt?.toISOString() || null,
    source: "Mixlr" as const,
    fetchedAt: (recording.updatedAt || new Date()).toISOString(),
  };
}

export async function createMixlrRecordingNotification(recordingId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [recording] = await tx.select().from(mixlrRecordings)
      .where(eq(mixlrRecordings.id, recordingId))
      .for("update");
    if (!recording || recording.notificationId) return null;

    return announceMixlrRecordingOnce(recording.id, recording.title, async () => true, async (announcement) => {
      const [campaign] = await tx.insert(adminNotifications).values({
        churchId: DEFAULT_CHURCH_ID,
        ...announcement,
        createdBy: "system:mixlr",
        status: "DRAFT",
      }).returning({ id: adminNotifications.id });
      await tx.update(mixlrRecordings).set({ notificationId: campaign.id, updatedAt: now }).where(eq(mixlrRecordings.id, recording.id));
      return campaign.id;
    });
  });
}

export async function syncLatestMixlrRecording(now = new Date(), fetcher: typeof fetch = fetch) {
  const result = await db.transaction(async (tx) => {
    await tx.insert(mixlrChannelState).values({ channelKey: MIXLR_CHANNEL_KEY, lastCheckedAt: new Date(0) }).onConflictDoNothing();
    const [state] = await tx.select().from(mixlrChannelState)
      .where(eq(mixlrChannelState.channelKey, MIXLR_CHANNEL_KEY))
      .for("update");
    if (!shouldCheckMixlr(state?.lastCheckedAt, now)) return { recordingId: null, fetchError: null };

    let latest: MixlrRecording | null;
    try {
      latest = await fetchLatestMixlrRecording(fetcher, now);
    } catch (fetchError) {
      await tx.update(mixlrChannelState).set({ lastCheckedAt: now, updatedAt: now }).where(eq(mixlrChannelState.channelKey, MIXLR_CHANNEL_KEY));
      return { recordingId: null, fetchError };
    }
    if (!latest) {
      await tx.update(mixlrChannelState).set({ lastCheckedAt: now, updatedAt: now }).where(eq(mixlrChannelState.channelKey, MIXLR_CHANNEL_KEY));
      return { recordingId: null, fetchError: null };
    }

    const existing = await tx.query.mixlrRecordings.findFirst({ where: eq(mixlrRecordings.id, latest.id) });
    await tx.update(mixlrChannelState).set({ lastCheckedAt: now, updatedAt: now }).where(eq(mixlrChannelState.channelKey, MIXLR_CHANNEL_KEY));
    if (existing) {
      await tx.update(mixlrRecordings).set({
        title: latest.title,
        audioUrl: latest.audioUrl,
        recordingUrl: latest.url,
        duration: latest.duration,
        recordingCreatedAt: latest.recordingCreatedAt ? new Date(latest.recordingCreatedAt) : null,
        updatedAt: now,
      }).where(eq(mixlrRecordings.id, latest.id));
      return { recordingId: existing.id, fetchError: null };
    }

    const [recording] = await tx.insert(mixlrRecordings).values({
      id: latest.id,
      title: latest.title,
      audioUrl: latest.audioUrl,
      recordingUrl: latest.url,
      duration: latest.duration,
      recordingCreatedAt: latest.recordingCreatedAt ? new Date(latest.recordingCreatedAt) : null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing().returning({ id: mixlrRecordings.id });
    return { recordingId: recording?.id || latest.id, fetchError: null };
  });

  if (result.fetchError) throw result.fetchError;
  if (!result.recordingId) return { checked: false, notified: false, notificationId: null };
  const notificationId = await createMixlrRecordingNotification(result.recordingId, now);
  if (notificationId) await notificationService.sendNow(notificationId);
  return { checked: true, notified: Boolean(notificationId), notificationId };
}