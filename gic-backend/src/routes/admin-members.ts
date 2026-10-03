import { Hono } from "hono";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ageGroupDefinitions, cellMemberships, cells, eventRegistrations, events, members, ministries, ministryMemberships, segmentMemberships, segments } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { describeGroupRules } from "../services/member-group-rules.js";
import { normalizeBirthday } from "../lib/age-groups.js";
import { recordActivity } from "../services/activity.service.js";
import { flagIneligibleCellMembershipsForMember, resolveSegmentMemberIds } from "../services/member-groups.service.js";
import { listActiveAgeGroups } from "../services/age-groups.service.js";
import { matchesProfileCondition } from "../services/member-group-rules.js";
import { ensureMemberAppMinistries, ensureYouthFellowship } from "../services/ministry-catalog.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

function toIdList(input?: string | string[]) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function filterMemberIdsByMemberships(churchId: string, ids: string[], table: "ministry" | "cell" | "group" | "segment") {
  const normalized = [...new Set(ids)];
  if (!normalized.length) return new Set<string>();
  if (table === "ministry") {
    const rows = await db.query.ministryMemberships.findMany({ where: and(eq(ministryMemberships.churchId, churchId), inArray(ministryMemberships.ministryId, normalized)) });
    return new Set(rows.map((row) => row.memberId));
  }
  if (table === "cell") {
    const rows = await db.query.cellMemberships.findMany({ where: and(eq(cellMemberships.churchId, churchId), inArray(cellMemberships.cellId, normalized)) });
    return new Set(rows.map((row) => row.memberId));
  }
  if (table === "group") {
    const [ministryRows, cellRows] = await Promise.all([
      db.query.ministryMemberships.findMany({ where: and(eq(ministryMemberships.churchId, churchId), inArray(ministryMemberships.ministryId, normalized)) }),
      db.query.cellMemberships.findMany({ where: and(eq(cellMemberships.churchId, churchId), inArray(cellMemberships.cellId, normalized)) }),
    ]);
    return new Set([...ministryRows.map((row) => row.memberId), ...cellRows.map((row) => row.memberId)]);
  }
  const segmentIds = [...new Set(normalized)];
  const candidateIds = new Set<string>();
  for (const segmentId of segmentIds) {
    const segment = await db.query.segments.findFirst({ where: and(eq(segments.id, segmentId), eq(segments.churchId, churchId), eq(segments.active, true)) });
    if (!segment) continue;
    const idsInSegment = segment.segmentType === "manual"
      ? (await db.query.segmentMemberships.findMany({ where: and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.segmentId, segment.id)) })).map((row) => row.memberId)
      : await resolveSegmentMemberIds(churchId, segment);
    idsInSegment.forEach((memberId) => candidateIds.add(memberId));
  }
  return candidateIds;
}

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const query = z.object({
    search: z.string().optional(),
    status: z.union([z.string(), z.array(z.string())]).optional(),
    center: z.string().optional(),
    ageGroupId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    relationshipStatus: z.union([z.enum(["Single", "Married"]), z.array(z.enum(["Single", "Married"]))]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    cellId: z.union([z.string(), z.array(z.string())]).optional(),
    groupId: z.union([z.string(), z.array(z.string())]).optional(),
    ministryId: z.union([z.string(), z.array(z.string())]).optional(),
    fellowshipId: z.union([z.string(), z.array(z.string())]).optional(),
    segmentId: z.union([z.string(), z.array(z.string())]).optional(),
  }).safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Invalid member filters" }, 400);

  const searchTerm = (query.data.search || "").trim().toLowerCase();
  const statuses = toIdList(query.data.status);
  const center = (query.data.center || "").trim();
  const ageGroupIds = toIdList(query.data.ageGroupId);
  const relationshipStatuses = toIdList(query.data.relationshipStatus);
  const page = query.data.page;
  const pageSize = query.data.pageSize;
  const cellIds = toIdList(query.data.cellId);
  const groupIds = toIdList(query.data.groupId);
  const ministryIds = toIdList(query.data.ministryId);
  const fellowshipIds = toIdList(query.data.fellowshipId);
  const segmentIds = toIdList(query.data.segmentId);

  const conditions = [eq(members.churchId, churchId)];
  const statusConditions = statuses.flatMap((status) => {
    if (status.toLowerCase() === "active") return [eq(members.active, true)];
    if (status.toLowerCase() === "inactive") return [eq(members.active, false)];
    return [eq(members.membershipStatus, status)];
  });
  if (statusConditions.length && statuses.length === 1) conditions.push(statusConditions[0]);
  else if (statusConditions.length > 1 && statuses.length > 1 && !statuses.some((status) => ["active", "inactive"].includes(status.toLowerCase()))) conditions.push(or(...statusConditions)!);
  if (center) conditions.push(eq(members.center, center));
  if (ageGroupIds.length === 1) conditions.push(eq(members.ageGroupId, ageGroupIds[0]));
  else if (ageGroupIds.length > 1) conditions.push(inArray(members.ageGroupId, ageGroupIds));
  if (relationshipStatuses.length === 1) conditions.push(eq(members.relationshipStatus, relationshipStatuses[0]));
  else if (relationshipStatuses.length > 1) conditions.push(inArray(members.relationshipStatus, relationshipStatuses));
  if (searchTerm) {
    const searchClause = or(
      sql`LOWER(${members.displayName}) LIKE ${`%${searchTerm}%`}`,
      sql`LOWER(COALESCE(${members.phone}, '')) LIKE ${`%${searchTerm}%`}`,
      sql`LOWER(COALESCE(${members.email}, '')) LIKE ${`%${searchTerm}%`}`,
      sql`LOWER(COALESCE(${members.center}, '')) LIKE ${`%${searchTerm}%`}`,
    );
    if (searchClause) conditions.push(searchClause);
  }

  const baseMembers = await db.query.members.findMany({ where: and(...conditions) });
  const baseIds = new Set(baseMembers.map((member) => member.id));
  await ensureMemberAppMinistries(churchId);
  await ensureYouthFellowship(churchId);
  const filterOptions = await Promise.all([
    db.query.ministries.findMany({ where: eq(ministries.churchId, churchId) }),
    db.query.cells.findMany({ where: and(eq(cells.churchId, churchId), eq(cells.active, true)) }),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)) }),
    listActiveAgeGroups(churchId),
    db.query.events.findMany({ where: and(eq(events.churchId, churchId), eq(events.status, "PUBLISHED")) }),
  ]);
  const categorySets: Set<string>[] = [];

  if (ministryIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, ministryIds, "ministry"));
  if (fellowshipIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, fellowshipIds, "cell"));
  if (cellIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, cellIds, "cell"));
  if (groupIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, groupIds, "group"));
  const eventIds = segmentIds.filter((id) => id.startsWith("event:")).map((id) => id.slice("event:".length));
  const systemSegments = segmentIds.filter((id) => ["new-members", "old-members", "male", "female"].includes(id));
  const customSegmentIds = segmentIds.filter((id) => !systemSegments.includes(id) && !id.startsWith("event:"));
  const segmentMatches = new Set<string>();
  for (const segmentId of systemSegments) {
    const matchedIds = baseMembers.filter((member) => {
      if (segmentId === "new-members") return matchesProfileCondition(member, { field: "joined_within_months", operator: "within", value: 5 });
      if (segmentId === "old-members") return !matchesProfileCondition(member, { field: "joined_within_months", operator: "within", value: 5 });
      return (member.gender || "").toLowerCase() === segmentId;
    }).map((member) => member.id);
    matchedIds.forEach((id) => segmentMatches.add(id));
  }
  const publishedEventIds = new Set(filterOptions[4].map((event) => event.id));
  const selectedEventIds = eventIds.filter((id) => publishedEventIds.has(id));
  if (eventIds.length) {
    const registrations = selectedEventIds.length ? await db.query.eventRegistrations.findMany({
      where: and(eq(eventRegistrations.churchId, churchId), inArray(eventRegistrations.eventId, selectedEventIds), eq(eventRegistrations.status, "CONFIRMED")),
    }) : [];
    registrations.forEach((registration) => segmentMatches.add(registration.memberId));
  }
  if (customSegmentIds.length) {
    const customMatches = await filterMemberIdsByMemberships(churchId, customSegmentIds, "segment");
    customMatches.forEach((id) => segmentMatches.add(id));
  }
  if (segmentIds.length) categorySets.push(segmentMatches);

  const candidateIds = categorySets.length ? categorySets.reduce((intersection, current) => {
    const next = new Set<string>();
    for (const id of intersection) if (current.has(id)) next.add(id);
    return next;
  }, new Set(baseIds)) : new Set(baseIds);

  const matchingMembers = baseMembers.filter((member) => candidateIds.has(member.id));
  const total = matchingMembers.length;
  const membersList = matchingMembers.slice((page - 1) * pageSize, page * pageSize);

  const memberGroups = new Map<string, { ministries: Array<{ id: string; name: string }>; fellowships: Array<{ id: string; name: string }>; segments: Array<{ id: string; name: string; type: string }> }>();
  for (const member of membersList) {
    memberGroups.set(member.id, { ministries: [], fellowships: [], segments: [] });
  }

  if (membersList.length) {
    const memberIds = membersList.map((member) => member.id);
    const [ministryRows, cellRows, manualSegmentRows] = await Promise.all([
      db.select({ memberId: ministryMemberships.memberId, id: ministries.id, name: ministries.name })
        .from(ministryMemberships)
        .innerJoin(ministries, eq(ministryMemberships.ministryId, ministries.id))
        .where(and(eq(ministryMemberships.churchId, churchId), inArray(ministryMemberships.memberId, memberIds))),
      db.select({ memberId: cellMemberships.memberId, id: cells.id, name: cells.name })
        .from(cellMemberships)
        .innerJoin(cells, eq(cellMemberships.cellId, cells.id))
        .where(and(eq(cellMemberships.churchId, churchId), inArray(cellMemberships.memberId, memberIds))),
      db.query.segmentMemberships.findMany({
        where: and(eq(segmentMemberships.churchId, churchId), inArray(segmentMemberships.memberId, memberIds)),
      }),
    ]);

    for (const row of ministryRows) memberGroups.get(row.memberId)?.ministries.push({ id: row.id, name: row.name });
    for (const row of cellRows) memberGroups.get(row.memberId)?.fellowships.push({ id: row.id, name: row.name });

    const manualSegmentIds = new Set(manualSegmentRows.map((row) => row.segmentId));
    for (const segment of filterOptions[2]) {
      const assignedMemberIds = segment.segmentType === "manual"
        ? manualSegmentRows.filter((row) => row.segmentId === segment.id).map((row) => row.memberId)
        : await resolveSegmentMemberIds(churchId, segment);
      for (const memberId of assignedMemberIds) {
        if (!memberGroups.has(memberId)) continue;
        memberGroups.get(memberId)?.segments.push({ id: segment.id, name: segment.name, type: segment.segmentType });
      }
    }
  }

  return c.json({
    members: membersList.map((member) => ({ ...member, groups: memberGroups.get(member.id) })),
    total,
    page,
    pageSize,
    filters: {
      ministries: filterOptions[0].map((item) => ({ id: item.id, name: item.name })),
      fellowships: filterOptions[1].map((item) => ({ id: item.id, name: item.name })),
      segments: [
        { id: "new-members", name: "New Members", type: "system" },
        { id: "old-members", name: "Old Members", type: "system" },
        { id: "male", name: "Male", type: "system" },
        { id: "female", name: "Female", type: "system" },
        ...filterOptions[4].map((event) => ({ id: `event:${event.id}`, name: `${event.title} Registrants`, type: "event_registrants" })),
      ],
      ageGroups: filterOptions[3].map(({ id, name, minAge, maxAge }) => ({ id, name, minAge, maxAge })),
    },
  });
});

app.get("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const member = await db.query.members.findFirst({ where: and(eq(members.id, c.req.param("id")), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Member not found" }, 404);

  const [ministryRows, cellRows, segmentRows, manualMemberships] = await Promise.all([
    db.select({ id: ministries.id, name: ministries.name }).from(ministryMemberships).innerJoin(ministries, eq(ministryMemberships.ministryId, ministries.id)).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.memberId, member.id))),
    db.select({ id: cells.id, name: cells.name, eligibilityReviewRequired: cellMemberships.eligibilityReviewRequired }).from(cellMemberships).innerJoin(cells, eq(cellMemberships.cellId, cells.id)).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, member.id))),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)) }),
    db.query.segmentMemberships.findMany({ where: and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.memberId, member.id)) }),
  ]);

  const manualIds = new Set(manualMemberships.map((row) => row.segmentId));
  const memberSegments = [] as Array<{ id: string; name: string; type: string; reason: string }>;
  for (const segment of segmentRows) {
    const isManual = segment.segmentType === "manual" && manualIds.has(segment.id);
    const isAutomatic = segment.segmentType !== "manual" && (await resolveSegmentMemberIds(churchId, segment)).includes(member.id);
    if (!isManual && !isAutomatic) continue;
    memberSegments.push({
      id: segment.id,
      name: segment.name,
      type: segment.segmentType,
      reason: segment.segmentType === "manual" ? "Manual assignment" : describeGroupRules(segment.rules as { logic?: "and" | "or"; conditions?: Array<{ field: string; operator: string; value?: unknown; min?: number; max?: number }> }),
    });
  }

  const ageGroups = await listActiveAgeGroups(churchId);
  return c.json({
    member,
    ageGroups: ageGroups.map(({ id, name, minAge, maxAge }) => ({ id, name, minAge, maxAge })),
    groups: {
      ministries: ministryRows,
      fellowships: cellRows,
      groups: [],
      segments: memberSegments,
    },
  });
});

app.patch("/:id/profile", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({
    ageGroupId: z.string().uuid().nullable().optional(),
    relationshipStatus: z.enum(["Single", "Married"]).nullable().optional(),
    birthday: z.string().optional().refine((value) => value === undefined || value === "" || normalizeBirthday(value) !== "", "Birthday must include a valid month and day."),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message || "Invalid member profile" }, 400);

  const member = await db.query.members.findFirst({ where: and(eq(members.id, c.req.param("id")), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Member not found" }, 404);
  const ageGroupId = parsed.data.ageGroupId === undefined ? member.ageGroupId : parsed.data.ageGroupId;
  if (ageGroupId && !await db.query.ageGroupDefinitions.findFirst({ where: and(eq(ageGroupDefinitions.id, ageGroupId), eq(ageGroupDefinitions.churchId, churchId), eq(ageGroupDefinitions.active, true)) })) {
    return c.json({ error: "Choose an active age group for this church." }, 400);
  }
  const relationshipStatus = parsed.data.relationshipStatus === undefined ? member.relationshipStatus : parsed.data.relationshipStatus;
  const birthday = parsed.data.birthday === undefined ? normalizeBirthday(member.birthday) : normalizeBirthday(parsed.data.birthday);
  const [updated] = await db.update(members).set({ ageGroupId, relationshipStatus, birthday, updatedAt: new Date() })
    .where(and(eq(members.id, member.id), eq(members.churchId, churchId))).returning();
  await flagIneligibleCellMembershipsForMember(churchId, updated);
  const changedFields = [
    ...(member.ageGroupId !== updated.ageGroupId ? ["ageGroup"] : []),
    ...(member.relationshipStatus !== updated.relationshipStatus ? ["relationshipStatus"] : []),
    ...(normalizeBirthday(member.birthday) !== birthday ? ["birthday"] : []),
  ];
  if (changedFields.length) {
    const user = c.get("user");
    await recordActivity({ churchId, actorId: user.sub, actorName: user.name, action: "Updated member profile attributes", target: updated.displayName, targetId: updated.id, metadata: { fields: changedFields } });
  }
  return c.json({ member: updated });
});

export default app;
