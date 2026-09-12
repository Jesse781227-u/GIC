import cron from "node-cron";
import { db } from "../../db/index.js";
import { adminNotifications, birthdayNotificationSends, members, serviceReminders } from "../../db/schema.js";
import { notificationService } from "./notification.service.js";
import { lte, and, eq } from "drizzle-orm";
import { birthdayService, birthdayCelebration, getBirthdayDateKey, getLagosDateParts } from "./birthday.service.js";

export class SchedulingService {
  private task: cron.ScheduledTask | null = null;

  start() {
    if (this.task) return;
    
    // Run every minute
    this.task = cron.schedule("* * * * *", async () => {
      try {
        await this.processScheduledNotifications();
      } catch (error) {
        console.error("Error processing scheduled notifications:", error);
      }
    });
    
    console.log("Scheduling service started");
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Scheduling service stopped");
    }
  }

  private async processScheduledNotifications() {
    const now = new Date();
    
    // Find notifications that are SCHEDULED and their time has come or passed
    const pending = await db.query.adminNotifications.findMany({
      where: and(
        eq(adminNotifications.status, "SCHEDULED"),
        lte(adminNotifications.scheduledAt, now)
      ),
    });

    for (const notif of pending) {
      console.log(`Processing scheduled notification: ${notif.id}`);
      // sendNow will handle state transition, resolving audience, generating deliveries, and sending
      try {
        await notificationService.sendNow(notif.id);
      } catch (e) {
        console.error(`Failed to process scheduled notification ${notif.id}:`, e);
      }
    }

    const dueReminders = await db
      .update(serviceReminders)
      .set({ status: "processing", updatedAt: now })
      .where(and(eq(serviceReminders.status, "pending"), lte(serviceReminders.scheduledFor, now)))
      .returning();
    for (const reminder of dueReminders) {
      try {
        await notificationService.sendServiceReminder(reminder);
        await db.update(serviceReminders).set({ status: "sent", updatedAt: new Date() }).where(eq(serviceReminders.id, reminder.id));
      } catch (error) {
        console.error(`Failed to process service reminder ${reminder.id}:`, error);
        await db.update(serviceReminders).set({ status: "failed", updatedAt: new Date() }).where(eq(serviceReminders.id, reminder.id));
      }
    }

    await this.processBirthdays();
  }

  private async processBirthdays() {
    const today = getLagosDateParts();
    const birthdayDate = getBirthdayDateKey(today);
    const candidates = await db.query.members.findMany();

    for (const member of candidates) {
      if (!birthdayCelebration(member, today)) continue;

      let [claim] = await db.insert(birthdayNotificationSends).values({
        memberId: member.id,
        birthdayDate,
        status: "processing",
      }).onConflictDoNothing().returning();

      // A pre-existing claim means this member has already been handled today.
      // Never retry it here: retrying after a partial FCM response could send a
      // duplicate birthday push to one of the member's devices.
      if (!claim) continue;

      try {
        await birthdayService.sendToMember(member, birthdayDate);
        await db.update(birthdayNotificationSends)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(birthdayNotificationSends.id, claim.id));
      } catch (error: any) {
        console.error(`Failed to process birthday notification for ${member.id}:`, error);
        await db.update(birthdayNotificationSends)
          .set({ status: "failed", error: error?.message || "Unknown error", updatedAt: new Date() })
          .where(eq(birthdayNotificationSends.id, claim.id));
      }
    }
  }
}

export const schedulingService = new SchedulingService();
