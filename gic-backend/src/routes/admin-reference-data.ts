import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { busPickupPoints, churchLocations } from "../db/schema.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

app.get("/church-locations", async (c) => {
  const locations = await db.query.churchLocations.findMany({
    where: eq(churchLocations.active, true),
    orderBy: [asc(churchLocations.name)],
  });
  return c.json({ churchLocations: locations });
});

app.get("/bus-pickup-points", async (c) => {
  const pickupPoints = await db.query.busPickupPoints.findMany({
    where: eq(busPickupPoints.active, true),
    orderBy: [asc(busPickupPoints.name)],
  });
  return c.json({ pickupPoints });
});

export default app;