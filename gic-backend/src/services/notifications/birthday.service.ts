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
import { birthdayOccursOn } from "../../lib/age-groups.js";

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
  return birthdayOccursOn(birthday, today);
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "friend";
}

export const BIRTHDAY_TEMPLATES = [
  {
    id: "grace",
    accent: "#f7d783",
    prayer: "May this new year bring you fresh grace, deep peace, and abundant joy as you walk closely with God.",
    scripture: {
      reference: "Numbers 6:24–25",
      text: "The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you.",
    },
  },
  {
    id: "purpose",
    accent: "#d9b6ff",
    prayer: "May the Lord open new doors of purpose for you, strengthen your faith, and establish the work of your hands.",
    scripture: {
      reference: "Jeremiah 29:11",
      text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
    },
  },
  {
    id: "strength",
    accent: "#79d7c2",
    prayer: "May God renew your strength, steady your heart, and keep you soaring on wings like eagles in every season.",
    scripture: {
      reference: "Isaiah 40:31",
      text: "Those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary.",
    },
  },
  {
    id: "gratitude",
    accent: "#f9b3c7",
    prayer: "May your heart overflow with gratitude, your days be filled with God’s goodness, and your life continue to reflect His love.",
    scripture: {
      reference: "Psalm 90:17",
      text: "May the favor of the Lord our God rest on us; establish the work of our hands for us.",
    },
  },
  {
    id: "favor",
    accent: "#8ec5ff",
    prayer: "May this new chapter carry divine guidance, favor, and joy as you keep trusting the Lord with your whole heart.",
    scripture: {
      reference: "Proverbs 3:5–6",
      text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.",
    },
  },
];

export function getBirthdayTemplate(memberId: string, birthdayKey: string) {
  const seed = Array.from(`${memberId}:${birthdayKey}`).reduce((total, char) => total + char.charCodeAt(0), 0);
  return BIRTHDAY_TEMPLATES[seed % BIRTHDAY_TEMPLATES.length];
}

export function birthdayCelebration(member: typeof members.$inferSelect, today = getLagosDateParts()) {
  if (!isBirthdayToday(member.birthday, today)) return null;
  const birthdayKey = getBirthdayDateKey(today);
  const first = firstName(member.displayName || "friend");
  const template = getBirthdayTemplate(member.id, birthdayKey);
  const scripture = template.scripture;
  const message = `Today, we thank God for the gift of your life, ${first}. We celebrate the beauty of who you are and the work God is doing in and through you. ${template.prayer}`;
  const blessing = `May the Lord continue to bless you, guide your steps, and fill this new year with His presence, purpose, and joy.`;

  return {
    memberId: member.id,
    firstName: first,
    name: first,
    fullName: member.displayName,
    profileImage: member.avatar || null,
    avatar: member.avatar || "",
    birthday: member.birthday,
    title: `Happy Birthday, ${first}!`,
    message,
    blessing,
    template: template.id,
    scripture,
    date: birthdayKey,
    destinationUrl: BIRTHDAY_ROUTE,
  };
}

export class BirthdayService {
  async sendToMember(member: typeof members.$inferSelect, birthdayDate: string) {
    const celebration = birthdayCelebration(member);
    if (!celebration) return { delivered: false, reason: "not-birthday" };

    const [preferences] = await db.select({ pushEnabled: notificationPreferences.pushEnabled })
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.churchId, member.churchId), eq(notificationPreferences.memberId, member.id)));
    const devices = await db.query.pushDevices.findMany({
      where: and(eq(pushDevices.churchId, member.churchId), eq(pushDevices.memberId, member.id), eq(pushDevices.active, true)),
    });

    const [inboxItem] = await db.insert(notifications).values({
      churchId: member.churchId,
      memberId: member.id,
      title: celebration.title,
      body: `${celebration.message} ${celebration.blessing}`,
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
      `${celebration.message} ${celebration.blessing}`,
      BIRTHDAY_ROUTE,
      { birthdayDate, tag: `gic-birthday-${member.id}-${birthdayDate}` },
    );
    return { delivered: true, deviceCount: devices.length };
  }
}

export const birthdayService = new BirthdayService();
