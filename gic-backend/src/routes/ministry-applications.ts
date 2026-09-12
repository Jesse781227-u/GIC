import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ministryApplications } from "../db/schema.js";
import { members, memberMergeLogs } from "../db/schema.js";

const memberApp = new Hono();
memberApp.use("*", authMiddleware);

memberApp.post("/", async (c) => {
  const parsed = z.object({
    ministry: z.string().min(1),
    message: z.string().trim().min(10).max(1000),
    memberName: z.string().min(1),
  }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid application" }, 400);

  const user = c.get("user");
  const existing = await db.query.ministryApplications.findMany({ where: and(eq(ministryApplications.memberId, user.sub), eq(ministryApplications.ministry, parsed.data.ministry), inArray(ministryApplications.status, ["PENDING", "APPROVED"])) });
  if (existing.some((item) => item.status === "PENDING")) return c.json({ error: "A pending request already exists for this ministry" }, 409);
  if (existing.some((item) => item.status === "APPROVED")) return c.json({ error: "You already belong to this ministry" }, 409);
  const [application] = await db.insert(ministryApplications).values({
    memberId: user.sub,
    memberName: parsed.data.memberName,
    ministry: parsed.data.ministry,
    message: parsed.data.message,
  }).returning();
  return c.json({ application }, 201);
});

memberApp.get("/", async (c) => {
  const user = c.get("user");
  const applications = await db.query.ministryApplications.findMany({
    where: eq(ministryApplications.memberId, user.sub),
    orderBy: [desc(ministryApplications.createdAt)],
  });
  return c.json({ applications });
});

const adminApp = new Hono();
adminApp.use("*", authMiddleware, adminMiddleware);
adminApp.get("/members", async (c) => {
  const records = await db.query.members.findMany({ orderBy: (table, { desc }) => [desc(table.createdAt)] });
  return c.json({ members: records });
});
adminApp.get("/", async (c) => {
  const [applications, memberRecords] = await Promise.all([
    db.query.ministryApplications.findMany({ orderBy: [desc(ministryApplications.createdAt)] }),
    db.query.members.findMany(),
  ]);
  const byId = new Map(memberRecords.map((member) => [member.id, member]));
  return c.json({ applications: applications.map((application) => {
    const member = byId.get(application.memberId);
    return { ...application, applicant: member ? { id: member.id, name: member.displayName, phone: member.phone, email: member.email, avatar: member.avatar, ministries: member.ministries, center: member.center, joinedMonth: member.joinedMonth, joinedYear: member.joinedYear } : null };
  }) });
});
adminApp.get("/members/merge-logs", async (c) => c.json({ merges: await db.query.memberMergeLogs.findMany({ orderBy: [desc(memberMergeLogs.createdAt)] }) }));
adminApp.patch("/:id", async (c) => {
  const parsed = z.object({ status: z.enum(["PENDING", "APPROVED", "DECLINED"]) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid status" }, 400);
  const user = c.get("user");
  const current = await db.query.ministryApplications.findFirst({ where: eq(ministryApplications.id, c.req.param("id")) });
  if (!current) return c.json({ error: "Application not found" }, 404);
  if (current.status !== "PENDING") return c.json({ error: "Application has already been decided" }, 409);
  let [application] = await db.update(ministryApplications).set({ status: parsed.data.status, decidedAt: new Date(), decidedBy: user.sub, updatedAt: new Date() }).where(eq(ministryApplications.id, current.id)).returning();
  if (parsed.data.status === "APPROVED") {
    const member = await db.query.members.findFirst({ where: eq(members.id, current.memberId) });
    const active = (member?.ministries || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (member && !active.includes(current.ministry)) {
      const [updatedMember] = await db.update(members).set({ ministries: [...active, current.ministry].join(", "), updatedAt: new Date() }).where(eq(members.id, member.id)).returning();
      if (!updatedMember) return c.json({ error: "Member could not be updated" }, 500);
    }
  }
  return c.json({ application });
});

export { memberApp, adminApp };
