import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ministryApplications } from "../db/schema.js";
import { members } from "../db/schema.js";

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
adminApp.get("/", async (c) => c.json({ applications: await db.query.ministryApplications.findMany({ orderBy: [desc(ministryApplications.createdAt)] }) }));
adminApp.patch("/:id", async (c) => {
  const parsed = z.object({ status: z.enum(["PENDING", "APPROVED", "DECLINED"]) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid status" }, 400);
  const [application] = await db.update(ministryApplications).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(ministryApplications.id, c.req.param("id"))).returning();
  if (!application) return c.json({ error: "Application not found" }, 404);
  return c.json({ application });
});

export { memberApp, adminApp };