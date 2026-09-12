import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  members,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  pushDevices,
} from "../../db/schema.js";
import { pushService } from "./push.service.js";

export const BIRTHDAY_ROUTE = "/announcements/birthday";
export const BIRTHDAY_TIME_ZONE = "Africa/Lagos";

type DateParts = { year: number; month: number; day: number };

export function getLagosDateParts(date = new Date()): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BIRTHDAY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function getBirthdayDateKey(parts = getLagosDateParts()): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function isBirthdayToday(birthday: string | null | undefined, today = getLagosDateParts()): boolean {
  const match = String(birthday || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  // Feb 29 birthdays are celebrated on Feb 28 in non-leap years.
  const feb29Fallback = birthMonth === 2 && birthDay === 29 && today.month === 2 && today.day === 28 && today.year % 4 !== 0;
  return (birthMonth === today.month && birthDay === today.day) || feb29Fallback;
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "friend";
}

export function birthdayCelebration(member: typeof members.$inferSelect, today = getLagosDateParts()) {
  if (!isBirthdayToday(member.birthday, today)) return null;
  const name = firstName(member.displayName);
  return {
    name,
    fullName: member.displayName,
    avatar: member.avatar || "",
    title: `Happy Birthday, ${name}!`,
    message: `The GIC family is celebrating you today, ${name}. May your new year be filled with joy, grace, and beautiful moments.`,
    date: getBirthdayDateKey(today),
    destinationUrl: BIRTHDAY_ROUTE,
  };
}

export class BirthdayService {
  async sendToMember(member: typeof members.$inferSelect, birthdayDate: string) {
    const celebration = birthdayCelebration(member);
    if (!celebration) return { delivered: false, reason: "not-birthday" };

    const [preferences] = await db.select({ pushEnabled: notificationPreferences.pushEnabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.memberId, member.id));
    const devices = await db.query.pushDevices.findMany({
      where: and(eq(pushDevices.memberId, member.id), eq(pushDevices.active, true)),
    });

    const [inboxItem] = await db.insert(notifications).values({
      memberId: member.id,
      title: celebration.title,
      body: celebration.message,
      type: "SYSTEM_NOTIFICATION",
      destinationUrl: BIRTHDAY_ROUTE,
    }).returning();

    if (preferences?.pushEnabled === false || devices.length === 0) {
      return { delivered: false, reason: preferences?.pushEnabled === false ? "push-disabled" : "no-device" };
    }

    const deliveries = await db.insert(notificationDeliveries).values(devices.map((device) => ({
      notificationId: inboxItem.id,
      memberId: member.id,
      deviceId: device.id,
      status: "pending" as const,
    }))).returning({ id: notificationDeliveries.id });

    await pushService.processDeliveries(
      deliveries.map(({ id }) => id),
      celebration.title,
      celebration.message,
      BIRTHDAY_ROUTE,
      { birthdayDate, tag: `gic-birthday-${member.id}-${birthdayDate}` },
    );
    return { delivered: true, deviceCount: devices.length };
  }
}

export const birthdayService = new BirthdayService();
