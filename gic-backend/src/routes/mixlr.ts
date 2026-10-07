import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { members, mixlrListenerSessions, mixlrRecordings } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
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

app.post("/recordings/:id/listens", authMiddleware, async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const recordingId = c.req.param("id") || "";
  const [recording, member] = await Promise.all([
    db.query.mixlrRecordings.findFirst({ where: eq(mixlrRecordings.id, recordingId) }),
    db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId), eq(members.active, true)) }),
  ]);
  if (!recording) return c.json({ error: "Mixlr recording not found" }, 404);
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const [session] = await db.insert(mixlrListenerSessions).values({ recordingId, memberId: member.id }).returning({ id: mixlrListenerSessions.id });
  return c.json({ sessionId: session.id }, 201);
});

app.patch("/listens/:id", authMiddleware, async (c) => {
  const parsed = z.object({
    durationSeconds: z.number().int().min(0).max(30).default(0),
    ended: z.boolean().default(false),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid listen session update" }, 400);

  const sessionId = c.req.param("id") || "";
  const values = {
    durationSeconds: sql`COALESCE(${mixlrListenerSessions.durationSeconds}, 0) + ${parsed.data.durationSeconds}`,
    ...(parsed.data.ended ? { endedAt: new Date() } : {}),
  };
  const [session] = await db.update(mixlrListenerSessions).set(values)
    .where(and(eq(mixlrListenerSessions.id, sessionId), eq(mixlrListenerSessions.memberId, c.get("user").sub)))
    .returning({ id: mixlrListenerSessions.id });
  return session ? c.json({ success: true }) : c.json({ error: "Listen session not found" }, 404);
});

export default app;
