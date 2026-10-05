import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { members, serviceAttendance } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { buildAttendanceSummary } from "../services/service-attendance.js";

const app = new Hono();

app.use("*", authMiddleware, adminMiddleware);

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    eventId: z.string().optional(),
    occurrenceId: z.string().optional(),
    attendanceType: z.enum(["in_person", "online", "not_attending"]).optional(),
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
  }).safeParse(c.req.query());

  if (!parsed.success) {
    return c.json({ error: "Invalid attendance filters" }, 400);
  }

  const conditions = [eq(serviceAttendance.churchId, churchId)];
  if (parsed.data.eventId) conditions.push(eq(serviceAttendance.eventId, parsed.data.eventId));
  if (parsed.data.occurrenceId) conditions.push(eq(serviceAttendance.occurrenceId, parsed.data.occurrenceId));
  if (parsed.data.attendanceType) conditions.push(eq(serviceAttendance.response, parsed.data.attendanceType));

  const rows = await db.select().from(serviceAttendance).where(and(...conditions));
  const memberIds = [...new Set(rows.map((row) => row.memberId))];

  const memberLookup = new Map<string, typeof members.$inferSelect>();
  if (memberIds.length) {
    const records = await db.select().from(members).where(and(eq(members.churchId, churchId), inArray(members.id, memberIds)));
    for (const record of records) memberLookup.set(record.id, record);
  }

  const filteredRows = parsed.data.gender || parsed.data.ageGroupId
    ? rows.filter((row) => {
        const member = memberLookup.get(row.memberId);
        if (!member) return false;
        const matchesGender = !parsed.data.gender || (member.gender || "").toLowerCase() === parsed.data.gender.toLowerCase();
        const matchesAgeGroup = !parsed.data.ageGroupId || member.ageGroupId === parsed.data.ageGroupId;
        return matchesGender && matchesAgeGroup;
      })
    : rows;

  const summary = buildAttendanceSummary(filteredRows.map((row) => ({ response: row.response })), Math.max(filteredRows.length, 0));

  return c.json({
    summary,
    rows: filteredRows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      occurrenceId: row.occurrenceId,
      response: row.response,
      respondedAt: row.respondedAt,
      memberName: memberLookup.get(row.memberId)?.displayName || "Member",
      gender: memberLookup.get(row.memberId)?.gender || "—",
      ageGroupId: memberLookup.get(row.memberId)?.ageGroupId || null,
      relationshipStatus: memberLookup.get(row.memberId)?.relationshipStatus || "—",
    })),
  });
});

export default app;
