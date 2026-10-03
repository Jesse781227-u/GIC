import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { cells, cellMemberships, members, ministries, ministryApplications, ministryMemberships, segmentMemberships, segments } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { describeGroupRules } from "../services/member-group-rules.js";
import { isEligibleForCell, resolveSegmentMemberIds } from "../services/member-groups.service.js";

const app = new Hono();
app.use("*", authMiddleware);

app.get("/ministries", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const memberId = user.sub;
  const [groups, memberships, applications] = await Promise.all([
    db.query.ministries.findMany({ where: and(eq(ministries.churchId, churchId), eq(ministries.active, true)) }),
    db.query.ministryMemberships.findMany({ where: and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.memberId, memberId)) }),
    db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.memberId, memberId)) }),
  ]);
  const memberGroupIds = new Set(memberships.map((item) => item.ministryId));
  const applicationByMinistry = new Map(applications.filter((item) => item.ministryId).map((item) => [item.ministryId!, item]));
  return c.json({ ministries: groups.map((item) => ({ ...item, joined: memberGroupIds.has(item.id), applicationStatus: applicationByMinistry.get(item.id)?.status.toLowerCase() || null, applicationId: applicationByMinistry.get(item.id)?.id || null })) });
});

app.post("/ministries/:id/join", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const ministry = await db.query.ministries.findFirst({ where: and(eq(ministries.id, c.req.param("id")), eq(ministries.churchId, churchId), eq(ministries.active, true)) });
  if (!ministry) return c.json({ error: "Ministry not found" }, 404);
  if (ministry.applicationRequired) return c.json({ error: "This ministry requires an application." }, 409);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const [membership] = await db.insert(ministryMemberships).values({ churchId, ministryId: ministry.id, memberId: member.id, source: "member_direct" }).onConflictDoNothing().returning();
  return c.json({ membership: membership || null, alreadyJoined: !membership }, membership ? 201 : 200);
});

app.delete("/ministries/:id/join", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const ministry = await db.query.ministries.findFirst({ where: and(eq(ministries.id, c.req.param("id")), eq(ministries.churchId, churchId)) });
  if (!ministry) return c.json({ error: "Ministry not found" }, 404);
  await db.delete(ministryMemberships).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, ministry.id), eq(ministryMemberships.memberId, c.get("user").sub)));
  return c.json({ success: true });
});

app.get("/ministries/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const ministry = await db.query.ministries.findFirst({ where: and(eq(ministries.id, c.req.param("id")), eq(ministries.churchId, churchId), eq(ministries.active, true)) });
  if (!ministry) return c.json({ error: "Ministry not found" }, 404);
  const membership = await db.query.ministryMemberships.findFirst({ where: and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, ministry.id), eq(ministryMemberships.memberId, c.get("user").sub)) });
  const application = await db.query.ministryApplications.findFirst({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.ministryId, ministry.id), eq(ministryApplications.memberId, c.get("user").sub)), orderBy: (table, { desc }) => [desc(table.createdAt)] });
  return c.json({ ministry, joined: Boolean(membership), applicationStatus: application?.status.toLowerCase() || null });
});

app.get("/cells", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const [groups, memberships, applications] = await Promise.all([
    db.query.cells.findMany({ where: and(eq(cells.churchId, churchId), eq(cells.active, true)) }),
    db.query.cellMemberships.findMany({ where: and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, member.id)) }),
    db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.memberId, member.id), eq(ministryApplications.organizationKind, "cell")) }),
  ]);
  const joined = new Set(memberships.map((item) => item.cellId));
  const reviewRequired = new Set(memberships.filter((item) => item.eligibilityReviewRequired).map((item) => item.cellId));
  const applicationByCell = new Map(applications.filter((item) => item.cellId).map((item) => [item.cellId!, item]));
  return c.json({ cells: groups.map((item) => ({ ...item, joined: joined.has(item.id), applicationStatus: applicationByCell.get(item.id)?.status.toLowerCase() || null, applicationId: applicationByCell.get(item.id)?.id || null, eligible: isEligibleForCell(member, item.eligibilityRules as { logic?: "and" | "or"; conditions?: Array<{ field: string; operator: string; value?: unknown; min?: number; max?: number }> }), eligibilityReviewRequired: reviewRequired.has(item.id) })) });
});

app.post("/cells/:id/join", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const cell = await db.query.cells.findFirst({ where: and(eq(cells.id, c.req.param("id")), eq(cells.churchId, churchId), eq(cells.active, true)) });
  if (!cell) return c.json({ error: "Cell not found" }, 404);
  if (!isEligibleForCell(member, cell.eligibilityRules as { logic?: "and" | "or"; conditions?: Array<{ field: string; operator: string; value?: unknown; min?: number; max?: number }> })) return c.json({ error: "Your profile does not meet this cell's eligibility requirements." }, 403);
  if (cell.applicationRequired) {
    const existing = await db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.memberId, member.id), eq(ministryApplications.cellId, cell.id), eq(ministryApplications.organizationKind, "cell")) });
    if (existing.some((application) => application.status === "PENDING")) return c.json({ application: existing.find((application) => application.status === "PENDING"), alreadyApplied: true });
    if (existing.some((application) => application.status === "APPROVED")) return c.json({ error: "You already belong to this fellowship or cell." }, 409);
    const [application] = await db.insert(ministryApplications).values({ churchId, cellId: cell.id, organizationKind: "cell", memberId: member.id, memberName: member.displayName, ministry: cell.name, message: "Requested to join." }).returning();
    return c.json({ application }, 201);
  }
  const existing = await db.query.cellMemberships.findFirst({ where: and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, cell.id), eq(cellMemberships.memberId, member.id)) });
  if (existing) return c.json({ membership: existing, alreadyJoined: true });
  const [membership] = await db.insert(cellMemberships).values({ churchId, cellId: cell.id, memberId: member.id }).returning();
  return c.json({ membership }, 201);
});

app.delete("/cells/:id/join", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const cell = await db.query.cells.findFirst({ where: and(eq(cells.id, c.req.param("id")), eq(cells.churchId, churchId)) });
  if (!cell) return c.json({ error: "Cell not found" }, 404);
  await db.delete(cellMemberships).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, cell.id), eq(cellMemberships.memberId, user.sub)));
  return c.json({ success: true });
});

app.get("/profile/memberships", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const [ministryRows, cellRows, segmentRows, manualMemberships] = await Promise.all([
    db.select({ id: ministries.id, name: ministries.name }).from(ministryMemberships).innerJoin(ministries, eq(ministryMemberships.ministryId, ministries.id)).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.memberId, user.sub))),
    db.select({ id: cells.id, name: cells.name, eligibilityReviewRequired: cellMemberships.eligibilityReviewRequired }).from(cellMemberships).innerJoin(cells, eq(cellMemberships.cellId, cells.id)).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, user.sub))),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)) }),
    db.query.segmentMemberships.findMany({ where: and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.memberId, user.sub)) }),
  ]);
  const manualIds = new Set(manualMemberships.map((row) => row.segmentId));
  const memberSegments = [] as Array<{ id: string; name: string; reason: string; type: string }>; 
  for (const segment of segmentRows) {
    const isManualMatch = segment.segmentType === "manual" && manualIds.has(segment.id);
    const isAutomaticMatch = segment.segmentType !== "manual" && (await resolveSegmentMemberIds(churchId, segment)).includes(user.sub);
    if (!isManualMatch && !isAutomaticMatch) continue;
    memberSegments.push({
      id: segment.id,
      name: segment.name,
      type: segment.segmentType,
      reason: segment.segmentType === "manual" ? "Manual assignment" : describeGroupRules(segment.rules as { logic?: "and" | "or"; conditions?: Array<{ field: string; operator: string; value?: unknown; min?: number; max?: number }> }),
    });
  }
  return c.json({ ministries: ministryRows, fellowships: cellRows, cells: cellRows, groups: [], segments: memberSegments });
});

export default app;
