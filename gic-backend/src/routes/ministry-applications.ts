import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  birthdayNotificationSends,
  memberMergeLogs,
  members,
  ministryApplications,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushDevices,
  serviceReminders,
  cellMemberships,
  ministries,
  ministryMemberships,
  segmentMemberships,
} from "../db/schema.js";
import { recordActivity } from "../services/activity.service.js";
import { churchIdForUser } from "../lib/tenant.js";
import { resolveSegmentMemberIds } from "../services/member-groups.service.js";

const memberApp = new Hono();
memberApp.use("*", authMiddleware);

memberApp.post("/", async (c) => {
  const parsed = z.object({
    ministryId: z.string().uuid().optional(),
    ministry: z.string().min(1).optional(),
    message: z.string().trim().min(10).max(1000),
  }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid application" }, 400);

  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const ministry = parsed.data.ministryId
    ? await db.query.ministries.findFirst({ where: and(eq(ministries.id, parsed.data.ministryId), eq(ministries.churchId, churchId), eq(ministries.active, true)) })
    : parsed.data.ministry ? await db.query.ministries.findFirst({ where: and(eq(ministries.name, parsed.data.ministry), eq(ministries.churchId, churchId), eq(ministries.active, true)) }) : null;
  if (!ministry) return c.json({ error: "Ministry not found" }, 404);
  const existing = await db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.memberId, user.sub), eq(ministryApplications.ministryId, ministry.id), inArray(ministryApplications.status, ["PENDING", "APPROVED"])) });
  if (existing.some((item) => item.status === "PENDING")) return c.json({ error: "A pending request already exists for this ministry" }, 409);
  if (existing.some((item) => item.status === "APPROVED")) return c.json({ error: "You already belong to this ministry" }, 409);
  const [application] = await db.insert(ministryApplications).values({
    churchId,
    memberId: user.sub,
    memberName: member.displayName,
    ministryId: ministry.id,
    ministry: ministry.name,
    message: parsed.data.message,
  }).returning();
  return c.json({ application }, 201);
});

memberApp.get("/", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const applications = await db.query.ministryApplications.findMany({
    where: and(eq(ministryApplications.churchId, churchId), eq(ministryApplications.memberId, user.sub)),
    orderBy: [desc(ministryApplications.createdAt)],
  });
  return c.json({ applications });
});

const adminApp = new Hono();
adminApp.use("*", authMiddleware, adminMiddleware);
adminApp.get("/members", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const records = await db.query.members.findMany({ where: eq(members.churchId, churchId), orderBy: (table, { desc }) => [desc(table.createdAt)] });
  return c.json({ members: records });
});
adminApp.delete("/members/:id", async (c) => {
  const memberId = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const member = await db.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Member not found" }, 404);

  await db.transaction(async (tx) => {
    await tx.delete(notificationDeliveries).where(eq(notificationDeliveries.memberId, memberId));
    await tx.delete(notifications).where(and(eq(notifications.memberId, memberId), eq(notifications.churchId, churchId)));
    await tx.delete(pushDevices).where(and(eq(pushDevices.memberId, memberId), eq(pushDevices.churchId, churchId)));
    await tx.delete(notificationPreferences).where(and(eq(notificationPreferences.memberId, memberId), eq(notificationPreferences.churchId, churchId)));
    await tx.delete(serviceReminders).where(eq(serviceReminders.memberId, memberId));
    await tx.delete(birthdayNotificationSends).where(eq(birthdayNotificationSends.memberId, memberId));
    await tx.delete(ministryApplications).where(eq(ministryApplications.memberId, memberId));
    await tx.delete(ministryMemberships).where(and(eq(ministryMemberships.churchId, churchId), eq(ministryMemberships.memberId, memberId)));
    await tx.delete(cellMemberships).where(and(eq(cellMemberships.churchId, churchId), eq(cellMemberships.memberId, memberId)));
    await tx.delete(segmentMemberships).where(and(eq(segmentMemberships.churchId, churchId), eq(segmentMemberships.memberId, memberId)));
    await tx.delete(members).where(and(eq(members.id, memberId), eq(members.churchId, churchId)));
  });

  await recordActivity({
    churchId,
    actorId: c.get("user").sub,
    actorName: c.get("user").name,
    action: "Deleted member",
    target: member.displayName,
    targetId: memberId,
  });

  return c.json({ success: true, deletedMemberId: memberId });
});
adminApp.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const [applications, memberRecords] = await Promise.all([
    db.query.ministryApplications.findMany({ where: eq(ministryApplications.churchId, churchId), orderBy: [desc(ministryApplications.createdAt)] }),
    db.query.members.findMany({ where: eq(members.churchId, churchId) }),
  ]);
  const byId = new Map(memberRecords.map((member) => [member.id, member]));
  return c.json({ applications: applications.map((application) => {
    const member = byId.get(application.memberId);
    return { ...application, applicant: member ? { id: member.id, name: member.displayName, phone: member.phone, email: member.email, avatar: member.avatar, ministries: member.ministries, center: member.center, joinedMonth: member.joinedMonth, joinedYear: member.joinedYear } : null };
  }) });
});
adminApp.get("/members/merge-logs", async (c) => c.json({ merges: await db.query.memberMergeLogs.findMany({ where: eq(memberMergeLogs.churchId, churchIdForUser(c.get("user"))), orderBy: [desc(memberMergeLogs.createdAt)] }) }));
adminApp.patch("/:id", async (c) => {
  const parsed = z.object({ status: z.enum(["PENDING", "APPROVED", "DECLINED"]) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid status" }, 400);
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const current = await db.query.ministryApplications.findFirst({ where: and(eq(ministryApplications.id, c.req.param("id")), eq(ministryApplications.churchId, churchId)) });
  if (!current) return c.json({ error: "Application not found" }, 404);
  if (current.status !== "PENDING") return c.json({ error: "Application has already been decided" }, 409);
  let [application] = await db.update(ministryApplications).set({ status: parsed.data.status, decidedAt: new Date(), decidedBy: user.sub, updatedAt: new Date() }).where(eq(ministryApplications.id, current.id)).returning();
  if (parsed.data.status === "APPROVED") {
    if (!current.ministryId) return c.json({ error: "This legacy application is not linked to an active ministry." }, 409);
    await db.insert(ministryMemberships).values({ churchId, ministryId: current.ministryId, memberId: current.memberId, source: "application" }).onConflictDoNothing();
  }
  await recordActivity({ churchId, actorId: user.sub, actorName: user.name, action: parsed.data.status === "APPROVED" ? "Approved ministry application" : "Declined ministry application", target: current.ministry, targetId: current.memberId, metadata: { applicationId: current.id } });
  return c.json({ application });
});

export { memberApp, adminApp };
