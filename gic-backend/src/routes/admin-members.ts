import { Hono } from "hono";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { cellMemberships, cells, members, ministries, ministryMemberships, segmentMemberships, segments } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { describeGroupRules } from "../services/member-group-rules.js";
import { resolveSegmentMemberIds } from "../services/member-groups.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

function toIdList(input?: string | string[]) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function filterMemberIdsByMemberships(churchId: string, ids: string[], table: "ministry" | "cell" | "segment") {
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
    status: z.string().optional(),
    center: z.string().optional(),
    ministryId: z.union([z.string(), z.array(z.string())]).optional(),
    fellowshipId: z.union([z.string(), z.array(z.string())]).optional(),
    segmentId: z.union([z.string(), z.array(z.string())]).optional(),
  }).safeParse(c.req.query());
  if (!query.success) return c.json({ error: "Invalid member filters" }, 400);

  const searchTerm = (query.data.search || "").trim().toLowerCase();
  const status = (query.data.status || "").trim();
  const center = (query.data.center || "").trim();
  const ministryIds = toIdList(query.data.ministryId);
  const fellowshipIds = toIdList(query.data.fellowshipId);
  const segmentIds = toIdList(query.data.segmentId);

  const conditions = [eq(members.churchId, churchId)];
  if (status.toLowerCase() === "active") conditions.push(eq(members.active, true));
  else if (status.toLowerCase() === "inactive") conditions.push(eq(members.active, false));
  else if (status) conditions.push(eq(members.membershipStatus, status));
  if (center) conditions.push(eq(members.center, center));
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
  const categorySets: Set<string>[] = [];

  if (ministryIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, ministryIds, "ministry"));
  if (fellowshipIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, fellowshipIds, "cell"));
  if (segmentIds.length) categorySets.push(await filterMemberIdsByMemberships(churchId, segmentIds, "segment"));

  const candidateIds = categorySets.length ? categorySets.reduce((intersection, current) => {
    const next = new Set<string>();
    for (const id of intersection) if (current.has(id)) next.add(id);
    return next;
  }, new Set(baseIds)) : new Set(baseIds);

  const membersList = baseMembers.filter((member) => candidateIds.has(member.id));

  const filterOptions = await Promise.all([
    db.query.ministries.findMany({ where: and(eq(ministries.churchId, churchId), eq(ministries.active, true)) }),
    db.query.cells.findMany({ where: and(eq(cells.churchId, churchId), eq(cells.active, true)) }),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)) }),
  ]);

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
    total: membersList.length,
    filters: {
      ministries: filterOptions[0].map((item) => ({ id: item.id, name: item.name })),
      fellowships: filterOptions[1].map((item) => ({ id: item.id, name: item.name })),
      segments: filterOptions[2].map((item) => ({ id: item.id, name: item.name, type: item.segmentType })),
    },
  });
});

app.get("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const member = await db.query.members.findFirst({ where: and(eq(members.id, c.req.param("id")), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Member not found" }, 404);

  const [ministryRows, cellRows, segmentRows, manualMemberships] = await Promise.all([
    db.select({ id: ministries.id, name: ministries.name }).from(ministryMemberships).innerJoin(ministries, eq(ministryMemberships.ministryId, ministries.id)).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.memberId, member.id))),
    db.select({ id: cells.id, name: cells.name }).from(cellMemberships).innerJoin(cells, eq(cellMemberships.cellId, cells.id)).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, member.id))),
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

  return c.json({
    member,
    groups: {
      ministries: ministryRows,
      fellowships: cellRows,
      groups: [],
      segments: memberSegments,
    },
  });
});

export default app;
