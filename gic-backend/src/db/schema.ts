import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  unique,
  uniqueIndex,
  jsonb,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  "cell",
  "segment",
  "event_registrants",
  "members",
]);

export const churches = pgTable("churches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ageGroupDefinitions = pgTable("age_group_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  minAge: integer("min_age").notNull(),
  maxAge: integer("max_age"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqueName: unique("age_group_definitions_church_name_unique").on(t.churchId, t.name),
  tenantIdUnique: unique("age_group_definitions_church_id_id_unique").on(t.churchId, t.id),
  tenantIdx: index("age_group_definitions_church_idx").on(t.churchId),
  validRange: check("age_group_definitions_age_range_check", sql`${t.maxAge} IS NULL OR ${t.maxAge} >= ${t.minAge}`),
}));

// ─── members ──────────────────────────────────────────────────────────────────
// Device-authenticated members are persisted so their identity survives reloads.

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  displayName: text("display_name").notNull().default("Member"),
  phone: text("phone"),
  email: text("email"),
  ministries: text("ministries"),
  center: text("center"),
  serviceTime: text("service_time"),
  birthday: text("birthday"),
  gender: text("gender"),
  ageGroupId: uuid("age_group_id").references(() => ageGroupDefinitions.id, { onDelete: "set null" }),
  relationshipStatus: text("relationship_status"),
  membershipStatus: text("membership_status"),
  joinedMonth: integer("joined_month"),
  joinedYear: integer("joined_year"),
  avatar: text("avatar"),
  authMethod: text("auth_method").notNull().default("device_auth"),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  phoneIdentityUnique: uniqueIndex("members_phone_identity_unique").on(t.churchId, sql`regexp_replace(${t.phone}, '[^0-9]', '', 'g')`).where(sql`${t.phone} IS NOT NULL AND btrim(${t.phone}) <> ''`),
  emailIdentityUnique: uniqueIndex("members_email_identity_unique").on(t.churchId, sql`lower(btrim(${t.email}))`).where(sql`${t.email} IS NOT NULL AND btrim(${t.email}) <> ''`),
  relationshipStatusCheck: check("members_relationship_status_check", sql`${t.relationshipStatus} IS NULL OR ${t.relationshipStatus} IN ('Single', 'Married')`),
  ageGroupIdx: index("members_church_age_group_idx").on(t.churchId, t.ageGroupId),
  ageGroupTenantFk: foreignKey({ name: "members_age_group_tenant_fk", columns: [t.churchId, t.ageGroupId], foreignColumns: [ageGroupDefinitions.churchId, ageGroupDefinitions.id] }),
}));

export const ministries = pgTable("ministries", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  organizationType: text("organization_type").notNull().default("unit"),
  applicationRequired: boolean("application_required").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniqueName: unique("ministries_church_name_unique").on(t.churchId, t.name), tenantIdx: index("ministries_church_idx").on(t.churchId) }));

export const ministryMemberships = pgTable("ministry_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  ministryId: uuid("ministry_id").notNull().references(() => ministries.id),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniqueMember: unique("ministry_memberships_unique").on(t.churchId, t.ministryId, t.memberId), tenantIdx: index("ministry_memberships_church_idx").on(t.churchId), memberIdx: index("ministry_memberships_member_idx").on(t.memberId) }));

export const cells = pgTable("cells", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  organizationType: text("organization_type").notNull().default("fellowship"),
  applicationRequired: boolean("application_required").notNull().default(false),
  eligibilityRules: jsonb("eligibility_rules").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniqueName: unique("cells_church_name_unique").on(t.churchId, t.name), tenantIdx: index("cells_church_idx").on(t.churchId) }));

export const cellMemberships = pgTable("cell_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  cellId: uuid("cell_id").notNull().references(() => cells.id),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  eligibilityReviewRequired: boolean("eligibility_review_required").notNull().default(false),
}, (t) => ({ uniqueMember: unique("cell_memberships_unique").on(t.churchId, t.cellId, t.memberId), tenantIdx: index("cell_memberships_church_idx").on(t.churchId), memberIdx: index("cell_memberships_member_idx").on(t.memberId) }));

export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  description: text("description"),
  segmentType: text("segment_type").notNull(),
  rules: jsonb("rules").notNull().default({}),
  isSystem: boolean("is_system").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniqueName: unique("segments_church_name_unique").on(t.churchId, t.name), tenantIdx: index("segments_church_idx").on(t.churchId) }));

export const segmentMemberships = pgTable("segment_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  segmentId: uuid("segment_id").notNull().references(() => segments.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({ uniqueMember: unique("segment_memberships_unique").on(t.churchId, t.segmentId, t.memberId), tenantIdx: index("segment_memberships_church_idx").on(t.churchId), memberIdx: index("segment_memberships_member_idx").on(t.memberId) }));

export const memberMergeLogs = pgTable("member_merge_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  canonicalMemberId: text("canonical_member_id").notNull(),
  mergedMemberId: text("merged_member_id").notNull(),
  reason: text("reason").notNull(),
  differences: text("differences"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  target: text("target").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  createdIdx: index("activity_logs_created_at_idx").on(t.createdAt),
  actorIdx: index("activity_logs_actor_id_idx").on(t.actorId),
}));

export const organizationLeaders = pgTable("organization_leaders", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  organizationKind: text("organization_kind").notNull(),
  organizationId: uuid("organization_id").notNull(),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("Leader"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqueLeader: unique("organization_leaders_unique").on(t.churchId, t.organizationKind, t.organizationId, t.memberId),
  organizationIdx: index("organization_leaders_org_idx").on(t.churchId, t.organizationKind, t.organizationId),
}));

export const ministryApplications = pgTable(
  "ministry_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id").notNull().references(() => churches.id),
    ministryId: uuid("ministry_id").references(() => ministries.id),
    cellId: uuid("cell_id").references(() => cells.id),
    organizationKind: text("organization_kind").notNull().default("ministry"),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    ministry: text("ministry").notNull(),
    message: text("message"),
    status: text("status").notNull().default("PENDING"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("ministry_applications_member_id_idx").on(t.memberId),
    statusIdx: index("ministry_applications_status_idx").on(t.status),
  })
);

export const notificationMedia = pgTable("notification_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  storagePath: text("storage_path").notNull().unique(),
  mediaType: text("media_type").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const churchLocations = pgTable("church_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  serviceTimes: text("service_times"),
  contactInfo: text("contact_info"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  nameUnique: unique("church_locations_name_unique").on(t.name),
  activeIdx: index("church_locations_active_idx").on(t.active),
}));

export const busPickupPoints = pgTable("bus_pickup_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  managerName: text("manager_name").notNull(),
  managerPhone: text("manager_phone").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  nameUnique: unique("bus_pickup_points_name_unique").on(t.name),
  activeIdx: index("bus_pickup_points_active_idx").on(t.active),
}));

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id").notNull().references(() => churches.id),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  imageUrl: text("image_url"),
  isPaid: boolean("is_paid").notNull().default(false),
  price: integer("price"),
  notifyOnPublish: boolean("notify_on_publish").notNull().default(false),
  status: text("status").notNull().default("DRAFT"),
  eventType: text("event_type").notNull().default("Service"),
  timeZone: text("time_zone").notNull().default("Africa/Lagos"),
  allowRegistrationCancellation: boolean("allow_registration_cancellation").notNull().default(true),
  registrationForm: jsonb("registration_form").notNull().default([]),
  recurrenceRule: jsonb("recurrence_rule"),
  registrationRequired: boolean("registration_required").notNull().default(false),
  registrationOpensAt: timestamp("registration_opens_at", { withTimezone: true }),
  registrationClosesAt: timestamp("registration_closes_at", { withTimezone: true }),
  registrationCapacity: integer("registration_capacity"),
  allowWaitlist: boolean("allow_waitlist").notNull().default(false),
  organizerUnit: text("organizer_unit"),
  organizationKind: text("organization_kind"),
  organizationId: uuid("organization_id"),
  organizerContactPerson: text("organizer_contact_person"),
  organizerContactPhone: text("organizer_contact_phone"),
  isOnline: boolean("is_online").notNull().default(false),
  onlineUrl: text("online_url"),
  onlineAccessInstructions: text("online_access_instructions"),
  onlinePlatform: text("online_platform"),
  busTransportEnabled: boolean("bus_transport_enabled").notNull().default(false),
  locationType: text("location_type").notNull().default("CHURCH"),
  venueName: text("venue_name"),
  address: text("address"),
  mapInfo: text("map_info"),
  sendRegistrationConfirmation: boolean("send_registration_confirmation").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const eventPickupLocations = pgTable(
  "event_pickup_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    busPickupPointId: uuid("bus_pickup_point_id").references(() => busPickupPoints.id, { onDelete: "set null" }),
    locationName: text("location_name").notNull(),
    addressLandmark: text("address_landmark").notNull(),
    pickupTime: timestamp("pickup_time", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    eventIdx: index("event_pickup_locations_event_id_idx").on(t.eventId),
    busPickupPointIdx: index("event_pickup_locations_bus_pickup_point_id_idx").on(t.busPickupPointId),
    activeIdx: index("event_pickup_locations_active_idx").on(t.active),
  })
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id").notNull().references(() => churches.id),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    status: text("status").notNull().default("CONFIRMED"),
    attendanceStatus: text("attendance_status").notNull().default("REGISTERED"),
    pickupLocationId: uuid("pickup_location_id").references(() => eventPickupLocations.id, { onDelete: "set null" }),
    formAnswers: jsonb("form_answers").notNull().default({}),
    formSnapshot: jsonb("form_snapshot").notNull().default([]),
    referenceCode: text("reference_code"),
    waitlistPosition: integer("waitlist_position"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    eventMemberUnique: unique("event_registrations_event_member_unique").on(t.eventId, t.memberId),
    eventIdx: index("event_registrations_event_id_idx").on(t.eventId),
    memberIdx: index("event_registrations_member_id_idx").on(t.memberId),
    pickupIdx: index("event_registrations_pickup_location_id_idx").on(t.pickupLocationId),
  })
);

export const eventReminders = pgTable(
  "event_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id").notNull().references(() => churches.id),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    offsetMinutes: integer("offset_minutes").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    eventOffsetUnique: unique("event_reminders_event_offset_unique").on(t.eventId, t.offsetMinutes),
    dueIdx: index("event_reminders_due_idx").on(t.status, t.scheduledFor),
  })
);

// ─── push_devices ─────────────────────────────────────────────────────────────
// One member can have multiple browser/device registrations.

export const pushDevices = pgTable(
  "push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id").notNull().references(() => churches.id),
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
    churchId: uuid("church_id").notNull().references(() => churches.id),
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
    churchId: uuid("church_id").notNull().references(() => churches.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: notificationTypeEnum("type").notNull(),
    audience: audienceTypeEnum("audience").notNull(),
    // Audience filter context — which ministry / event / members
    audienceMinistryId: text("audience_ministry_id"),
    audienceCellId: uuid("audience_cell_id").references(() => cells.id, { onDelete: "set null" }),
    audienceSegmentId: uuid("audience_segment_id").references(() => segments.id, { onDelete: "set null" }),
    audienceEventId: text("audience_event_id"),
    audienceMemberIds: text("audience_member_ids").array(),
    // Where does tapping this notification go in the member app?
    destinationUrl: text("destination_url"),
    destinationType: text("destination_type").notNull().default("none"),
    destinationRoute: text("destination_route"),
    destinationMediaId: uuid("destination_media_id").references(() => notificationMedia.id, { onDelete: "set null" }),
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
    churchId: uuid("church_id").notNull().references(() => churches.id),
    memberId: text("member_id").notNull(),
    messageId: uuid("message_id").references(() => adminNotifications.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: notificationTypeEnum("type").notNull(),
    destinationUrl: text("destination_url"),
    destinationType: text("destination_type").notNull().default("none"),
    destinationRoute: text("destination_route"),
    destinationMediaId: uuid("destination_media_id").references(() => notificationMedia.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    destinationOpenedAt: timestamp("destination_opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("notifications_member_id_idx").on(t.memberId),
    readIdx: index("notifications_read_at_idx").on(t.readAt),
    messageIdx: index("notifications_message_id_idx").on(t.messageId),
  })
);

export const serviceReminders = pgTable(
  "service_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    serviceType: text("service_type").notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    serviceStartsAt: timestamp("service_starts_at", { withTimezone: true }).notNull(),
    offsetMinutes: text("offset_minutes").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberIdx: index("service_reminders_member_id_idx").on(t.memberId),
    dueIdx: index("service_reminders_due_idx").on(t.status, t.scheduledFor),
    uniqueReminder: unique("service_reminders_member_occurrence_offset_unique").on(t.memberId, t.occurrenceKey, t.offsetMinutes),
  })
);

// ─── notification_deliveries ──────────────────────────────────────────────────
// FCM delivery attempt per device. Idempotency via unique(notification_id, device_id).

export const birthdayNotificationSends = pgTable(
  "birthday_notification_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    birthdayDate: text("birthday_date").notNull(),
    status: text("status").notNull().default("processing"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    memberDateUnique: unique("birthday_notification_sends_member_date_unique").on(t.memberId, t.birthdayDate),
    memberIdx: index("birthday_notification_sends_member_id_idx").on(t.memberId),
    dateIdx: index("birthday_notification_sends_date_idx").on(t.birthdayDate),
  })
);

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
