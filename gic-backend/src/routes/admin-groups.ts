import { Hono, type Context } from "hono";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { cells, cellMemberships, eventRegistrations, events, members, ministries, ministryMemberships, segments, segmentMemberships } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";
import { countSegmentMembers, isEligibleForCell, resolveSegmentMemberIds } from "../services/member-groups.service.js";
import type { GroupRules } from "../services/member-group-rules.js";
import { recordActivity } from "../services/activity.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);
const conditionSchema = z.object({
  field: z.enum(["gender", "age", "joined_within_months", "ministry_id", "cell_id", "center", "membership_status"]),
  operator: z.enum(["equals", "within", "between"]),
  value: z.union([z.string(), z.number()]).optional(),
  min: z.number().int().min(0).max(120).optional(),
  max: z.number().int().min(0).max(120).optional(),
});
const rulesSchema = z.object({ logic: z.enum(["and", "or"]).default("and"), conditions: z.array(conditionSchema).max(20).default([]) });
const groupSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional().nullable(), imageUrl: z.string().trim().max(1000).optional().nullable(), active: z.boolean().optional() });

async function validateRulesForChurch(churchId: string, rules: GroupRules, allowRelations: boolean) {
  for (const condition of rules.conditions || []) {
    if ((condition.field === "ministry_id" || condition.field === "cell_id") && !allowRelations) return "Cell eligibility rules may only use member profile attributes.";
    if (condition.field === "ministry_id") {
      if (typeof condition.value !== "string" || !await db.query.ministries.findFirst({ where: and(eq(ministries.id, condition.value), eq(ministries.churchId, churchId), eq(ministries.active, true)) })) return "A segment ministry rule references an unavailable ministry.";
    }
    if (condition.field === "cell_id") {
      if (typeof condition.value !== "string" || !await db.query.cells.findFirst({ where: and(eq(cells.id, condition.value), eq(cells.churchId, churchId), eq(cells.active, true)) })) return "A segment cell rule references an unavailable cell.";
    }
  }
  return null;
}

async function ensureStandardSegments(churchId: string, actor: string) {
  const standards = [
    { name: "All Members", description: "All active members of this church.", rules: { conditions: [] } },
    { name: "New Members", description: "Members who joined within the configured number of months.", rules: { conditions: [{ field: "joined_within_months", operator: "within", value: 5 }] } },
    { name: "Male Members", description: "Members whose profile gender is male.", rules: { conditions: [{ field: "gender", operator: "equals", value: "male" }] } },
    { name: "Female Members", description: "Members whose profile gender is female.", rules: { conditions: [{ field: "gender", operator: "equals", value: "female" }] } },
  ];
  for (const item of standards) await db.insert(segments).values({ churchId, ...item, segmentType: "automatic", isSystem: true, createdBy: actor }).onConflictDoNothing();
  const standardCells = [
    { name: "Men's Fellowship", description: "Fellowship for eligible male members.", eligibilityRules: { conditions: [{ field: "gender", operator: "equals", value: "male" }] } },
    { name: "Women's Fellowship", description: "Fellowship for eligible female members.", eligibilityRules: { conditions: [{ field: "gender", operator: "equals", value: "female" }] } },
  ];
  for (const item of standardCells) await db.insert(cells).values({ churchId, ...item }).onConflictDoNothing();
}

async function logGroupAction(c: Context, action: string, name: string, id?: string) {
  const user = c.get("user");
  await recordActivity({ churchId: churchIdForUser(user), actorId: user.sub, actorName: user.name, action, target: name, targetId: id });
}

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const [ministryRows, cellRows, segmentRows] = await Promise.all([
    db.query.ministries.findMany({ where: eq(ministries.churchId, churchId) }),
    db.query.cells.findMany({ where: eq(cells.churchId, churchId) }),
    (async () => { await ensureStandardSegments(churchId, c.get("user").sub); return db.query.segments.findMany({ where: eq(segments.churchId, churchId) }); })(),
  ]);
  const [ministryCounts, cellCounts] = await Promise.all([
    db.select({ groupId: ministryMemberships.ministryId, value: count() }).from(ministryMemberships).where(eq(ministryMemberships.churchId, churchId)).groupBy(ministryMemberships.ministryId),
    db.select({ groupId: cellMemberships.cellId, value: count() }).from(cellMemberships).where(eq(cellMemberships.churchId, churchId)).groupBy(cellMemberships.cellId),
  ]);
  const ministryCountMap = new Map(ministryCounts.map((row) => [row.groupId, Number(row.value)]));
  const cellCountMap = new Map(cellCounts.map((row) => [row.groupId, Number(row.value)]));
  return c.json({
    ministries: ministryRows.map((item) => ({ ...item, memberCount: ministryCountMap.get(item.id) || 0 })),
    cells: cellRows.map((item) => ({ ...item, memberCount: cellCountMap.get(item.id) || 0 })),
    segments: await Promise.all(segmentRows.map(async (item) => ({ ...item, memberCount: await countSegmentMembers(churchId, item) }))),
  });
});

app.get("/audiences", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const actor = c.get("user").sub;
  await ensureStandardSegments(churchId, actor);
  const [memberCount, ministryRows, cellRows, segmentRows, eventRows] = await Promise.all([
    db.select({ value: count() }).from(members).where(and(eq(members.churchId, churchId), eq(members.active, true))),
    db.query.ministries.findMany({ where: and(eq(ministries.churchId, churchId), eq(ministries.active, true)) }),
    db.query.cells.findMany({ where: and(eq(cells.churchId, churchId), eq(cells.active, true)) }),
    db.query.segments.findMany({ where: and(eq(segments.churchId, churchId), eq(segments.active, true)) }),
    db.query.events.findMany({ where: and(eq(events.churchId, churchId), eq(events.status, "PUBLISHED")) }),
  ]);
  const choices = [{ kind: "everyone", id: "", name: "All Members", memberCount: Number(memberCount[0]?.value || 0) }];
  for (const item of segmentRows) {
    if (item.name !== "All Members") choices.push({ kind: "segment", id: item.id, name: item.name, memberCount: await countSegmentMembers(churchId, item) });
  }
  for (const item of ministryRows) {
    const [result] = await db.select({ value: count() }).from(ministryMemberships).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, item.id)));
    choices.push({ kind: "ministry", id: item.id, name: item.name, memberCount: Number(result?.value || 0) });
  }
  for (const item of cellRows) {
    const [result] = await db.select({ value: count() }).from(cellMemberships).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, item.id)));
    choices.push({ kind: "cell", id: item.id, name: item.name, memberCount: Number(result?.value || 0) });
  }
  for (const item of eventRows) {
    const [result] = await db.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, item.id), eq(eventRegistrations.status, "CONFIRMED")));
    choices.push({ kind: "event_registrants", id: item.id, name: `${item.title} Registrants`, memberCount: Number(result?.value || 0) });
  }
  return c.json({ audiences: choices });
});

app.post("/segments", async (c) => {
  const parsed = z.object({ ...groupSchema.shape, segmentType: z.enum(["automatic", "manual"]), rules: rulesSchema.optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid segment", details: parsed.error.issues }, 400);
  if (parsed.data.segmentType === "automatic" && !parsed.data.rules) return c.json({ error: "Automatic segments require rules." }, 400);
  const churchId = churchIdForUser(c.get("user"));
  if (parsed.data.rules) {
    const rulesError = await validateRulesForChurch(churchId, parsed.data.rules, true);
    if (rulesError) return c.json({ error: rulesError }, 400);
  }
  const [segment] = await db.insert(segments).values({ churchId, name: parsed.data.name, description: parsed.data.description, segmentType: parsed.data.segmentType, rules: parsed.data.segmentType === "automatic" ? parsed.data.rules : { conditions: [] }, isSystem: false, createdBy: c.get("user").sub }).returning();
  await logGroupAction(c, "Created segment", segment.name, segment.id);
  return c.json({ segment, memberCount: 0 }, 201);
});

app.patch("/segments/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({ name: groupSchema.shape.name.optional(), description: groupSchema.shape.description, active: z.boolean().optional(), rules: rulesSchema.optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid segment", details: parsed.error.issues }, 400);
  const current = await db.query.segments.findFirst({ where: and(eq(segments.id, c.req.param("id")), eq(segments.churchId, churchId)) });
  if (!current) return c.json({ error: "Segment not found" }, 404);
  if (parsed.data.rules) {
    const rulesError = await validateRulesForChurch(churchId, parsed.data.rules, true);
    if (rulesError) return c.json({ error: rulesError }, 400);
  }
  if (current.isSystem && parsed.data.active === false) return c.json({ error: "System segments cannot be deactivated." }, 403);
  if (current.isSystem && parsed.data.name && parsed.data.name !== current.name) return c.json({ error: "System segment names cannot be changed." }, 403);
  const [segment] = await db.update(segments).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(segments.id, current.id), eq(segments.churchId, churchId))).returning();
  await logGroupAction(c, current.isSystem ? "Updated system segment" : "Updated segment", segment.name, segment.id);
  return c.json({ segment, memberCount: await countSegmentMembers(churchId, segment) });
});

app.delete("/segments/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const segment = await db.query.segments.findFirst({ where: and(eq(segments.id, c.req.param("id")), eq(segments.churchId, churchId)) });
  if (!segment) return c.json({ error: "Segment not found" }, 404);
  if (segment.isSystem) return c.json({ error: "System segments cannot be deactivated." }, 403);
  const [updated] = await db.update(segments).set({ active: false, updatedAt: new Date() }).where(and(eq(segments.id, segment.id), eq(segments.churchId, churchId))).returning();
  await logGroupAction(c, "Deactivated segment", segment.name, segment.id);
  return c.json({ segment: updated });
});

app.get("/segments/:id/members", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const segment = await db.query.segments.findFirst({ where: and(eq(segments.id, c.req.param("id")), eq(segments.churchId, churchId), eq(segments.active, true)) });
  if (!segment) return c.json({ error: "Segment not found" }, 404);
  const ids = await resolveSegmentMemberIds(churchId, segment);
  const records = ids.length ? await db.query.members.findMany({ where: and(eq(members.churchId, churchId), (await import("drizzle-orm")).inArray(members.id, ids)) }) : [];
  return c.json({ members: records, memberCount: records.length });
});

app.post("/segments/:id/members", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = z.object({ memberId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Member ID is required." }, 400);
  const segment = await db.query.segments.findFirst({ where: and(eq(segments.id, c.req.param("id")), eq(segments.churchId, churchId), eq(segments.active, true)) });
  if (!segment) return c.json({ error: "Segment not found" }, 404);
  if (segment.segmentType !== "manual") return c.json({ error: "Members can only be assigned explicitly to manual segments." }, 409);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, parsed.data.memberId), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member not found" }, 404);
  const [membership] = await db.insert(segmentMemberships).values({ churchId, segmentId: segment.id, memberId: member.id }).onConflictDoNothing().returning();
  await logGroupAction(c, "Added member to manual segment", segment.name, member.id);
  return c.json({ membership: membership || null, alreadyMember: !membership }, membership ? 201 : 200);
});

app.delete("/segments/:id/members/:memberId", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const segment = await db.query.segments.findFirst({ where: and(eq(segments.id, c.req.param("id")), eq(segments.churchId, churchId), eq(segments.segmentType, "manual")) });
  if (!segment) return c.json({ error: "Manual segment not found" }, 404);
  await db.delete(segmentMemberships).where(and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.segmentId, segment.id), eq(segmentMemberships.memberId, c.req.param("memberId"))));
  await logGroupAction(c, "Removed member from manual segment", segment.name, c.req.param("memberId"));
  return c.json({ success: true });
});

app.post("/ministries", async (c) => {
  const parsed = groupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid ministry", details: parsed.error.issues }, 400);
  const churchId = churchIdForUser(c.get("user"));
  const [ministry] = await db.insert(ministries).values({ churchId, ...parsed.data }).returning();
  await logGroupAction(c, "Created ministry", ministry.name, ministry.id);
  return c.json({ ministry }, 201);
});

app.patch("/ministries/:id", async (c) => updateGroup(c, "ministry"));
app.patch("/cells/:id", async (c) => updateGroup(c, "cell"));
app.delete("/ministries/:id", async (c) => deactivateGroup(c, "ministry"));
app.delete("/cells/:id", async (c) => deactivateGroup(c, "cell"));
app.get("/ministries/:id/members", async (c) => listGroupMembers(c, "ministry"));
app.get("/cells/:id/members", async (c) => listGroupMembers(c, "cell"));

async function deactivateGroup(c: Context, kind: "ministry" | "cell") {
  const churchId = churchIdForUser(c.get("user"));
  const groupId = c.req.param("id") || "";
  if (kind === "ministry") {
    const [group] = await db.update(ministries).set({ active: false, updatedAt: new Date() }).where(and(eq(ministries.id, groupId), eq(ministries.churchId, churchId))).returning();
    if (!group) return c.json({ error: "Ministry not found" }, 404);
    await logGroupAction(c, "Deactivated ministry", group.name, group.id);
    return c.json({ ministry: group });
  }
  const [group] = await db.update(cells).set({ active: false, updatedAt: new Date() }).where(and(eq(cells.id, groupId), eq(cells.churchId, churchId))).returning();
  if (!group) return c.json({ error: "Cell not found" }, 404);
  await logGroupAction(c, "Deactivated cell", group.name, group.id);
  return c.json({ cell: group });
}

async function listGroupMembers(c: Context, kind: "ministry" | "cell") {
  const churchId = churchIdForUser(c.get("user"));
  const groupId = c.req.param("id") || "";
  const memberIds = kind === "ministry"
    ? (await db.query.ministryMemberships.findMany({ where: and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.ministryId, groupId)) })).map((row) => row.memberId)
    : (await db.query.cellMemberships.findMany({ where: and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.cellId, groupId)) })).map((row) => row.memberId);
  const result = memberIds.length ? await db.query.members.findMany({ where: and(eq(members.churchId, churchId), inArray(members.id, memberIds)) }) : [];
  return c.json({ members: result });
}
async function updateGroup(c: any, kind: "ministry" | "cell") {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = groupSchema.partial().extend(kind === "cell" ? { eligibilityRules: rulesSchema.optional() } : {}).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid group", details: parsed.error.issues }, 400);
  if (kind === "cell" && parsed.data.eligibilityRules) {
    const rulesError = await validateRulesForChurch(churchId, parsed.data.eligibilityRules, false);
    if (rulesError) return c.json({ error: rulesError }, 400);
  }
  const current = kind === "ministry"
    ? await db.query.ministries.findFirst({ where: and(eq(ministries.id, c.req.param("id")), eq(ministries.churchId, churchId)) })
    : await db.query.cells.findFirst({ where: and(eq(cells.id, c.req.param("id")), eq(cells.churchId, churchId)) });
  if (!current) return c.json({ error: "Group not found" }, 404);
  const [group] = kind === "ministry"
    ? await db.update(ministries).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(ministries.id, current.id), eq(ministries.churchId, churchId))).returning()
    : await db.update(cells).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(cells.id, current.id), eq(cells.churchId, churchId))).returning();
  await logGroupAction(c, `Updated ${kind}`, group.name, group.id);
  return c.json({ [kind]: group });
}

app.post("/cells", async (c) => {
  const parsed = groupSchema.extend({ eligibilityRules: rulesSchema.optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid cell", details: parsed.error.issues }, 400);
  const churchId = churchIdForUser(c.get("user"));
  if (parsed.data.eligibilityRules) {
    const rulesError = await validateRulesForChurch(churchId, parsed.data.eligibilityRules, false);
    if (rulesError) return c.json({ error: rulesError }, 400);
  }
  const [cell] = await db.insert(cells).values({ churchId, ...parsed.data, eligibilityRules: parsed.data.eligibilityRules || { conditions: [] } }).returning();
  await logGroupAction(c, "Created cell", cell.name, cell.id);
  return c.json({ cell }, 201);
});

app.post("/ministries/:id/members", async (c) => changeMembership(c, "ministry", true));
app.delete("/ministries/:id/members/:memberId", async (c) => changeMembership(c, "ministry", false));
app.post("/cells/:id/members", async (c) => changeMembership(c, "cell", true));
app.delete("/cells/:id/members/:memberId", async (c) => changeMembership(c, "cell", false));
async function changeMembership(c: any, kind: "ministry" | "cell", add: boolean) {
  const churchId = churchIdForUser(c.get("user"));
  const group = kind === "ministry"
    ? await db.query.ministries.findFirst({ where: and(eq(ministries.id, c.req.param("id")), eq(ministries.churchId, churchId)) })
    : await db.query.cells.findFirst({ where: and(eq(cells.id, c.req.param("id")), eq(cells.churchId, churchId)) });
  if (!group) return c.json({ error: "Group not found" }, 404);
  const input = add ? z.object({ memberId: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({}))) : { success: true as const, data: { memberId: c.req.param("memberId") } };
  if (!input.success) return c.json({ error: "Member ID is required." }, 400);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, input.data.memberId), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member not found" }, 404);
  if (kind === "cell" && add && !isEligibleForCell(member, (group as typeof cells.$inferSelect).eligibilityRules as GroupRules)) return c.json({ error: "Member does not meet cell eligibility requirements." }, 403);
  const memberships = kind === "ministry" ? ministryMemberships : cellMemberships;
  const groupField = kind === "ministry" ? ministryMemberships.ministryId : cellMemberships.cellId;
  if (add) await db.insert(memberships).values({ churchId, [kind === "ministry" ? "ministryId" : "cellId"]: group.id, memberId: member.id }).onConflictDoNothing();
  else await db.delete(memberships).where(and(eq(memberships.churchId, churchId), eq(groupField, group.id), eq(memberships.memberId, member.id)));
  await logGroupAction(c, `${add ? "Changed" : "Removed"} ${kind} membership`, group.name, member.id);
  return c.json({ success: true });
}

app.get("/members/:id", async (c) => {
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
  const memberSegments: string[] = [];
  for (const segment of segmentRows) if (segment.segmentType === "manual" ? manualIds.has(segment.id) : (await resolveSegmentMemberIds(churchId, segment)).includes(member.id)) memberSegments.push(segment.name);
  return c.json({ groups: { ministries: ministryRows, cells: cellRows, segments: memberSegments } });
});

export default app;
