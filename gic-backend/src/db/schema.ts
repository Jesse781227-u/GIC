import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const notificationTypeEnum = pgEnum("notification_type", [
  "GENERAL_ANNOUNCEMENT",
  "EVENT_PUBLISHED",
  "EVENT_REMINDER",
  "EVENT_UPDATED",
  "EVENT_CANCELLED",
  "REGISTRATION_CONFIRMATION",
  "REGISTRATION_CANCELLED",
  "FORM_AVAILABLE",
  "MINISTRY_UPDATE",
  "SYSTEM_NOTIFICATION",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "sent",
  "failed",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "DRAFT",
  "SCHEDULED",
  "PROCESSING",
  "SENT",
  "PARTIALLY_FAILED",
  "FAILED",
  "CANCELLED",
]);

export const audienceTypeEnum = pgEnum("audience_type", [
  "everyone",
  "ministry",
  "event_registrants",
  "members",
]);

// ─── members ──────────────────────────────────────────────────────────────────
// Device-authenticated members are persisted so their identity survives reloads.

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("Member"),
  phone: text("phone"),
  authMethod: text("auth_method").notNull().default("device_auth"),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ministryApplications = pgTable(
  "ministry_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    ministry: text("ministry").notNull(),
    message: text("message"),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("ministry_applications_member_id_idx").on(t.memberId),
    statusIdx: index("ministry_applications_status_idx").on(t.status),
  })
);

// ─── push_devices ─────────────────────────────────────────────────────────────
// One member can have multiple browser/device registrations.

export const pushDevices = pgTable(
  "push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    firebaseInstallationId: text("firebase_installation_id"),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("web"),
    browser: text("browser").notNull().default("unknown"),
    deviceName: text("device_name"),
    active: boolean("active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("push_devices_member_id_idx").on(t.memberId),
    activeIdx: index("push_devices_active_idx").on(t.active),
    // Each token is unique — prevents duplicate registrations
    tokenUnique: unique("push_devices_token_unique").on(t.token),
  })
);

// ─── notification_preferences ─────────────────────────────────────────────────
// Per-member notification controls for categories and channels.

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull().unique(),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    generalAnnouncements: boolean("general_announcements").notNull().default(true),
    eventUpdates: boolean("event_updates").notNull().default(true),
    reminders: boolean("reminders").notNull().default(true),
    ministryUpdates: boolean("ministry_updates").notNull().default(true),
    registrationUpdates: boolean("registration_updates").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("notification_preferences_member_id_idx").on(t.memberId),
  })
);

// ─── admin_notifications ──────────────────────────────────────────────────────
// Admin-composed push notification campaigns.

export const adminNotifications = pgTable(
  "admin_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: notificationTypeEnum("type").notNull(),
    audience: audienceTypeEnum("audience").notNull(),
    // Audience filter context — which ministry / event / members
    audienceMinistryId: text("audience_ministry_id"),
    audienceEventId: text("audience_event_id"),
    audienceMemberIds: text("audience_member_ids").array(),
    // Where does tapping this notification go in the member app?
    destinationUrl: text("destination_url"),
    status: notificationStatusEnum("status").notNull().default("DRAFT"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    // Delivery counters (denormalised for fast admin dashboard reads)
    recipientCount: text("recipient_count").default("0"),
    sentCount: text("sent_count").default("0"),
    failedCount: text("failed_count").default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    statusIdx: index("admin_notifications_status_idx").on(t.status),
    scheduledIdx: index("admin_notifications_scheduled_at_idx").on(
      t.scheduledAt
    ),
  })
);

// ─── notifications ────────────────────────────────────────────────────────────
// Per-member notification inbox records. Created when a campaign is sent.

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    messageId: uuid("message_id").references(() => adminNotifications.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: notificationTypeEnum("type").notNull(),
    destinationUrl: text("destination_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("notifications_member_id_idx").on(t.memberId),
    readIdx: index("notifications_read_at_idx").on(t.readAt),
    messageIdx: index("notifications_message_id_idx").on(t.messageId),
  })
);

// ─── notification_deliveries ──────────────────────────────────────────────────
// FCM delivery attempt per device. Idempotency via unique(notification_id, device_id).

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => pushDevices.id, { onDelete: "cascade" }),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // Critical: prevents duplicate FCM sends for the same notification+device pair
    deliveryUnique: unique("notification_deliveries_unique").on(
      t.notificationId,
      t.deviceId
    ),
    notifIdx: index("notification_deliveries_notification_id_idx").on(
      t.notificationId
    ),
    memberIdx: index("notification_deliveries_member_id_idx").on(t.memberId),
    statusIdx: index("notification_deliveries_status_idx").on(t.status),
  })
);
