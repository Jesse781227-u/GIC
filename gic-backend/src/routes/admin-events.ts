import { Hono } from "hono";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { events } from "../db/schema.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);
app.get("/", async (c) => c.json({ events: await db.query.events.findMany({ orderBy: [desc(events.startsAt)] }) }));
app.post("/", async (c) => {
  const parsed = z.object({ title: z.string().trim().min(1), description: z.string().optional(), startsAt: z.string().datetime(), location: z.string().optional(), status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT") }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  const [event] = await db.insert(events).values({ ...parsed.data, startsAt: new Date(parsed.data.startsAt), createdBy: c.get("user").sub }).returning();
  return c.json({ event }, 201);
});
export default app;