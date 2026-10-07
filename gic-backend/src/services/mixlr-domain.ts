export const MIXLR_CHANNEL_KEY = "globalimpactng";
export const MIXLR_LOOKUP_INTERVAL_MS = 60 * 60 * 1000;
export const MIXLR_RECORDING_ROUTE = (id: string) => `/mixlr/${encodeURIComponent(id)}`;

export type MixlrRecording = {
  id: string;
  title: string;
  displayTitle: string;
  displayDate: string | null;
  audioUrl: string;
  url: string;
  duration: number | null;
  recordingCreatedAt: string | null;
  source: "Mixlr";
  fetchedAt: string;
};

type MixlrPayload = {
  data?: Array<{
    id: string;
    attributes?: { title?: string; url?: string; created_at?: string; duration?: number };
  }>;
};

export function shouldCheckMixlr(lastCheckedAt: Date | null | undefined, now = new Date(), intervalMs = MIXLR_LOOKUP_INTERVAL_MS): boolean {
  return !lastCheckedAt || now.getTime() - lastCheckedAt.getTime() >= intervalMs;
}

export function isNewMixlrRecording(knownId: string | null | undefined, candidateId: string): boolean {
  return Boolean(candidateId) && candidateId !== knownId;
}

export function mixlrAnnouncement(recordingId: string, recordingTitle: string) {
  const destinationUrl = MIXLR_RECORDING_ROUTE(recordingId);
  return {
    title: recordingTitle,
    body: "The latest service recording is now available.",
    type: "GENERAL_ANNOUNCEMENT" as const,
    audience: "everyone" as const,
    destinationUrl,
    destinationType: "internal_route",
    destinationRoute: destinationUrl,
  };
}

export function mixlrNotificationTag(recordingId: string): string {
  return `gic-mixlr-${recordingId}`;
}

export async function announceMixlrRecordingOnce(
  recordingId: string,
  recordingTitle: string,
  claimRecording: () => Promise<boolean>,
  createCampaign: (announcement: ReturnType<typeof mixlrAnnouncement>) => Promise<string>,
): Promise<string | null> {
  if (!await claimRecording()) return null;
  return createCampaign(mixlrAnnouncement(recordingId, recordingTitle));
}

function normalizeRecording(recording: NonNullable<MixlrPayload["data"]>[number], fetchedAt = new Date()): MixlrRecording | null {
  const attributes = recording.attributes;
  if (!recording.id || !attributes?.url) return null;
  const title = attributes.title || "Latest Global Impact Church recording";
  const cleanTitle = title.split(" | ")[0].replace(/^#\s*/, "").trim();
  const dateMatch = title.match(/\|\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+,\s+\d{4})/i);
  const displayDate = dateMatch?.[1]?.replace(",", "") || (attributes.created_at
    ? new Date(attributes.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" })
    : null);
  return {
    id: recording.id,
    title,
    displayTitle: `# ${cleanTitle}`,
    displayDate,
    audioUrl: attributes.url,
    url: `https://globalimpactng.mixlr.com/recordings/${recording.id}`,
    duration: attributes.duration || null,
    recordingCreatedAt: attributes.created_at && !Number.isNaN(new Date(attributes.created_at).getTime()) ? new Date(attributes.created_at).toISOString() : null,
    source: "Mixlr",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchLatestMixlrRecording(fetcher: typeof fetch = fetch, fetchedAt = new Date()): Promise<MixlrRecording | null> {
  const response = await fetcher("https://api.mixlr.com/v3/channels/globalimpactng/recordings?page%5Bsize%5D=1&page%5Bnumber%5D=1", {
    headers: { "User-Agent": "GIC member platform" },
  });
  if (!response.ok) throw new Error("Mixlr recordings are unavailable");
  const payload = await response.json() as MixlrPayload;
  const latest = payload.data?.[0];
  return latest ? normalizeRecording(latest, fetchedAt) : null;
}