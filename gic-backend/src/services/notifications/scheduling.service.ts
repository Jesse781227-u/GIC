import cron from "node-cron";
import { db } from "../../db/index.js";
import { adminNotifications, birthdayNotificationSends, eventRegistrations, eventReminders, events, members, mixlrRecordings, serviceReminders } from "../../db/schema.js";
import { notificationService } from "./notification.service.js";
import { lte, and, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { birthdayService, birthdayCelebration, getBirthdayDateKey, getLagosDateParts } from "./birthday.service.js";
import { buildServiceReminderRows, generateServiceOccurrences } from "../event-occurrences.js";
import { createMixlrRecordingNotification, syncLatestMixlrRecording } from "../mixlr.service.js";

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
    void this.processMixlrRecording();
    
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
    await this.scheduleRecurringServiceReminders(now);
    await this.processMixlrRecording();
    
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

    await this.processUndispatchedMixlrNotifications();

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

    const dueEventReminders = await db
      .update(eventReminders)
      .set({ status: "processing", updatedAt: now })
      .where(and(eq(eventReminders.status, "pending"), lte(eventReminders.scheduledFor, now)))
      .returning();
    for (const reminder of dueEventReminders) {
      try {
        const event = await db.query.events.findFirst({ where: eq(events.id, reminder.eventId) });
        if (event && event.status === "PUBLISHED") {
          const registrations = await db.query.eventRegistrations.findMany({
            where: and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.status, "CONFIRMED")),
          });
          const offsetLabel = reminder.offsetMinutes === 1440
            ? "1 day"
            : reminder.offsetMinutes === 60
              ? "1 hour"
              : reminder.offsetMinutes === 30
                ? "30 minutes"
                : `${reminder.offsetMinutes} minutes`;
          for (const registration of registrations) {
            await notificationService.sendToMember({
              memberId: registration.memberId,
              title: event.title,
              body: `${event.title} starts in ${offsetLabel}.`,
              type: "EVENT_REMINDER",
              destinationUrl: `/events/${event.id}`,
            });
          }
        }
        await db.update(eventReminders).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(eventReminders.id, reminder.id));
      } catch (error) {
        console.error(`Failed to process event reminder ${reminder.id}:`, error);
        await db.update(eventReminders).set({ status: "failed", updatedAt: new Date() }).where(eq(eventReminders.id, reminder.id));
      }
    }

    await this.processBirthdays();
  }

  private async processMixlrRecording() {
    try {
      await syncLatestMixlrRecording();
    } catch (error) {
      console.error("Failed to check Mixlr recordings:", error);
    }
  }

  private async processUndispatchedMixlrNotifications() {
    const unannouncedRecordings = await db.query.mixlrRecordings.findMany({
      where: isNull(mixlrRecordings.notificationId),
      columns: { id: true },
    });
    for (const recording of unannouncedRecordings) {
      try {
        await createMixlrRecordingNotification(recording.id);
      } catch (error) {
        console.error(`Failed to create Mixlr recording notification for ${recording.id}:`, error);
      }
    }

    const recordingRows = await db.query.mixlrRecordings.findMany({
      where: isNotNull(mixlrRecordings.notificationId),
      columns: { notificationId: true },
    });
    const notificationIds = recordingRows.map(({ notificationId }) => notificationId).filter((id): id is string => Boolean(id));
    if (!notificationIds.length) return;
    const pending = await db.query.adminNotifications.findMany({
      where: and(inArray(adminNotifications.id, notificationIds), eq(adminNotifications.status, "DRAFT")),
    });
    for (const notification of pending) {
      try {
        await notificationService.sendNow(notification.id);
      } catch (error) {
        console.error(`Failed to dispatch Mixlr recording notification ${notification.id}:`, error);
      }
    }
  }

  private async scheduleRecurringServiceReminders(now: Date) {
    const existingEvents = await db.query.events.findMany({ where: eq(events.eventType, "Service") });
    for (const event of existingEvents) {
      const occurrences = event.status === "PUBLISHED" && event.eventType === "Service"
        ? generateServiceOccurrences(event, now)
        : [];
      const activeMembers = occurrences.length ? await db.query.members.findMany({
        where: and(eq(members.churchId, event.churchId), eq(members.active, true)),
        columns: { id: true },
      }) : [];
      const memberIds = activeMembers.map(({ id }) => id);
      const rows = occurrences.flatMap((occurrence) => buildServiceReminderRows(occurrence, memberIds, now));
      const desiredKeys = new Set(rows.map((row) => `${row.memberId}|${row.occurrenceKey}|${row.offsetMinutes}`));

      await db.transaction(async (tx) => {
        const existing = await tx.query.serviceReminders.findMany({
          where: like(serviceReminders.occurrenceKey, `${event.id}:%`),
        });
        const staleIds = existing
          .filter((row) => row.status === "pending" && !desiredKeys.has(`${row.memberId}|${row.occurrenceKey}|${row.offsetMinutes}`))
          .map(({ id }) => id);
        if (staleIds.length) {
          for (let start = 0; start < staleIds.length; start += 500) {
            await tx.delete(serviceReminders).where(and(inArray(serviceReminders.id, staleIds.slice(start, start + 500)), eq(serviceReminders.status, "pending")));
          }
        }
        for (let start = 0; start < rows.length; start += 500) {
          await tx.insert(serviceReminders).values(rows.slice(start, start + 500)).onConflictDoUpdate({
            target: [serviceReminders.memberId, serviceReminders.occurrenceKey, serviceReminders.offsetMinutes],
            set: {
              serviceType: sql`excluded.service_type`,
              serviceStartsAt: sql`excluded.service_starts_at`,
              scheduledFor: sql`excluded.scheduled_for`,
              updatedAt: now,
            },
            setWhere: eq(serviceReminders.status, "pending"),
          });
        }
      });
    }
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
