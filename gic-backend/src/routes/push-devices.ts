import { Hono } from "hono";
import { z } from "zod";
import { deviceService } from "../services/notifications/device.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { pushDevices } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const app = new Hono();

app.use("*", authMiddleware);

const registerSchema = z.object({
  token: z.string().min(1),
  firebaseInstallationId: z.string().optional(),
  platform: z.string().optional(),
  browser: z.string().optional(),
  deviceName: z.string().optional(),
});

app.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.issues }, 400);
  }

  try {
    const device = await deviceService.register({
      memberId: user.sub,
      ...parsed.data,
    });

    return c.json({ device }, 201);
  } catch (error: any) {
    const message = error?.message || "Unable to register device";
    if (message.includes("already registered to a different member")) {
      return c.json({ error: "Device token already registered to another member" }, 409);
    }

    return c.json({ error: message }, 400);
  }
});

app.get("/", async (c) => {
  const user = c.get("user");
  const devices = await db.query.pushDevices.findMany({
    where: and(eq(pushDevices.memberId, user.sub), eq(pushDevices.active, true)),
  });

  return c.json({ devices });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  try {
    await deviceService.deactivateForMember(user.sub, id);
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
  
  return c.json({ success: true });
});

export default app;
