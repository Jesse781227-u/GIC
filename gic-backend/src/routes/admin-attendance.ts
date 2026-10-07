import { Hono } from "hono";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  ageGroupDefinitions,
  eventRegistrations,
  events,
  members,
  mixlrListenerSessions,
  mixlrRecordingStats,
  mixlrRecordings,
  serviceAttendance,
} from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { formatServiceOccurrenceLabel } from "../services/service-attendance.js";

const app = new Hono();

app.use("*", authMiddleware, adminMiddleware);

async function getDynamicDimensionOptions(churchId: string) {
  const ageGroups = await db.query.ageGroupDefinitions.findMany({ where: and(eq(ageGroupDefinitions.churchId, churchId), eq(ageGroupDefinitions.active, true)), orderBy: [ageGroupDefinitions.minAge] });
  const [eventRows, recordingRows] = await Promise.all([
    db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(events).where(eq(events.churchId, churchId)).orderBy(asc(events.startsAt)),
    db.select({ id: mixlrRecordings.id, title: mixlrRecordings.title, recordingCreatedAt: mixlrRecordings.recordingCreatedAt }).from(mixlrRecordings).orderBy(asc(mixlrRecordings.recordingCreatedAt)),
  ]);

  return {
    ageGroups: ageGroups.map((item) => ({ id: item.id, name: item.name, minAge: item.minAge, maxAge: item.maxAge })),
    genders: ["male", "female"],
    events: eventRows,
    recordings: recordingRows,
  };
}

async function listServiceRows(churchId: string, filters: Record<string, string | undefined>) {
  const conditions = [eq(serviceAttendance.churchId, churchId)];
  if (filters.occurrenceId) conditions.push(eq(serviceAttendance.occurrenceId, filters.occurrenceId));
  if (filters.gender) conditions.push(eq(members.gender, filters.gender));
  if (filters.ageGroupId) conditions.push(eq(members.ageGroupId, filters.ageGroupId));

  const rows = await db.select({
    occurrenceId: serviceAttendance.occurrenceId,
    eventTitle: events.title,
    eventStartsAt: events.startsAt,
    total: count(),
    inPerson: sql<number>`count(*) FILTER (WHERE ${serviceAttendance.response} = 'in_person')::int`,
    online: sql<number>`count(*) FILTER (WHERE ${serviceAttendance.response} = 'online')::int`,
    notAttending: sql<number>`count(*) FILTER (WHERE ${serviceAttendance.response} = 'not_attending')::int`,
  }).from(serviceAttendance)
    .innerJoin(events, and(eq(serviceAttendance.eventId, events.id), eq(events.churchId, churchId)))
    .innerJoin(members, and(eq(serviceAttendance.memberId, members.id), eq(members.churchId, churchId)))
    .where(and(...conditions))
    .groupBy(serviceAttendance.occurrenceId, events.id, events.title, events.startsAt)
    .orderBy(asc(serviceAttendance.occurrenceId));

  return rows.map((row) => ({
    ...row,
    serviceLabel: formatServiceOccurrenceLabel(row.eventTitle, row.occurrenceId, row.eventStartsAt),
  }));
}

async function listRegistrationRows(churchId: string, filters: Record<string, string | undefined>) {
  const conditions = [eq(eventRegistrations.churchId, churchId)];
  if (filters.eventId) conditions.push(eq(eventRegistrations.eventId, filters.eventId));
  if (filters.status) conditions.push(eq(eventRegistrations.status, filters.status));
  if (filters.gender) conditions.push(eq(members.gender, filters.gender));
  if (filters.ageGroupId) conditions.push(eq(members.ageGroupId, filters.ageGroupId));

  return db.select({
    eventId: events.id,
    eventTitle: events.title,
    total: count(),
    confirmed: sql<number>`count(*) FILTER (WHERE ${eventRegistrations.status} = 'CONFIRMED')::int`,
    waitlisted: sql<number>`count(*) FILTER (WHERE ${eventRegistrations.status} = 'WAITLISTED')::int`,
    pending: sql<number>`count(*) FILTER (WHERE ${eventRegistrations.status} = 'PENDING')::int`,
  }).from(eventRegistrations)
    .innerJoin(events, and(eq(eventRegistrations.eventId, events.id), eq(events.churchId, churchId)))
    .innerJoin(members, and(eq(eventRegistrations.memberId, members.id), eq(members.churchId, churchId)))
    .where(and(...conditions))
    .groupBy(events.id, events.title)
    .orderBy(asc(events.title));
}

app.get("/options", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  return c.json({ options: await getDynamicDimensionOptions(churchId) });
});

app.get("/service", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    occurrenceId: z.string().optional(),
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
  }).safeParse(c.req.query());

  if (!parsed.success) return c.json({ error: "Invalid service attendance filters" }, 400);

  const filters = parsed.data;
  const rows = await listServiceRows(churchId, filters);
  const totalEligible = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const inPerson = rows.reduce((sum, row) => sum + Number(row.inPerson || 0), 0);
  const online = rows.reduce((sum, row) => sum + Number(row.online || 0), 0);
  const notAttending = rows.reduce((sum, row) => sum + Number(row.notAttending || 0), 0);
  const responded = inPerson + online + notAttending;
  const summary = {
    totalEligible,
    responded,
    inPerson,
    online,
    notAttending,
    noResponse: Math.max(0, totalEligible - responded),
    responseRate: totalEligible === 0 ? 0 : Math.round((responded / totalEligible) * 100),
  };

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
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
    status: z.string().optional(),
  }).safeParse(c.req.query());

  if (!parsed.success) return c.json({ error: "Invalid registration filters" }, 400);

  const rows = await listRegistrationRows(churchId, parsed.data);
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const confirmed = rows.reduce((sum, row) => sum + Number(row.confirmed || 0), 0);
  const waitlisted = rows.reduce((sum, row) => sum + Number(row.waitlisted || 0), 0);
  const pending = rows.reduce((sum, row) => sum + Number(row.pending || 0), 0);
  const cancelled = await db.select({ total: count() }).from(eventRegistrations)
    .where(and(eq(eventRegistrations.churchId, churchId), eq(eventRegistrations.status, "CANCELLED")));

  return c.json({
    summary: { total, responded: confirmed, notAttending: waitlisted, noResponse: pending, confirmed, waitlisted, pending, cancelled: Number(cancelled[0]?.total || 0) },
    rows,
    options: await getDynamicDimensionOptions(churchId),
  });
});

app.get("/mixlr", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    recordingId: z.string().optional(),
    gender: z.string().optional(),
    ageGroupId: z.string().optional(),
  }).safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Invalid Mixlr report filters" }, 400);
  const { recordingId, gender, ageGroupId } = parsed.data;
  const conditions = [];
  if (recordingId) conditions.push(eq(mixlrRecordings.id, recordingId));
  if (gender) conditions.push(eq(members.gender, gender));
  if (ageGroupId) conditions.push(eq(members.ageGroupId, ageGroupId));

  const rows = await db
    .select({
      recordingId: mixlrRecordings.id,
      recordingTitle: mixlrRecordings.title,
      recordingCreatedAt: mixlrRecordings.recordingCreatedAt,
      listeners: sql<number>`count(DISTINCT ${members.id})::int`,
      plays: sql<number>`count(${mixlrListenerSessions.id})::int`,
      listeningTimeSeconds: sql<number>`COALESCE(sum(${mixlrListenerSessions.durationSeconds}), 0)::int`,
      identifiedListeners: sql<number>`count(DISTINCT ${members.id})::int`,
    })
    .from(mixlrRecordings)
    .leftJoin(mixlrListenerSessions, eq(mixlrListenerSessions.recordingId, mixlrRecordings.id))
    .leftJoin(members, and(eq(mixlrListenerSessions.memberId, members.id), eq(members.churchId, churchId)))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(mixlrRecordings.id, mixlrRecordings.title, mixlrRecordings.recordingCreatedAt)
    .orderBy(asc(mixlrRecordings.recordingCreatedAt));
  const identifiedMembers = await db.selectDistinct({ memberId: mixlrListenerSessions.memberId })
    .from(mixlrListenerSessions)
    .innerJoin(members, and(eq(mixlrListenerSessions.memberId, members.id), eq(members.churchId, churchId)))
    .innerJoin(mixlrRecordings, eq(mixlrListenerSessions.recordingId, mixlrRecordings.id))
    .where(conditions.length ? and(...conditions) : undefined);
  const listeners = await db.select({
    memberId: members.id,
    memberName: members.displayName,
    email: members.email,
    phone: members.phone,
    recordingId: mixlrRecordings.id,
    recordingTitle: mixlrRecordings.title,
    plays: count(mixlrListenerSessions.id),
    listeningTimeSeconds: sql<number>`COALESCE(sum(${mixlrListenerSessions.durationSeconds}), 0)::int`,
    lastListenedAt: sql<Date | null>`max(${mixlrListenerSessions.startedAt})`,
  }).from(mixlrListenerSessions)
    .innerJoin(members, and(eq(mixlrListenerSessions.memberId, members.id), eq(members.churchId, churchId)))
    .innerJoin(mixlrRecordings, eq(mixlrListenerSessions.recordingId, mixlrRecordings.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(members.id, mixlrRecordings.id)
    .orderBy(asc(members.displayName), asc(mixlrRecordings.title));
  const identifiedMemberDetails = await db.select({
    memberId: members.id,
    memberName: members.displayName,
    email: members.email,
    phone: members.phone,
    recordings: sql<number>`count(DISTINCT ${mixlrRecordings.id})::int`,
    plays: count(mixlrListenerSessions.id),
    listeningTimeSeconds: sql<number>`COALESCE(sum(${mixlrListenerSessions.durationSeconds}), 0)::int`,
    lastListenedAt: sql<Date | null>`max(${mixlrListenerSessions.startedAt})`,
  }).from(mixlrListenerSessions)
    .innerJoin(members, and(eq(mixlrListenerSessions.memberId, members.id), eq(members.churchId, churchId)))
    .innerJoin(mixlrRecordings, eq(mixlrListenerSessions.recordingId, mixlrRecordings.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(members.id)
    .orderBy(asc(members.displayName));

  return c.json({
    summary: {
      totalListeners: rows.reduce((total, row) => total + Number(row.listeners || 0), 0),
      totalPlays: rows.reduce((total, row) => total + Number(row.plays || 0), 0),
      totalListeningTimeSeconds: rows.reduce((total, row) => total + Number(row.listeningTimeSeconds || 0), 0),
      identifiedListeners: identifiedMembers.length,
    },
    rows,
    listeners,
    identifiedMembers: identifiedMemberDetails,
    options: await getDynamicDimensionOptions(churchId),
  });
});

export default app;
