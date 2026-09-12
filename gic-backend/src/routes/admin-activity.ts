import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);
app.get("/", async (c) => c.json({ items: await db.query.activityLogs.findMany({ orderBy: [desc(activityLogs.createdAt)], limit: 200 }) }));
export default app;
