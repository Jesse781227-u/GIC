import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  ageGroupDefinitions,
  cellMemberships,
  cells,
  eventRegistrations,
  members,
  ministries,
  ministryMemberships,
  mixlrListenerSessions,
  mixlrRecordingStats,
  mixlrRecordings,
  serviceAttendance,
  segmentMemberships,
  segments,
} from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { buildAttendanceSummary } from "../services/service-attendance.js";

const app = new Hono();

app.use("*", authMiddleware, adminMiddleware);

function toIdList(input?: string | string[]) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.flatMap((value) => String(value ?? "").split(",")).map((part) => part.trim()).filter(Boolean);
}

async function filterMemberIdsByMemberships(churchId: string, ids: string[], table: "ministry" | "cell" | "segment") {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return new Set<string>();

  if (table === "ministry") {
    const rows = await db.query.ministryMemberships.findMany({
      where: and(eq(ministryMemberships.churchId, churchId), inArray(ministryMemberships.ministryId, uniqueIds)),
    });
    return new Set(rows.map((row) => row.memberId));
  }

  if (table === "cell") {
    const rows = await db.query.cellMemberships.findMany({
      where: and(eq(cellMemberships.churchId, churchId), inArray(cellMemberships.cellId, uniqueIds)),
    });
    return new Set(rows.map((row) => row.memberId));
  }

  const rows = await db.query.segmentMemberships.findMany({
    where: and(eq(segmentMemberships.churchId, churchId), inArray(segmentMemberships.segmentId, uniqueIds)),
  });
  return new Set(rows.map((row) => row.memberId));
}

async function resolveMemberFilterIds(churchId: string, filters: Record<string, string | undefined>) {
  const gender = filters.gender?.trim();
  const ageGroupId = filters.ageGroupId?.trim();
  const relationshipStatus = filters.relationshipStatus?.trim();
  const ministryId = filters.ministryId?.trim();
  const cellId = filters.cellId?.trim();
  const segmentId = filters.segmentId?.trim();

  const baseConditions = [eq(members.churchId, churchId)];
  if (gender) baseConditions.push(eq(members.gender, gender));
  if (ageGroupId) baseConditions.push(eq(members.ageGroupId, ageGroupId));
  if (relationshipStatus) baseConditions.push(eq(members.relationshipStatus, relationshipStatus));

  const baseMembers = await db.query.members.findMany({ where: and(...baseConditions) });
  let candidateIds = new Set(baseMembers.map((member) => member.id));

  if (ministryId) {
    const ministryMatches = await filterMemberIdsByMemberships(churchId, toIdList(ministryId), "ministry");
    candidateIds = new Set([...candidateIds].filter((id) => ministryMatches.has(id)));
  }

  if (cellId) {
    const cellMatches = await filterMemberIdsByMemberships(churchId, toIdList(cellId), "cell");
    candidateIds = new Set([...candidateIds].filter((id) => cellMatches.has(id)));
  }

  if (segmentId) {
    const segmentMatches = await filterMemberIdsByMemberships(churchId, toIdList(segmentId), "segment");
    candidateIds = new Set([...candidateIds].filter((id) => segmentMatches.has(id)));
  }

  return [...candidateIds];
}

async function getDynamicDimensionOptions(churchId: string) {
  const [ageGroups, genders, relationshipStatuses, ministriesList, cellsList, segmentsList] = await Promise.all([
    db.query.ageGroupDefinitions.findMany({ where: eq(ageGroupDefinitions.churchId, churchId), orderBy: [ageGroupDefinitions.minAge] }),
    db.selectDistinct({ value: members.gender }).from(members).where(and(eq(members.churchId, churchId), sql`${members.gender} IS NOT NULL`, sql`TRIM(${members.gender}) <> ''`)).then((rows) => rows.map((row) => row.value).filter(Boolean)),
    db.selectDistinct({ value: members.relationshipStatus }).from(members).where(and(eq(members.churchId, churchId), sql`${members.relationshipStatus} IS NOT NULL`, sql`TRIM(${members.relationshipStatus}) <> ''`)).then((rows) => rows.map((row) => row.value).filter(Boolean)),
    db.query.ministries.findMany({ where: eq(ministries.churchId, churchId), orderBy: [ministries.name] }),
    db.query.cells.findMany({ where: and(eq(cells.churchId, churchId), eq(cells.active, true)), orderBy: [cells.name] }),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)), orderBy: [segments.name] }),
  ]);

  return {
    ageGroups: ageGroups.map((item) => ({ id: item.id, name: item.name, minAge: item.minAge, maxAge: item.maxAge })),
    genders,
    relationshipStatuses,
    ministries: ministriesList.map((item) => ({ id: item.id, name: item.name })),
    cells: cellsList.map((item) => ({ id: item.id, name: item.name })),
    segments: segmentsList.map((item) => ({ id: item.id, name: item.name, type: item.segmentType })),
  };
}

async function listServiceRows(churchId: string, filters: Record<string, string | undefined>) {
  const conditions = [eq(serviceAttendance.churchId, churchId)];
  if (filters.occurrenceId) conditions.push(eq(serviceAttendance.occurrenceId, filters.occurrenceId));
  if (filters.attendanceType) conditions.push(eq(serviceAttendance.response, filters.attendanceType));

  const rows = await db.select().from(serviceAttendance).where(and(...conditions));
  const memberIds = await resolveMemberFilterIds(churchId, filters);
  const filtered = memberIds.length ? rows.filter((row) => memberIds.includes(row.memberId)) : rows;

  const memberLookup = new Map<string, { displayName: string; gender: string | null; ageGroupId: string | null; relationshipStatus: string | null }>();
  if (filtered.length) {
    const memberRecords = await db.select({
      id: members.id,
      displayName: members.displayName,
      gender: members.gender,
      ageGroupId: members.ageGroupId,
      relationshipStatus: members.relationshipStatus,
    }).from(members).where(and(eq(members.churchId, churchId), inArray(members.id, [...new Set(filtered.map((row) => row.memberId))])));
    for (const member of memberRecords) memberLookup.set(member.id, member);
  }

  return filtered.map((row) => ({
    ...row,
    memberName: memberLookup.get(row.memberId)?.displayName ?? "Member",
    gender: memberLookup.get(row.memberId)?.gender ?? "—",
    ageGroupId: memberLookup.get(row.memberId)?.ageGroupId ?? null,
    relationshipStatus: memberLookup.get(row.memberId)?.relationshipStatus ?? "—",
  }));
}

async function listRegistrationRows(churchId: string, filters: Record<string, string | undefined>) {
  const conditions = [eq(eventRegistrations.churchId, churchId)];
  if (filters.eventId) conditions.push(eq(eventRegistrations.eventId, filters.eventId));
  if (filters.occurrenceId) conditions.push(eq(eventRegistrations.eventId, filters.eventId || ""));
  if (filters.status) conditions.push(eq(eventRegistrations.status, filters.status));

  const rows = await db.select().from(eventRegistrations).where(and(...conditions));
  const memberIds = await resolveMemberFilterIds(churchId, filters);
  const filtered = memberIds.length ? rows.filter((row) => memberIds.includes(row.memberId)) : rows;

  return filtered.map((row) => ({
    ...row,
    memberName: row.memberId,
  }));
}

app.get("/options", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  return c.json({ options: await getDynamicDimensionOptions(churchId) });
});

app.get("/service", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    occurrenceId: z.string().optional(),
    attendanceType: z.enum(["in_person", "online", "not_attending"]).optional(),
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
    relationshipStatus: z.string().optional(),
    ministryId: z.string().optional(),
    cellId: z.string().optional(),
    segmentId: z.string().optional(),
  }).safeParse(c.req.query());

  if (!parsed.success) return c.json({ error: "Invalid service attendance filters" }, 400);

  const filters = parsed.data;
  const rows = await listServiceRows(churchId, filters);
  const summary = buildAttendanceSummary(rows.map((row) => ({ response: row.response })), rows.length);

  return c.json({
    summary,
    rows,
    options: await getDynamicDimensionOptions(churchId),
  });
});

app.get("/registrations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    eventId: z.string().optional(),
    occurrenceId: z.string().optional(),
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
    relationshipStatus: z.string().optional(),
    ministryId: z.string().optional(),
    cellId: z.string().optional(),
    segmentId: z.string().optional(),
    status: z.string().optional(),
  }).safeParse(c.req.query());

  if (!parsed.success) return c.json({ error: "Invalid registration filters" }, 400);

  const rows = await listRegistrationRows(churchId, parsed.data);
  return c.json({
    summary: { total: rows.length },
    rows,
    options: await getDynamicDimensionOptions(churchId),
  });
});

app.get("/mixlr", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const recordingId = c.req.query("recordingId");

  const statsRows = await db
    .select({
      listeners: mixlrRecordingStats.listeners,
      plays: mixlrRecordingStats.plays,
      listeningTimeSeconds: mixlrRecordingStats.listeningTimeSeconds,
    })
    .from(mixlrRecordingStats)
    .innerJoin(mixlrRecordings, eq(mixlrRecordingStats.recordingId, mixlrRecordings.id))
    .where(recordingId ? eq(mixlrRecordings.id, recordingId) : undefined);

  const identifiedListenerCount = await db
    .selectDistinct({ memberId: mixlrListenerSessions.memberId })
    .from(mixlrListenerSessions)
    .where(sql`${mixlrListenerSessions.memberId} IS NOT NULL`);

  return c.json({
    summary: {
      totalListeners: statsRows.reduce((count, row) => count + Number(row.listeners || 0), 0),
      totalPlays: statsRows.reduce((count, row) => count + Number(row.plays || 0), 0),
      totalListeningTimeSeconds: statsRows.reduce((count, row) => count + Number(row.listeningTimeSeconds || 0), 0),
      identifiedListeners: identifiedListenerCount.length,
      source: "aggregate",
    },
    rows: [],
    options: await getDynamicDimensionOptions(churchId),
  });
});

export default app;
