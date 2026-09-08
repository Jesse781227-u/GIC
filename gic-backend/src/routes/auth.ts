import { Hono } from "hono";
import { z } from "zod";
import { SignJWT } from "jose";
import { getJwtSecret } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { members } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";

const app = new Hono();

const deviceAuthSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
  name: z.string().optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().optional(),
  ministries: z.string().trim().optional(),
  center: z.string().trim().optional(),
  serviceTime: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  membershipStatus: z.string().trim().optional(),
  avatar: z.string().optional(),
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
    const existingMember = await db.query.members.findFirst({ where: eq(members.id, deviceId) });
    const memberName = name?.trim() || existingMember?.displayName || "Member";

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
          ...(name?.trim() ? { displayName: name.trim() } : {}),
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
        phone: member.phone,
        email: member.email || "",
        ministries: member.ministries || "",
        center: member.center || "",
        serviceTime: member.serviceTime || "",
        birthday: member.birthday || "",
        membershipStatus: member.membershipStatus || "",
        avatar: member.avatar || "",
        active: member.active,
        profileComplete: Boolean(member.displayName?.trim() && member.displayName !== "Member" && member.phone?.trim()),
        authMethod: "device_auth",
        authenticatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Device auth error:", err);
    return c.json({ error: "Internal error", message: err.message }, 500);
  }
});

app.use("/profile", authMiddleware);

app.get("/profile", async (c) => {
  const user = c.get("user");
  const member = await db.query.members.findFirst({ where: eq(members.id, user.sub) });
  if (!member) return c.json({ error: "Account not found" }, 404);

  return c.json({
    profile: {
      id: member.id,
      name: member.displayName,
      phone: member.phone || "",
      email: member.email || "",
      ministries: member.ministries || "",
      center: member.center || "",
      serviceTime: member.serviceTime || "",
      birthday: member.birthday || "",
      membershipStatus: member.membershipStatus || "",
      avatar: member.avatar || "",
      active: member.active,
      profileComplete: Boolean(member.displayName?.trim() && member.displayName !== "Member" && member.phone?.trim()),
    },
  });
});

app.patch("/profile", async (c) => {
  const user = c.get("user");
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message || "Invalid profile" }, 400);

  const [member] = await db.update(members)
    .set({
      displayName: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || "",
      ministries: parsed.data.ministries || "",
      center: parsed.data.center || "",
      serviceTime: parsed.data.serviceTime || "",
      birthday: parsed.data.birthday || "",
      membershipStatus: parsed.data.membershipStatus || "",
      avatar: parsed.data.avatar || "",
      active: true,
      updatedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .where(eq(members.id, user.sub))
    .returning();
  if (!member) return c.json({ error: "Account not found" }, 404);

  return c.json({
    profile: {
      id: member.id,
      name: member.displayName,
      phone: member.phone,
      email: member.email || "",
      ministries: member.ministries || "",
      center: member.center || "",
      serviceTime: member.serviceTime || "",
      birthday: member.birthday || "",
      membershipStatus: member.membershipStatus || "",
      avatar: member.avatar || "",
      active: member.active,
      profileComplete: true,
    },
  });
});

export default app;
