import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { adminNotifications, events, members, ministryApplications } from "../db/schema.js";
import { churchIdForUser } from "../lib/tenant.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const [summary] = await db.execute(sql`SELECT
    (SELECT count(*)::int FROM ${members} WHERE ${members.churchId} = ${churchId}) AS members,
    (SELECT count(*)::int FROM ${ministryApplications} WHERE ${ministryApplications.churchId} = ${churchId}) AS applications,
    (SELECT count(*)::int FROM ${ministryApplications} WHERE ${ministryApplications.churchId} = ${churchId} AND ${ministryApplications.status} = 'PENDING') AS "pendingApplications",
    (SELECT count(*)::int FROM ${adminNotifications} WHERE ${adminNotifications.churchId} = ${churchId}) AS messages,
    (SELECT count(*)::int FROM ${adminNotifications} WHERE ${adminNotifications.churchId} = ${churchId} AND ${adminNotifications.status} IN ('SENT', 'PARTIALLY_FAILED', 'FAILED')) AS "sentMessages",
    (SELECT count(*)::int FROM ${events} WHERE ${events.churchId} = ${churchId} AND ${events.status} = 'PUBLISHED' AND ${events.startsAt} >= now()) AS "upcomingEvents"
  `);
  return c.json(summary);
});

export default app;