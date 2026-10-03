import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { cellMemberships, cells, members, ministryMemberships, segmentMemberships, segments } from "../db/schema.js";
import { matchesGroupRules, type GroupRules } from "./member-group-rules.js";

export async function resolveSegmentMemberIds(churchId: string, segment: typeof segments.$inferSelect) {
  const tenantMembers = await db.query.members.findMany({ where: and(eq(members.churchId, churchId), eq(members.active, true)) });
  if (segment.segmentType === "manual") {
    const memberships = await db.query.segmentMemberships.findMany({ where: and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.segmentId, segment.id)) });
    const eligible = new Set(memberships.map((row) => row.memberId));
    return tenantMembers.filter((member) => eligible.has(member.id)).map((member) => member.id);
  }
  const rules = segment.rules as GroupRules;
  const [ministryRows, cellRows] = await Promise.all([
    db.query.ministryMemberships.findMany({ where: eq(ministryMemberships.churchId, churchId) }),
    db.query.cellMemberships.findMany({ where: eq(cellMemberships.churchId, churchId) }),
  ]);
  return tenantMembers.filter((member) => {
    return matchesGroupRules(member, rules, (condition) => condition.field === "ministry_id"
      ? ministryRows.some((row) => row.memberId === member.id && row.ministryId === condition.value)
      : cellRows.some((row) => row.memberId === member.id && row.cellId === condition.value));
  }).map((member) => member.id);
}

export function isEligibleForCell(member: typeof members.$inferSelect, rules: GroupRules) {
  return matchesGroupRules(member, rules);
}

export async function flagIneligibleCellMembershipsForMember(churchId: string, member: typeof members.$inferSelect) {
  const memberships = await db.query.cellMemberships.findMany({
    where: and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, member.id)),
  });
  for (const membership of memberships) {
    if (membership.eligibilityReviewRequired) continue;
    const cell = await db.query.cells.findFirst({ where: and(eq(cells.id, membership.cellId), eq(cells.churchId, churchId)) });
    if (cell && !isEligibleForCell(member, cell.eligibilityRules as GroupRules)) {
      await db.update(cellMemberships)
        .set({ eligibilityReviewRequired: true, updatedAt: new Date() })
        .where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.id, membership.id)));
    }
  }
}

export async function flagIneligibleCellMembersForReview(churchId: string, cellId: string, rules: GroupRules) {
  const memberships = await db.query.cellMemberships.findMany({
    where: and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, cellId)),
  });
  if (!memberships.length) return;
  const memberIds = memberships.map((membership) => membership.memberId);
  const memberRows = await db.query.members.findMany({
    where: and(eq(members.churchId, churchId), inArray(members.id, memberIds)),
  });
  const membersById = new Map(memberRows.map((member) => [member.id, member]));
  for (const membership of memberships) {
    const member = membersById.get(membership.memberId);
    if (!member || membership.eligibilityReviewRequired || isEligibleForCell(member, rules)) continue;
    await db.update(cellMemberships)
      .set({ eligibilityReviewRequired: true, updatedAt: new Date() })
      .where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.id, membership.id)));
  }
}

export async function countSegmentMembers(churchId: string, segment: typeof segments.$inferSelect) {
  return (await resolveSegmentMemberIds(churchId, segment)).length;
}
