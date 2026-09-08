import { Hono } from "hono";

const app = new Hono();
const recordingsUrl = "https://globalimpactng.mixlr.com/recordings";
const recordingUrl = (id: string) => `https://globalimpactng.mixlr.com/recordings/${id}`;

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

app.get("/latest", async (c) => {
  try {
    const recordingsResponse = await fetch(recordingsUrl, {
      headers: { "User-Agent": "GIC member platform" },
    });
    if (!recordingsResponse.ok) {
      return c.json({ error: "Mixlr recordings are unavailable" }, 502);
    }

    const recordingsHtml = await recordingsResponse.text();
    const match = recordingsHtml.match(/\/recordings\/(\d+)/);
    if (!match) return c.json({ error: "No Mixlr recordings found" }, 404);

    const id = match[1];
    const latestUrl = recordingUrl(id);
    const detailResponse = await fetch(latestUrl, {
      headers: { "User-Agent": "GIC member platform" },
    });
    if (!detailResponse.ok) {
      return c.json({ error: "Latest Mixlr recording is unavailable" }, 502);
    }

    const detailHtml = await detailResponse.text();
    const titleMatch = detailHtml.match(
      /<meta[^>]+(?:property|name)="(?:og:title|description)"[^>]+content="([^"]+)"/i
    );
    const title = decodeHtml(titleMatch?.[1] || "Latest Global Impact Church recording")
      .replace(/^Global Impact NG\s*\|\s*/, "")
      .replace(/\s+#(?:GlobalImpactChurch|Jesus|Online|GIC|Yemidavids|bimbodavids).*$/i, "")
      .trim();

    return c.json({
      id,
      title,
      displayTitle: title.split(" | ")[0] || title,
      url: latestUrl,
      source: "Mixlr",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mixlr latest recording error:", error);
    return c.json({ error: "Unable to fetch the latest Mixlr recording" }, 502);
  }
});

export default app;
