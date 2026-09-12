import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { serviceReminders } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

const app = new Hono();
app.use("*", authMiddleware);

const reminderSchema = z.object({
  serviceType: z.string().min(1),
  occurrenceKey: z.string().min(1),
  serviceStartsAt: z.string().datetime(),
  offsetMinutes: z.union([z.literal(30), z.literal(60)]),
  scheduledFor: z.string().datetime(),
});

app.get("/", async (c) => {
  const user = c.get("user");
  const occurrenceKey = c.req.query("occurrenceKey");
  const where = occurrenceKey
    ? and(eq(serviceReminders.memberId, user.sub), eq(serviceReminders.occurrenceKey, occurrenceKey))
    : eq(serviceReminders.memberId, user.sub);
  return c.json({ reminders: await db.query.serviceReminders.findMany({ where }) });
});

app.post("/", async (c) => {
  const parsed = reminderSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid reminder", details: parsed.error.issues }, 400);
  const user = c.get("user");
  const value = parsed.data;
  const [reminder] = await db.insert(serviceReminders).values({
    memberId: user.sub,
    serviceType: value.serviceType,
    occurrenceKey: value.occurrenceKey,
    serviceStartsAt: new Date(value.serviceStartsAt),
    offsetMinutes: String(value.offsetMinutes),
    scheduledFor: new Date(value.scheduledFor),
    status: "pending",
  }).onConflictDoNothing().returning();
  return c.json({ reminder: reminder || null, alreadyExists: !reminder }, reminder ? 201 : 200);
});

app.delete("/", async (c) => {
  const user = c.get("user");
  const occurrenceKey = c.req.query("occurrenceKey");
  const offsetMinutes = c.req.query("offsetMinutes");
  if (!occurrenceKey || !offsetMinutes) return c.json({ error: "occurrenceKey and offsetMinutes are required" }, 400);
  await db.delete(serviceReminders).where(and(
    eq(serviceReminders.memberId, user.sub),
    eq(serviceReminders.occurrenceKey, occurrenceKey),
    eq(serviceReminders.offsetMinutes, offsetMinutes),
  ));
  return c.json({ success: true });
});

export default app;
