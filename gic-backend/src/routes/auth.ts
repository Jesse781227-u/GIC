import { Hono } from "hono";
import { z } from "zod";
import { SignJWT } from "jose";
import { getJwtSecret } from "../middleware/auth.js";
import { getFirebaseAuth } from "../lib/firebase.js";
import { db } from "../db/index.js";
import { members, pushDevices, notificationPreferences, notifications, notificationDeliveries, serviceReminders, ministryApplications, eventRegistrations } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.js";
import { churchIdForUser, DEFAULT_CHURCH_ID } from "../lib/tenant.js";

const app = new Hono();

const deviceAuthSchema = z.object({
  deviceId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
  name: z.string().optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().optional(),
  center: z.string().trim().optional(),
  serviceTime: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  membershipStatus: z.string().trim().optional(),
  joinedMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  joinedYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  avatar: z.string().optional(),
});

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isProfileComplete(member: typeof members.$inferSelect) {
  return Boolean(member.displayName?.trim() && member.displayName !== "Member" && member.phone?.trim());
}

async function issueMemberToken(member: typeof members.$inferSelect, platform = "web") {
  return new SignJWT({ sub: member.id, churchId: member.churchId, role: "MEMBER", name: member.displayName, platform })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

function memberResponse(member: typeof members.$inferSelect) {
  return {
    id: member.id,
    churchId: member.churchId,
    name: member.displayName,
    phone: member.phone,
    email: member.email || "",
    ministries: member.ministries || "",
    center: member.center || "",
    serviceTime: member.serviceTime || "",
    birthday: member.birthday || "",
    gender: member.gender || "",
    membershipStatus: member.membershipStatus || "",
    joinedMonth: member.joinedMonth || null,
    joinedYear: member.joinedYear || null,
    avatar: member.avatar || "",
    active: member.active,
    profileComplete: isProfileComplete(member),
    authMethod: "device_auth",
    authenticatedAt: new Date().toISOString(),
  };
}

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

    const { deviceId, accountId, deviceName, platform, name } = parsed.data;
    const churchId = DEFAULT_CHURCH_ID;
    if (accountId) {
      const existingAccount = await db.query.members.findFirst({ where: and(eq(members.id, accountId), eq(members.churchId, churchId)) });
      if (existingAccount) {
        const [member] = await db.update(members)
          .set({
            ...(name?.trim() ? { displayName: name.trim() } : {}),
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(members.id, existingAccount.id))
          .returning();
        return c.json({ token: await issueMemberToken(member, platform || "web"), member: memberResponse(member) });
      }
    }
    const existingMember = await db.query.members.findFirst({ where: and(eq(members.id, deviceId), eq(members.churchId, churchId)) });
    const deviceIdOwner = await db.query.members.findFirst({ where: eq(members.id, deviceId) });
    if (deviceIdOwner && deviceIdOwner.churchId !== churchId) return c.json({ error: "Device session is assigned to a different church." }, 409);
    const memberName = name?.trim() || existingMember?.displayName || "Member";

    const [member] = await db
      .insert(members)
      .values({
        id: deviceId,
        churchId: existingMember?.churchId || churchId,
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

    const token = await issueMemberToken(member, platform || "web");

    return c.json({
      token,
      member: memberResponse(member),
    });
  } catch (err: any) {
    console.error("Device auth error:", err);
    return c.json({ error: "Internal error", message: err.message }, 500);
  }
});

app.post("/recover", async (c) => {
  try {
    const body = await c.req.json();
    const firebaseToken = z.string().min(1).parse(body.firebaseToken);
    const deviceId = z.string().min(1).parse(body.deviceId);
    const firebaseUser = await getFirebaseAuth().verifyIdToken(firebaseToken);
    const phoneNumber = firebaseUser.phone_number;
    if (!phoneNumber) return c.json({ error: "A verified phone number is required" }, 400);

    const churchId = DEFAULT_CHURCH_ID;
    const candidates = await db.select().from(members).where(eq(members.churchId, churchId));
    const member = candidates.find((item) => item.phone && normalizePhone(item.phone) === normalizePhone(phoneNumber));
    if (!member) return c.json({ error: "No GIC account was found for this phone number" }, 404);

    const [updatedMember] = await db.update(members)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(members.id, member.id))
      .returning();
    const token = await issueMemberToken(updatedMember, "web");
    return c.json({ token, deviceId, member: memberResponse(updatedMember) });
  } catch (error: any) {
    console.error("Phone recovery error:", error);
    return c.json({ error: "Phone recovery failed" }, 400);
  }
});

app.use("/profile", authMiddleware);

app.get("/profile", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId)) });
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
      gender: member.gender || "",
      membershipStatus: member.membershipStatus || "",
      joinedMonth: member.joinedMonth || null,
      joinedYear: member.joinedYear || null,
      avatar: member.avatar || "",
      active: member.active,
      profileComplete: isProfileComplete(member),
    },
  });
});

app.patch("/profile", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message || "Invalid profile" }, 400);

  const submittedPhone = normalizePhone(parsed.data.phone);
  const submittedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : "";
  const candidates = await db.query.members.findMany({ where: eq(members.churchId, churchId) });
  const duplicate = candidates.find((candidate) => candidate.id !== c.get("user").sub && (
    (candidate.phone && normalizePhone(candidate.phone) === submittedPhone) ||
    (submittedEmail && candidate.email && normalizeEmail(candidate.email) === submittedEmail)
  ));
  if (duplicate) return c.json({ error: "A member account already exists for this phone number or email address", memberId: duplicate.id }, 409);

  const [member] = await db.update(members)
    .set({
      displayName: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || "",
      center: parsed.data.center || "",
      serviceTime: parsed.data.serviceTime || "",
      birthday: parsed.data.birthday || "",
      gender: parsed.data.gender || null,
      membershipStatus: parsed.data.membershipStatus || "",
      joinedMonth: parsed.data.joinedMonth || null,
      joinedYear: parsed.data.joinedYear || null,
      avatar: parsed.data.avatar || "",
      active: true,
      updatedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .where(and(eq(members.id, user.sub), eq(members.churchId, churchId)))
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
      gender: member.gender || "",
      membershipStatus: member.membershipStatus || "",
      joinedMonth: member.joinedMonth || null,
      joinedYear: member.joinedYear || null,
      avatar: member.avatar || "",
      active: member.active,
      profileComplete: isProfileComplete(member),
    },
  });
});

app.delete("/profile", async (c) => {
  const user = c.get("user");
  const churchId = churchIdForUser(user);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, user.sub), eq(members.churchId, churchId)) });
  if (!member) return c.json({ error: "Account not found" }, 404);

  await db.transaction(async (tx) => {
    await tx.delete(notificationDeliveries).where(eq(notificationDeliveries.memberId, user.sub));
    await tx.delete(notifications).where(and(eq(notifications.memberId, user.sub), eq(notifications.churchId, churchId)));
    await tx.delete(pushDevices).where(and(eq(pushDevices.memberId, user.sub), eq(pushDevices.churchId, churchId)));
    await tx.delete(notificationPreferences).where(and(eq(notificationPreferences.memberId, user.sub), eq(notificationPreferences.churchId, churchId)));
    await tx.delete(serviceReminders).where(eq(serviceReminders.memberId, user.sub));
    await tx.delete(ministryApplications).where(and(eq(ministryApplications.memberId, user.sub), eq(ministryApplications.churchId, churchId)));
    await tx.delete(eventRegistrations).where(and(eq(eventRegistrations.memberId, user.sub), eq(eventRegistrations.churchId, churchId)));
    await tx.delete(members).where(and(eq(members.id, user.sub), eq(members.churchId, churchId)));
  });

  return c.json({ success: true, deletedMemberId: user.sub });
});

export default app;
