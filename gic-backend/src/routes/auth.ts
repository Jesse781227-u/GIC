import { Hono } from "hono";
import { z } from "zod";
import { SignJWT } from "jose";
import { getJwtSecret } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { members } from "../db/schema.js";
import { eq } from "drizzle-orm";

const app = new Hono();

const deviceAuthSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
  name: z.string().optional(),
});

app.post("/device", async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      body = await c.req.parseBody();
    }
    const parsed = deviceAuthSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid data", details: parsed.error.issues }, 400);
    }

    const { deviceId, deviceName, platform, name } = parsed.data;
    const memberName = name || deviceName || "Member";

    const [member] = await db
      .insert(members)
      .values({
        id: deviceId,
        displayName: memberName,
        authMethod: "device_auth",
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: members.id,
        set: {
          displayName: memberName,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    const secret = getJwtSecret();
    const token = await new SignJWT({
      sub: deviceId,
      role: "MEMBER",
      name: memberName,
      platform: platform || "web",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    return c.json({
      token,
      member: {
        id: member.id,
        name: member.displayName,
        authMethod: "device_auth",
        authenticatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Device auth error:", err);
    return c.json({ error: "Internal error", message: err.message }, 500);
  }
});

export default app;
