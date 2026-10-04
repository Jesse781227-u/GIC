import { Hono } from "hono";
import { getCachedLatestMixlrRecording, getCachedMixlrRecording } from "../services/mixlr.service.js";

const app = new Hono();

app.get("/latest", async (c) => {
  try {
    const latest = await getCachedLatestMixlrRecording();
    if (!latest) return c.json({ error: "No cached Mixlr recording is available yet" }, 404);
    return c.json(latest);
  } catch (error) {
    console.error("Mixlr latest recording cache error:", error);
    return c.json({ error: "Unable to load the latest Mixlr recording" }, 500);
  }
});

app.get("/recordings/:id", async (c) => {
  const recordingId = c.req.param("id");
  const recording = await getCachedMixlrRecording(recordingId);
  return recording ? c.json(recording) : c.json({ error: "Mixlr recording not found" }, 404);
});

export default app;
