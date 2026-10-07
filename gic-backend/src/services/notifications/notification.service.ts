import { db } from "../../db/index.js";
import {
  adminNotifications,
  members,
  notifications,
  notificationDeliveries,
  pushDevices,
  notificationPreferences,
  serviceReminders,
} from "../../db/schema.js";
import { audienceService } from "./audience.service.js";
import { pushService } from "./push.service.js";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import { events } from "../../db/schema.js";
import { formatServiceReminderOffset, SERVICE_TIME_ZONE } from "../event-occurrences.js";

const defaultPreferenceFlags = {
  pushEnabled: true,
  generalAnnouncements: true,
  eventUpdates: true,
  reminders: true,
  ministryUpdates: true,
  registrationUpdates: true,
} as const;

export interface NotificationDraft {
  churchId: string;
  title: string;
  body: string;
  type: any;
  audience: any;
  destinationUrl?: string;
  destinationType?: "none" | "internal_route" | "media_page";
  destinationRoute?: string;
  destinationMediaId?: string;
  scheduledAt?: string;
  createdBy: string;
  audienceMinistryId?: string;
  audienceCellId?: string;
  audienceSegmentId?: string;
  audienceEventId?: string;
  audienceMemberIds?: string[];
}

export class NotificationService {
  async sendToMember(input: {
    memberId: string;
    title: string;
    body: string;
    type: "EVENT_REMINDER" | "REGISTRATION_CONFIRMATION" | "REGISTRATION_CANCELLED";
    destinationUrl?: string;
  }) {
    const member = await db.query.members.findFirst({ where: eq(members.id, input.memberId) });
    if (!member) return { skipped: true, reason: "member-not-found" };
    const prefs = await db.query.notificationPreferences.findFirst({
      where: and(eq(notificationPreferences.churchId, member.churchId), eq(notificationPreferences.memberId, input.memberId)),
    });
    if (prefs && (!prefs.pushEnabled || (input.type === "EVENT_REMINDER" ? !prefs.reminders : !prefs.registrationUpdates))) {
      return { skipped: true, reason: "preference" };
    }
    const devices = await db.query.pushDevices.findMany({
      where: and(eq(pushDevices.churchId, member.churchId), eq(pushDevices.memberId, input.memberId), eq(pushDevices.active, true)),
    });
    const [inboxItem] = await db.insert(notifications).values({
      churchId: member.churchId,
      memberId: input.memberId,
      title: input.title,
      body: input.body,
      type: input.type,
      destinationUrl: input.destinationUrl,
    }).returning();
    if (!devices.length) return { notificationId: inboxItem.id, sent: 0 };
    const deliveries = await db.insert(notificationDeliveries).values(devices.map((device) => ({
      notificationId: inboxItem.id,
      memberId: input.memberId,
      deviceId: device.id,
      status: "pending" as const,
    }))).returning({ id: notificationDeliveries.id });
    await pushService.processDeliveries(deliveries.map(({ id }) => id), input.title, input.body, input.destinationUrl);
    return { notificationId: inboxItem.id, sent: deliveries.length };
  }

  async sendServiceReminder(reminder: typeof serviceReminders.$inferSelect) {
    const member = await db.query.members.findFirst({ where: eq(members.id, reminder.memberId) });
    if (!member) return;
    const prefs = await db.query.notificationPreferences.findFirst({ where: and(eq(notificationPreferences.churchId, member.churchId), eq(notificationPreferences.memberId, reminder.memberId)) });
    if (prefs && (!prefs.pushEnabled || !prefs.reminders)) return;
    const devices = await db.query.pushDevices.findMany({
      where: and(eq(pushDevices.churchId, member.churchId), eq(pushDevices.memberId, reminder.memberId), eq(pushDevices.active, true)),
    });
    const offset = Number(reminder.offsetMinutes);
    const defaultTitle = reminder.serviceType === "midweek-service" ? "GIC Midweek Service" : "GIC Sunday Service";
    const eventId = reminder.occurrenceKey.split(":")[0];
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    const title = event?.title || defaultTitle;
    const occurrenceDate = new Intl.DateTimeFormat("en-US", {
      timeZone: SERVICE_TIME_ZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(reminder.serviceStartsAt);
    const body = `${title} starts in ${formatServiceReminderOffset(offset)} on ${occurrenceDate}.`;
    const destinationUrl = event ? `/events/${event.id}` : "/events";
    const [inboxItem] = await db.insert(notifications).values({
      churchId: member.churchId,
      memberId: reminder.memberId,
      title,
      body,
      type: "EVENT_REMINDER",
      destinationUrl,
    }).returning();
    if (devices.length) {
      const deliveries = await db.insert(notificationDeliveries).values(devices.map((device) => ({
        notificationId: inboxItem.id, memberId: reminder.memberId, deviceId: device.id, status: "pending" as const,
      }))).returning({ id: notificationDeliveries.id });
      await pushService.processDeliveries(deliveries.map(({ id }) => id), title, body, destinationUrl);
    }
  }

  private notificationPreferenceKey(type: any): keyof typeof defaultPreferenceFlags {
    const value = String(type);

    if (value === "GENERAL_ANNOUNCEMENT") return "generalAnnouncements";
    if (value === "EVENT_PUBLISHED" || value === "EVENT_UPDATED" || value === "EVENT_CANCELLED") return "eventUpdates";
    if (value === "EVENT_REMINDER") return "reminders";
    if (value === "MINISTRY_UPDATE") return "ministryUpdates";
    if (value === "REGISTRATION_CONFIRMATION" || value === "REGISTRATION_CANCELLED") return "registrationUpdates";

    return "generalAnnouncements";
  }

  async createDraft(draft: NotificationDraft) {
    const scheduledDate = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
    const status = scheduledDate ? "SCHEDULED" : "DRAFT";

    const [created] = await db
      .insert(adminNotifications)
      .values({
        churchId: draft.churchId,
        title: draft.title,
        body: draft.body,
        type: draft.type,
        audience: draft.audience,
        audienceCellId: draft.audienceCellId,
        audienceSegmentId: draft.audienceSegmentId,
        destinationUrl: draft.destinationUrl,
        destinationType: draft.destinationType || "none",
        destinationRoute: draft.destinationRoute,
        destinationMediaId: draft.destinationMediaId,
        scheduledAt: scheduledDate,
        createdBy: draft.createdBy,
        audienceMinistryId: draft.audienceMinistryId,
        audienceEventId: draft.audienceEventId,
        audienceMemberIds: draft.audienceMemberIds,
        status,
      })
      .returning();

    return { id: created.id, status: created.status };
  }

  async sendNow(adminNotifId: string) {
    const adminNotif = await db.query.adminNotifications.findFirst({
      where: eq(adminNotifications.id, adminNotifId),
    });

    if (!adminNotif) throw new Error("Notification not found");
    if (adminNotif.status === "PROCESSING" || adminNotif.status === "SENT") {
      throw new Error(`Notification is already in state: ${adminNotif.status}`);
    }

    // Mark as PROCESSING first to prevent duplicate sends (scheduler idempotency)
    const [claimed] = await db
      .update(adminNotifications)
      .set({ status: "PROCESSING" })
      .where(
        and(
          eq(adminNotifications.id, adminNotifId),
          // Only transition from safe states
          sql`${adminNotifications.status} IN ('DRAFT', 'SCHEDULED')`
        )
      )
      .returning({ id: adminNotifications.id });
    if (!claimed) return;

    try {
      const recipients = await audienceService.resolve({
        churchId: adminNotif.churchId,
        kind: adminNotif.audience,
        ministryId: adminNotif.audienceMinistryId || undefined,
        cellId: adminNotif.audienceCellId || undefined,
        segmentId: adminNotif.audienceSegmentId || undefined,
        eventId: adminNotif.audienceEventId || undefined,
        memberIds: adminNotif.audienceMemberIds || undefined,
      });

      const recipientIds = recipients.map((recipient) => recipient.memberId);
      const preferenceRows = await db.query.notificationPreferences.findMany({
        where: and(eq(notificationPreferences.churchId, adminNotif.churchId), inArray(notificationPreferences.memberId, recipientIds)),
      });
      const preferenceMap = new Map(
        preferenceRows.map((pref) => [pref.memberId, pref])
      );

      let totalRecipients = 0;

      await db.transaction(async (tx) => {
        for (const recipient of recipients) {
          const prefs = preferenceMap.get(recipient.memberId) ?? {
            ...defaultPreferenceFlags,
          };

          if (!prefs.pushEnabled) continue;

          const preferenceKey = this.notificationPreferenceKey(adminNotif.type);
          if (prefs[preferenceKey] === false) continue;

          if (recipient.deviceIds.length === 0) continue;
          totalRecipients++;

          const [inboxItem] = await tx
            .insert(notifications)
            .values({
              churchId: adminNotif.churchId,
              memberId: recipient.memberId,
              messageId: adminNotifId,
              title: adminNotif.title,
              body: adminNotif.body,
              type: adminNotif.type,
              destinationUrl: adminNotif.destinationUrl,
              destinationType: adminNotif.destinationType,
              destinationRoute: adminNotif.destinationRoute,
              destinationMediaId: adminNotif.destinationMediaId,
            })
            .returning();

          for (const deviceId of recipient.deviceIds) {
            await tx
              .insert(notificationDeliveries)
              .values({
                notificationId: inboxItem.id,
                memberId: recipient.memberId,
                deviceId,
                status: "pending",
              })
              .onConflictDoNothing();
          }
        }
      });

      await db
        .update(adminNotifications)
        .set({
          status: "SENT",
          sentAt: new Date(),
          recipientCount: totalRecipients.toString(),
        })
        .where(eq(adminNotifications.id, adminNotifId));

      await this.dispatchPushDeliveries(
        adminNotifId,
        adminNotif.title,
        adminNotif.body,
        adminNotif.destinationUrl || undefined
      );
    } catch (e) {
      console.error(`sendNow failed for ${adminNotifId}:`, e);
      await db
        .update(adminNotifications)
        .set({ status: "FAILED" })
        .where(eq(adminNotifications.id, adminNotifId));
      throw e;
    }
  }

  private async dispatchPushDeliveries(
    adminNotifId: string,
    title: string,
    body: string,
    url?: string
  ) {
    // Find all pending deliveries for notifications belonging to this admin notification
    const pendingDeliveries = await db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
      .where(
        and(
          eq(notifications.messageId, adminNotifId),
          eq(notificationDeliveries.status, "pending")
        )
      );

    const ids = pendingDeliveries.map((d) => d.id);

    // Process in batches of 500 (FCM multicast limit)
    for (let i = 0; i < ids.length; i += 500) {
      await pushService.processDeliveries(ids.slice(i, i + 500), title, body, url);
    }

    // Recalculate final status
    const stats = await db
      .select({ status: notificationDeliveries.status, count: count() })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notificationDeliveries.notificationId, notifications.id))
      .where(eq(notifications.messageId, adminNotifId))
      .groupBy(notificationDeliveries.status);

    let sentCount = 0;
    let failedCount = 0;
    for (const row of stats) {
      if (row.status === "sent") sentCount += row.count;
      if (row.status === "failed") failedCount += row.count;
    }

    const finalStatus =
      sentCount > 0 && failedCount > 0
        ? "PARTIALLY_FAILED"
        : failedCount > 0 && sentCount === 0
        ? "FAILED"
        : "SENT";

    await db
      .update(adminNotifications)
      .set({
        sentCount: sentCount.toString(),
        failedCount: failedCount.toString(),
        status: finalStatus,
      })
      .where(eq(adminNotifications.id, adminNotifId));
  }

  async schedule(adminNotifId: string, scheduledAt: string) {
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) throw new Error("Invalid scheduledAt date");
    await db
      .update(adminNotifications)
      .set({ status: "SCHEDULED", scheduledAt: scheduledDate })
      .where(eq(adminNotifications.id, adminNotifId));
  }

  async cancel(adminNotifId: string) {
    await db
      .update(adminNotifications)
      .set({ status: "CANCELLED" })
      .where(
        and(
          eq(adminNotifications.id, adminNotifId),
          sql`${adminNotifications.status} IN ('DRAFT', 'SCHEDULED')`
        )
      );
  }
}

export const notificationService = new NotificationService();
