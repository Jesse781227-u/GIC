import { Hono } from "hono";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { cells, cellMemberships, events, members, ministries, ministryApplications, ministryMemberships, organizationLeaders } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { recordActivity } from "../services/activity.service.js";
import { ensureMemberAppMinistries, ensureYouthFellowship } from "../services/ministry-catalog.service.js";
import { flagIneligibleCellMembersForReview, isEligibleForCell } from "../services/member-groups.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);
const kinds = ["ministry", "unit", "fellowship", "cell", "other"] as const;
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(kinds),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  applicationRequired: z.boolean().optional(),
  eligibilityRules: z.object({ logic: z.enum(["and", "or"]).optional(), conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.unknown().optional(), min: z.number().optional(), max: z.number().optional() })).optional() }).optional(),
});

function isCellType(type: string) { return type === "cell" || type === "fellowship"; }
function orgKey(kind: string, id: string) { return `${kind}_${id}`; }
async function getOrganization(churchId: string, kind: string, id: string) {
  if (kind === "ministry" || kind === "unit" || kind === "other") {
    const item = await db.query.ministries.findFirst({ where: and(eq(ministries.id, id), eq(ministries.churchId, churchId)) });
    return item ? { ...item, id: item.id, kind: "ministry", type: item.organizationType } : null;
  }
  if (kind === "cell" || kind === "fellowship") {
    const item = await db.query.cells.findFirst({ where: and(eq(cells.id, id), eq(cells.churchId, churchId)) });
    return item ? { ...item, id: item.id, kind: "cell", type: item.organizationType } : null;
  }
  return null;
}
async function membershipCount(churchId: string, kind: string, id: string) {
  const table = kind === "ministry" ? ministryMemberships : cellMemberships;
  const groupColumn = kind === "ministry" ? ministryMemberships.ministryId : cellMemberships.cellId;
  const [result] = await db.select({ value: count() }).from(table).where(and(eq(table.churchId, churchId), eq(groupColumn, id)));
  return Number(result?.value || 0);
}
async function log(c: any, action: string, name: string, id: string, metadata?: Record<string, unknown>) {
  const user = c.get("user");
  await recordActivity({ churchId: churchIdForUser(user), actorId: user.sub, actorName: user.name, action, target: name, targetId: id, metadata });
}

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  await ensureMemberAppMinistries(churchId);
  await ensureYouthFellowship(churchId);
  const [ministryRows, cellRows, leaderRows, upcomingRows] = await Promise.all([
    db.query.ministries.findMany({ where: eq(ministries.churchId, churchId), orderBy: [desc(ministries.updatedAt)] }),
    db.query.cells.findMany({ where: eq(cells.churchId, churchId), orderBy: [desc(cells.updatedAt)] }),
    db.select({ organizationKind: organizationLeaders.organizationKind, organizationId: organizationLeaders.organizationId, memberId: organizationLeaders.memberId, role: organizationLeaders.role, name: members.displayName }).from(organizationLeaders).innerJoin(members, eq(organizationLeaders.memberId, members.id)).where(eq(organizationLeaders.churchId, churchId)),
    db.query.events.findMany({ where: and(eq(events.churchId, churchId), gte(events.startsAt, new Date())) }),
  ]);
  const organizations = await Promise.all([
    ...ministryRows.map(async (item) => ({ ...item, id: orgKey("ministry", item.id), kind: "ministry", type: item.organizationType || "ministry", memberCount: await membershipCount(churchId, "ministry", item.id), leaders: leaderRows.filter((row) => row.organizationKind === "ministry" && row.organizationId === item.id).map((row) => ({ id: row.memberId, name: row.name || "Member", role: row.role })), upcomingEventCount: upcomingRows.filter((event) => event.organizationKind === "ministry" && event.organizationId === item.id).length })),
    ...cellRows.map(async (item) => ({ ...item, id: orgKey("cell", item.id), kind: "cell", type: item.organizationType || "cell", memberCount: await membershipCount(churchId, "cell", item.id), leaders: leaderRows.filter((row) => row.organizationKind === "cell" && row.organizationId === item.id).map((row) => ({ id: row.memberId, name: row.name || "Member", role: row.role })), upcomingEventCount: upcomingRows.filter((event) => event.organizationKind === "cell" && event.organizationId === item.id).length })),
  ]);
  return c.json({ organizations });
});

app.post("/", async (c) => {
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid organization", details: parsed.error.issues }, 400);
  const churchId = churchIdForUser(c.get("user"));
  const { type, ...data } = parsed.data;
  const cellType = isCellType(type);
  const [item] = cellType
    ? await db.insert(cells).values({ churchId, name: data.name, description: data.description ?? null, imageUrl: data.imageUrl ?? null, active: data.active ?? true, organizationType: type, applicationRequired: data.applicationRequired ?? false, eligibilityRules: data.eligibilityRules || { conditions: [] } }).returning()
    : await db.insert(ministries).values({ churchId, name: data.name, description: data.description ?? null, imageUrl: data.imageUrl ?? null, active: data.active ?? true, organizationType: type, applicationRequired: data.applicationRequired ?? true }).returning();
  const kind = cellType ? "cell" : "ministry";
  await log(c, "Created organization", item.name, item.id, { type });
  return c.json({ organization: { ...item, id: orgKey(kind, item.id), kind, type } }, 201);
});

app.get("/:kind/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const organization = await getOrganization(churchId, kind, id);
  if (!organization) return c.json({ error: "Organization not found" }, 404);
  const [memberships, leaders, associatedEvents, applications] = await Promise.all([
    kind === "ministry"
      ? db.select({ member: members, joinedAt: ministryMemberships.createdAt }).from(ministryMemberships).innerJoin(members, eq(ministryMemberships.memberId, members.id)).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, id)))
      : db.select({ member: members, joinedAt: cellMemberships.createdAt }).from(cellMemberships).innerJoin(members, eq(cellMemberships.memberId, members.id)).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, id))),
    db.select({ memberId: organizationLeaders.memberId, role: organizationLeaders.role, name: members.displayName, phone: members.phone, avatar: members.avatar }).from(organizationLeaders).innerJoin(members, eq(organizationLeaders.memberId, members.id)).where(and(eq(organizationLeaders.churchId, churchId), eq(organizationLeaders.organizationKind, kind), eq(organizationLeaders.organizationId, id))),
    db.query.events.findMany({ where: and(eq(events.churchId, churchId), eq(events.organizationKind, kind), eq(events.organizationId, id)), orderBy: [desc(events.startsAt)] }),
    kind === "ministry"
      ? db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.ministryId, id)), orderBy: [desc(ministryApplications.createdAt)] })
      : db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.cellId, id)), orderBy: [desc(ministryApplications.createdAt)] }),
  ]);
  return c.json({ organization, members: memberships.map((row: any) => ({ ...row.member, membershipCreatedAt: row.joinedAt })), leaders: leaders.map((row) => ({ id: row.memberId, name: row.name || "Member", phone: row.phone, avatar: row.avatar, role: row.role })), events: associatedEvents, applications });
});

app.patch("/:kind/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const parsed = inputSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid organization update", details: parsed.error.issues }, 400);
  const current = await getOrganization(churchId, kind, id);
  if (!current) return c.json({ error: "Organization not found" }, 404);
  const { type, ...data } = parsed.data;
  const nextType = type || current.type;
  const targetCell = isCellType(nextType);
  if (targetCell !== (kind === "cell")) return c.json({ error: "Organization kind cannot change after creation." }, 400);
  const [updated] = kind === "ministry"
    ? await db.update(ministries).set({ ...data, organizationType: nextType, updatedAt: new Date() }).where(and(eq(ministries.id, id), eq(ministries.churchId, churchId))).returning()
    : await db.update(cells).set({ ...data, organizationType: nextType, updatedAt: new Date() }).where(and(eq(cells.id, id), eq(cells.churchId, churchId))).returning();
  if (kind === "cell" && parsed.data.eligibilityRules) await flagIneligibleCellMembersForReview(churchId, id, parsed.data.eligibilityRules as any);
  await log(c, parsed.data.active === false ? "Deactivated organization" : "Updated organization", updated.name, id, { type: nextType });
  return c.json({ organization: { ...updated, id: orgKey(kind, id), kind, type: nextType } });
});

app.post("/:kind/:id/leaders", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const parsed = z.object({ memberId: z.string().min(1), role: z.string().trim().min(1).max(80).default("Leader") }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success || !await getOrganization(churchId, kind, id)) return c.json({ error: "Invalid organization or leader" }, 400);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, parsed.data.memberId), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Member not found" }, 404);
  await db.insert(organizationLeaders).values({ churchId, organizationKind: kind, organizationId: id, memberId: member.id, role: parsed.data.role }).onConflictDoNothing();
  await log(c, "Assigned organization leader", member.displayName, member.id, { organizationId: id, organizationKind: kind, role: parsed.data.role });
  return c.json({ success: true }, 201);
});

app.delete("/:kind/:id/leaders/:memberId", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const { kind, id, memberId } = c.req.param();
  await db.delete(organizationLeaders).where(and(eq(organizationLeaders.churchId, churchId), eq(organizationLeaders.organizationKind, kind), eq(organizationLeaders.organizationId, id), eq(organizationLeaders.memberId, memberId)));
  await log(c, "Removed organization leader", memberId, memberId, { organizationId: id, organizationKind: kind });
  return c.json({ success: true });
});

app.post("/:kind/:id/members", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const { kind, id } = c.req.param();
  const parsed = z.object({ memberId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  const organization = await getOrganization(churchId, kind, id);
  if (!parsed.success || !organization) return c.json({ error: "Invalid organization or member" }, 400);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, parsed.data.memberId), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member not found" }, 404);
  if (kind === "cell") {
    const rules = ("eligibilityRules" in organization ? organization.eligibilityRules : {}) as any;
    if (!isEligibleForCell(member, rules)) return c.json({ error: "Member does not meet organization eligibility requirements." }, 403);
    await db.insert(cellMemberships).values({ churchId, cellId: id, memberId: member.id }).onConflictDoNothing();
  } else await db.insert(ministryMemberships).values({ churchId, ministryId: id, memberId: member.id }).onConflictDoNothing();
  await log(c, "Added organization member", member.displayName, member.id, { organizationId: id, organizationKind: kind });
  return c.json({ success: true }, 201);
});

app.delete("/:kind/:id/members/:memberId", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const { kind, id, memberId } = c.req.param();
  if (kind === "cell") await db.delete(cellMemberships).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, id), eq(cellMemberships.memberId, memberId)));
  else await db.delete(ministryMemberships).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, id), eq(ministryMemberships.memberId, memberId)));
  await log(c, "Removed organization member", memberId, memberId, { organizationId: id, organizationKind: kind });
  return c.json({ success: true });
});

app.patch("/:kind/:id/applications/:applicationId", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const { kind, id, applicationId } = c.req.param();
  const parsed = z.object({ status: z.enum(["APPROVED", "DECLINED"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid application status" }, 400);
  const application = await db.query.ministryApplications.findFirst({ where: and(eq(ministryApplications.id, applicationId), eq(ministryApplications.churchId, churchId), kind === "cell" ? eq(ministryApplications.cellId, id) : eq(ministryApplications.ministryId, id)) });
  if (!application) return c.json({ error: "Application not found" }, 404);
  if (application.status !== "PENDING") return c.json({ error: "Application has already been decided" }, 409);
  let eligibleCell: typeof cells.$inferSelect | null | undefined;
  if (parsed.data.status === "APPROVED" && kind === "cell") {
    const [cell, member] = await Promise.all([
      db.query.cells.findFirst({ where: and(eq(cells.id, id), eq(cells.churchId, churchId)) }),
      db.query.members.findFirst({ where: and(eq(members.id, application.memberId), eq(members.churchId, churchId), eq(members.active, true)) }),
    ]);
    if (!cell || !member || !isEligibleForCell(member, cell.eligibilityRules as any)) return c.json({ error: "Applicant no longer meets this fellowship or cell's eligibility requirements." }, 409);
    eligibleCell = cell;
  }
  const [updated] = await db.update(ministryApplications).set({ status: parsed.data.status, decidedAt: new Date(), decidedBy: c.get("user").sub, updatedAt: new Date() }).where(eq(ministryApplications.id, application.id)).returning();
  if (parsed.data.status === "APPROVED") {
    if (kind === "cell" && eligibleCell) {
      await db.insert(cellMemberships).values({ churchId, cellId: id, memberId: application.memberId }).onConflictDoNothing();
    }
    else await db.insert(ministryMemberships).values({ churchId, ministryId: id, memberId: application.memberId, source: "application" }).onConflictDoNothing();
  }
  await log(c, parsed.data.status === "APPROVED" ? "Approved organization application" : "Rejected organization application", application.memberName, application.memberId, { applicationId: application.id, organizationId: id, organizationKind: kind });
  return c.json({ application: updated });
});

export default app;
