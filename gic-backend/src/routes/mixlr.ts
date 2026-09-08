import { Hono } from "hono";

const app = new Hono();
const mixlrApi = "https://api.mixlr.com/v3/channels/globalimpactng";

app.get("/latest", async (c) => {
  try {
    const recordingsResponse = await fetch(
      `${mixlrApi}/recordings?page%5Bsize%5D=1&page%5Bnumber%5D=1`,
      { headers: { "User-Agent": "GIC member platform" } }
    );
    if (!recordingsResponse.ok) {
      return c.json({ error: "Mixlr recordings are unavailable" }, 502);
    }

    const recordingsPayload = (await recordingsResponse.json()) as {
      data?: Array<{ id: string; attributes?: { title?: string; url?: string; created_at?: string; duration?: number } }>;
    };
    const latest = recordingsPayload.data?.[0];
    if (!latest?.id || !latest.attributes?.url) {
      return c.json({ error: "No playable Mixlr recordings found" }, 404);
    }

    const attributes = latest.attributes;
    const title = attributes.title || "Latest Global Impact Church recording";
    const cleanTitle = title.split(" | ")[0].replace(/^#\s*/, "").trim();
    const dateMatch = title.match(/\|\s*(\d{1,2}(?:st|nd|rd|th)?\s+\w+,\s+\d{4})/i);
    return c.json({
      id: latest.id,
      title,
      displayTitle: `# ${cleanTitle}`,
      displayDate: dateMatch?.[1] || attributes.created_at || null,
      audioUrl: attributes.url,
      url: `https://globalimpactng.mixlr.com/recordings/${latest.id}`,
      duration: attributes.duration || null,
      source: "Mixlr",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mixlr latest recording error:", error);
    return c.json({ error: "Unable to fetch the latest Mixlr recording" }, 502);
  }
});

export default app;
