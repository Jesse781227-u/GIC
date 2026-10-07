import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { desc, count, and, eq, gte, like, sql } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  events,
  eventInterests,
  eventPickupLocations,
  eventRegistrations,
  eventReminders,
  serviceReminders,
  members,
  busPickupPoints,
  ministries,
  cells,
} from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { recordActivity } from "../services/activity.service.js";
import { churchIdForUser } from "../lib/tenant.js";
import { canTransitionEvent, eventRegistrationAvailability, eventStatuses, validateEventForm, type RegistrationField } from "../services/event-domain.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

app.get("/summary", async (c) => {
  const now = new Date();
  const churchId = churchIdForUser(c.get("user"));
  const [upcoming] = await db.select({ value: count() }).from(events).where(and(eq(events.churchId, churchId), eq(events.status, "PUBLISHED"), gte(events.startsAt, now)));
  return c.json({ upcomingEvents: Number(upcoming?.value || 0), asOf: now.toISOString() });
});

const eventTypes = ["Service", "Conference", "Wedding", "Children", "Outreach", "Meeting", "Retreat", "Convention", "Fellowship", "Training", "Special Event", "Other"] as const;
const locationTypes = ["CHURCH", "PHYSICAL", "ONLINE", "HYBRID"] as const;
const dateValue = z.string().datetime().nullable().optional();
const registrationFieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "email", "phone", "textarea", "checkbox", "number", "date", "select", "radio"]),
  required: z.boolean().default(false),
});

const eventSchemaBase = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: dateValue,
  location: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  isPaid: z.boolean().default(false),
  price: z.number().int().nonnegative().nullable().optional(),
  notifyOnPublish: z.boolean().default(false),
  status: z.enum(eventStatuses).default("DRAFT"),
  eventType: z.enum(eventTypes).default("Service"),
  timeZone: z.string().trim().default("Africa/Lagos"),
  allowRegistrationCancellation: z.boolean().default(true),
  registrationForm: z.array(registrationFieldSchema).max(40).default([]),
  recurrenceRule: z.record(z.unknown()).nullable().optional(),
  registrationRequired: z.boolean().default(false),
  registrationOpensAt: dateValue,
  registrationClosesAt: dateValue,
  registrationCapacity: z.number().int().positive().nullable().optional(),
  allowWaitlist: z.boolean().default(false),
  organizerUnit: z.string().trim().nullable().optional(),
  organizationKind: z.enum(["ministry", "cell"]).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  organizerContactPerson: z.string().trim().nullable().optional(),
  organizerContactPhone: z.string().trim().nullable().optional(),
  isOnline: z.boolean().default(false),
  onlineUrl: z.string().trim().nullable().optional(),
  onlineAccessInstructions: z.string().trim().nullable().optional(),
  onlinePlatform: z.string().trim().nullable().optional(),
  busTransportEnabled: z.boolean().default(false),
  locationType: z.enum(locationTypes).default("CHURCH"),
  venueName: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  mapInfo: z.string().trim().nullable().optional(),
  sendRegistrationConfirmation: z.boolean().default(false),
  builderData: z.record(z.unknown()).default({}),
});
const eventSchema = eventSchemaBase.superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End time must be after start time" });
  }
  if (value.isPaid && value.price == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Price is required for paid events" });
  }
  if (value.registrationOpensAt && value.registrationClosesAt && new Date(value.registrationClosesAt) <= new Date(value.registrationOpensAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationClosesAt"], message: "Registration close time must be after open time" });
  }
  if (["ONLINE", "HYBRID"].includes(value.locationType) && !value.isOnline) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["isOnline"], message: "Online location must enable online event" });
  }
  if (value.isOnline && !value.onlineUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["onlineUrl"], message: "Streaming link is required for online events" });
  }
});

const pickupSchema = z.object({
  busPickupPointId: z.string().uuid().nullable().optional(),
  locationName: z.string().trim().min(1),
  addressLandmark: z.string().trim().min(1),
  pickupTime: z.string().datetime(),
  capacity: z.number().int().positive(),
  notes: z.string().trim().nullable().optional(),
  active: z.boolean().default(true),
});

const reminderSchema = z.object({
  offsets: z.array(z.number().int().positive()).max(20),
});

function eventValues(value: z.infer<typeof eventSchema>, createdBy: string, churchId: string) {
  return {
    churchId,
    title: value.title,
    description: value.description ?? null,
    startsAt: new Date(value.startsAt),
    endsAt: value.endsAt ? new Date(value.endsAt) : null,
    location: value.location ?? null,
    imageUrl: value.imageUrl ?? null,
    isPaid: value.isPaid,
    price: value.price ?? null,
    notifyOnPublish: value.notifyOnPublish,
    status: value.status,
    eventType: value.eventType,
    timeZone: value.timeZone,
    allowRegistrationCancellation: value.allowRegistrationCancellation,
    registrationForm: value.registrationForm,
    recurrenceRule: value.recurrenceRule ?? null,
    registrationRequired: value.registrationRequired,
    registrationOpensAt: value.registrationOpensAt ? new Date(value.registrationOpensAt) : null,
    registrationClosesAt: value.registrationClosesAt ? new Date(value.registrationClosesAt) : null,
    registrationCapacity: value.registrationCapacity ?? null,
    allowWaitlist: value.allowWaitlist,
    organizerUnit: value.organizerUnit ?? null,
    organizationKind: value.organizationKind ?? null,
    organizationId: value.organizationId ?? null,
    organizerContactPerson: value.organizerContactPerson ?? null,
    organizerContactPhone: value.organizerContactPhone ?? null,
    isOnline: value.isOnline,
    onlineUrl: value.onlineUrl ?? null,
    onlineAccessInstructions: value.onlineAccessInstructions ?? null,
    onlinePlatform: value.onlinePlatform ?? null,
    busTransportEnabled: value.busTransportEnabled,
    locationType: value.locationType,
    venueName: value.venueName ?? null,
    address: value.address ?? null,
    mapInfo: value.mapInfo ?? null,
    sendRegistrationConfirmation: value.sendRegistrationConfirmation,
    builderData: value.builderData,
    createdBy,
    updatedAt: new Date(),
  };
}

async function eventWithCounts(event: typeof events.$inferSelect) {
  const [counts, interestCount] = await Promise.all([
    db.select({ status: eventRegistrations.status, value: count() }).from(eventRegistrations).where(and(
      eq(eventRegistrations.eventId, event.id),
      eq(eventRegistrations.churchId, event.churchId),
    )).groupBy(eventRegistrations.status),
    db.select({ value: count() }).from(eventInterests).where(and(
      eq(eventInterests.eventId, event.id),
      eq(eventInterests.churchId, event.churchId),
    )),
  ]);
  const confirmed = Number(counts.find((row) => row.status === "CONFIRMED")?.value || 0);
  const waitlisted = Number(counts.find((row) => row.status === "WAITLISTED")?.value || 0);
  return { ...event, registrationCount: confirmed, waitlistCount: waitlisted, interestCount: Number(interestCount[0]?.value || 0) };
}

async function notifyEventRegistrants(churchId: string, event: typeof events.$inferSelect, type: "EVENT_UPDATED" | "EVENT_CANCELLED", actorId: string, body: string) {
  const draft = await notificationService.createDraft({
    churchId, title: event.title, body, type, audience: "event_registrants",
    audienceEventId: event.id, destinationUrl: `/events/${event.id}`, createdBy: actorId,
  });
  return notificationService.sendNow(draft.id);
}

async function notifyEventPublished(churchId: string, event: typeof events.$inferSelect, actorId: string) {
  const draft = await notificationService.createDraft({
    churchId,
    title: event.title,
    body: event.description || `${event.title} has been published.`,
    type: "EVENT_PUBLISHED",
    audience: "everyone",
    destinationUrl: `/events/${event.id}`,
    createdBy: actorId,
  });
  return notificationService.sendNow(draft.id);
}

app.get("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const records = await db.query.events.findMany({ where: eq(events.churchId, churchId), orderBy: [desc(events.startsAt)] });
  return c.json({ events: await Promise.all(records.map(eventWithCounts)) });
});

app.post("/", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const parsed = eventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  if (parsed.data.status !== "DRAFT") return c.json({ error: "New events must be saved as Draft and published explicitly." }, 400);
  if (parsed.data.organizationId && !parsed.data.organizationKind) return c.json({ error: "Choose an organization type." }, 400);
  if (parsed.data.organizationId) {
    const organization = parsed.data.organizationKind === "cell"
      ? await db.query.cells.findFirst({ where: and(eq(cells.id, parsed.data.organizationId), eq(cells.churchId, churchId)) })
      : await db.query.ministries.findFirst({ where: and(eq(ministries.id, parsed.data.organizationId), eq(ministries.churchId, churchId)) });
    if (!organization) return c.json({ error: "Organization not found." }, 400);
  }
  const [event] = await db.insert(events).values(eventValues(parsed.data, c.get("user").sub, churchId)).returning();
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Created event", target: event.title, targetId: event.id, metadata: { status: event.status } });
  return c.json({ event }, 201);
});

app.patch("/:id/status", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const id = c.req.param("id");
  const parsed = z.object({ status: z.enum(eventStatuses), notifyMembers: z.boolean().default(false) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid event status" }, 400);
  const current = await db.query.events.findFirst({ where: and(eq(events.id, id), eq(events.churchId, churchId)) });
  if (!current) return c.json({ error: "Event not found" }, 404);
  if (!canTransitionEvent(current.status, parsed.data.status)) return c.json({ error: `Cannot transition event from ${current.status} to ${parsed.data.status}.` }, 409);
  if (parsed.data.status === "PUBLISHED" && current.isPaid) return c.json({ error: "Paid events cannot be published until payment processing is available." }, 409);
  const [event] = await db.update(events).set({ status: parsed.data.status, updatedAt: new Date() }).where(and(eq(events.id, id), eq(events.churchId, churchId))).returning();
  const action = parsed.data.status === "PUBLISHED" ? "Published event" : parsed.data.status === "UNPUBLISHED" ? "Unpublished event" : parsed.data.status === "CANCELLED" ? "Cancelled event" : "Completed event";
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action, target: event.title, targetId: event.id, metadata: { from: current.status, to: event.status } });
  if (event.status === "PUBLISHED") {
    void notifyEventPublished(churchId, event, c.get("user").sub)
      .catch((error) => console.error(`Event publish notification failed for ${event.id}:`, error));
  } else if (event.status === "CANCELLED" && parsed.data.notifyMembers) {
    void notifyEventRegistrants(churchId, event, "EVENT_CANCELLED", c.get("user").sub, `${event.title} has been cancelled.`)
      .catch((error) => console.error(`Event cancellation notification failed for ${event.id}:`, error));
  }
  return c.json({ event: await eventWithCounts(event) });
});

app.delete("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const id = c.req.param("id");
  const deleted = await db.transaction(async (tx) => {
    const current = await tx.query.events.findFirst({ where: and(eq(events.id, id), eq(events.churchId, churchId)) });
    if (!current) return null;
    const [registrationTotal] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.churchId, churchId)));
    await tx.delete(serviceReminders).where(like(serviceReminders.occurrenceKey, `${id}:%`));
    const [event] = await tx.delete(events).where(and(eq(events.id, id), eq(events.churchId, churchId))).returning();
    return event ? { event, registrationCount: Number(registrationTotal?.value || 0) } : null;
  });
  if (!deleted) return c.json({ error: "Event not found" }, 404);

  const user = c.get("user");
  await recordActivity({
    churchId,
    actorId: user.sub,
    actorName: user.name,
    action: "Deleted event",
    target: deleted.event.title,
    targetId: id,
    metadata: { status: deleted.event.status, registrationsDeleted: deleted.registrationCount },
  }).catch((error) => console.error("Failed to record event deletion activity", error));

  return c.json({ success: true, deletedId: id, registrationsDeleted: deleted.registrationCount });
});

app.post("/:id/duplicate", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const source = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!source) return c.json({ error: "Event not found" }, 404);
  const { id: _sourceId, createdAt: _sourceCreatedAt, updatedAt: _sourceUpdatedAt, ...sourceValues } = source;
  const [duplicate] = await db.insert(events).values({
    ...sourceValues,
    title: `${source.title} (Copy)`,
    status: "DRAFT",
    notifyOnPublish: false,
    createdBy: c.get("user").sub,
    updatedAt: new Date(),
  }).returning();
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Duplicated event", target: duplicate.title, targetId: duplicate.id, metadata: { sourceEventId: source.id } });
  return c.json({ event: duplicate }, 201);
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const parsed = eventSchemaBase.partial().extend({ startsAt: z.string().datetime(), notifyAffectedMembers: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  if (parsed.data.status !== undefined) return c.json({ error: "Use the explicit event status action to publish, unpublish, cancel, or complete." }, 409);
  const existing = await db.query.events.findFirst({ where: and(eq(events.id, id), eq(events.churchId, churchId)) });
  if (!existing) return c.json({ error: "Event not found" }, 404);
  const { notifyAffectedMembers = false, ...updates } = parsed.data;
  const existingValues = {
    ...existing,
    startsAt: existing.startsAt.toISOString(),
    endsAt: existing.endsAt?.toISOString() ?? null,
    registrationOpensAt: existing.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: existing.registrationClosesAt?.toISOString() ?? null,
  };
  const next = { ...existingValues, ...updates };
  const normalized = eventSchema.safeParse(next);
  if (!normalized.success) return c.json({ error: "Invalid event", details: normalized.error.issues }, 400);
  if (existing.status === "PUBLISHED" && normalized.data.isPaid) return c.json({ error: "Published events cannot be changed to paid until payment processing is available." }, 409);
  if (normalized.data.organizationId) {
    const organization = normalized.data.organizationKind === "cell"
      ? await db.query.cells.findFirst({ where: and(eq(cells.id, normalized.data.organizationId), eq(cells.churchId, churchId)) })
      : await db.query.ministries.findFirst({ where: and(eq(ministries.id, normalized.data.organizationId), eq(ministries.churchId, churchId)) });
    if (!organization) return c.json({ error: "Organization not found." }, 400);
  }
  const [event] = await db.update(events).set(eventValues(normalized.data, existing.createdBy, churchId)).where(and(eq(events.id, id), eq(events.churchId, churchId))).returning();
  const importantFields = ["startsAt", "endsAt", "registrationOpensAt", "registrationClosesAt", "registrationCapacity", "location", "venueName", "address"] as const;
  const changes = importantFields.filter((field) => String(existing[field] ?? "") !== String(event[field] ?? ""));
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Updated event", target: event.title, targetId: event.id, metadata: { changedFields: Object.keys(updates), importantChanges: changes } });
  if (notifyAffectedMembers && changes.length && existing.status === "PUBLISHED") {
    void notifyEventRegistrants(churchId, event, "EVENT_UPDATED", c.get("user").sub, `${event.title} has important updates: ${changes.join(", ")}.`)
      .catch((error) => console.error(`Event update push failed for ${event.id}:`, error));
  }
  return c.json({ event: await eventWithCounts(event) });
});

app.get("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  return c.json({ event: await eventWithCounts(event) });
});

app.get("/:id/pickup-locations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const pickupLocations = await db.query.eventPickupLocations.findMany({
    where: eq(eventPickupLocations.eventId, event.id),
    orderBy: [desc(eventPickupLocations.createdAt)],
    with: { busPickupPoint: true },
  });
  return c.json({ pickupLocations });
});

app.post("/:id/pickup-locations", async (c) => {
  const eventId = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = pickupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid pickup location", details: parsed.error.issues }, 400);
  if (parsed.data.busPickupPointId) {
    const pickupPoint = await db.query.busPickupPoints.findFirst({ where: and(eq(busPickupPoints.id, parsed.data.busPickupPointId), eq(busPickupPoints.active, true)) });
    if (!pickupPoint) return c.json({ error: "Pickup point is not available" }, 400);
  }
  const [pickupLocation] = await db.insert(eventPickupLocations).values({
    eventId,
    busPickupPointId: parsed.data.busPickupPointId ?? null,
    locationName: parsed.data.locationName,
    addressLandmark: parsed.data.addressLandmark,
    pickupTime: new Date(parsed.data.pickupTime),
    capacity: parsed.data.capacity,
    notes: parsed.data.notes ?? null,
    active: parsed.data.active,
    updatedAt: new Date(),
  }).returning();
  return c.json({ pickupLocation }, 201);
});

app.put("/:id/pickup-locations/:pickupId", async (c) => {
  const eventId = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const pickupId = c.req.param("pickupId");
  const existing = await db.query.eventPickupLocations.findFirst({ where: and(eq(eventPickupLocations.id, pickupId), eq(eventPickupLocations.eventId, eventId)) });
  if (!existing) return c.json({ error: "Pickup location not found" }, 404);
  const parsed = pickupSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid pickup location", details: parsed.error.issues }, 400);
  if (parsed.data.busPickupPointId) {
    const pickupPoint = await db.query.busPickupPoints.findFirst({ where: and(eq(busPickupPoints.id, parsed.data.busPickupPointId), eq(busPickupPoints.active, true)) });
    if (!pickupPoint) return c.json({ error: "Pickup point is not available" }, 400);
  }
  const [pickupLocation] = await db.update(eventPickupLocations).set({
    ...(parsed.data.busPickupPointId === undefined ? {} : { busPickupPointId: parsed.data.busPickupPointId }),
    ...(parsed.data.locationName === undefined ? {} : { locationName: parsed.data.locationName }),
    ...(parsed.data.addressLandmark === undefined ? {} : { addressLandmark: parsed.data.addressLandmark }),
    ...(parsed.data.pickupTime === undefined ? {} : { pickupTime: new Date(parsed.data.pickupTime) }),
    ...(parsed.data.capacity === undefined ? {} : { capacity: parsed.data.capacity }),
    ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
    ...(parsed.data.active === undefined ? {} : { active: parsed.data.active }),
    updatedAt: new Date(),
  }).where(eq(eventPickupLocations.id, pickupId)).returning();
  return c.json({ pickupLocation });
});

app.delete("/:id/pickup-locations/:pickupId", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const deleted = await db.delete(eventPickupLocations).where(and(eq(eventPickupLocations.id, c.req.param("pickupId")), eq(eventPickupLocations.eventId, c.req.param("id")))).returning({ id: eventPickupLocations.id });
  if (!deleted.length) return c.json({ error: "Pickup location not found" }, 404);
  return c.json({ success: true });
});

app.get("/:id/registrations", async (c) => {
  const eventId = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const registrations = await db.select({
    id: eventRegistrations.id,
    memberId: eventRegistrations.memberId,
    memberName: members.displayName,
    memberEmail: members.email,
    memberPhone: members.phone,
    memberAvatar: members.avatar,
    memberCenter: members.center,
    status: eventRegistrations.status,
    attendanceStatus: eventRegistrations.attendanceStatus,
    formAnswers: eventRegistrations.formAnswers,
    referenceCode: eventRegistrations.referenceCode,
    waitlistPosition: eventRegistrations.waitlistPosition,
    registeredAt: eventRegistrations.registeredAt,
    pickupLocationId: eventRegistrations.pickupLocationId,
    pickupLocationName: eventPickupLocations.locationName,
  }).from(eventRegistrations)
    .leftJoin(members, eq(members.id, eventRegistrations.memberId))
    .leftJoin(eventPickupLocations, eq(eventPickupLocations.id, eventRegistrations.pickupLocationId))
    .where(eq(eventRegistrations.eventId, eventId))
    .orderBy(desc(eventRegistrations.registeredAt));
  const passengerCounts = await db.select({
    pickupLocationId: eventRegistrations.pickupLocationId,
    pickupLocationName: eventPickupLocations.locationName,
    passengerCount: count(),
  }).from(eventRegistrations)
    .leftJoin(eventPickupLocations, eq(eventPickupLocations.id, eventRegistrations.pickupLocationId))
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "CONFIRMED")))
    .groupBy(eventRegistrations.pickupLocationId, eventPickupLocations.locationName);
  return c.json({ registrations, passengerCounts });
});

app.get("/:id/interests", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const eventId = c.req.param("id");
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const interests = await db.select({
    id: eventInterests.id,
    memberId: members.id,
    memberName: members.displayName,
    memberEmail: members.email,
    memberPhone: members.phone,
    memberAvatar: members.avatar,
    memberCenter: members.center,
    interestedAt: eventInterests.createdAt,
  }).from(eventInterests)
    .innerJoin(members, and(eq(members.id, eventInterests.memberId), eq(members.churchId, churchId)))
    .where(and(eq(eventInterests.eventId, eventId), eq(eventInterests.churchId, churchId)))
    .orderBy(desc(eventInterests.createdAt));
  return c.json({ interests });
});

app.patch("/:id/registrations/:registrationId/attendance", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = z.object({ attendanceStatus: z.enum(["REGISTERED", "ATTENDED", "DID_NOT_ATTEND"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid attendance status" }, 400);
  const [registration] = await db.update(eventRegistrations)
    .set({ attendanceStatus: parsed.data.attendanceStatus, updatedAt: new Date() })
    .where(and(eq(eventRegistrations.id, c.req.param("registrationId")), eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.churchId, churchId), eq(eventRegistrations.status, "CONFIRMED")))
    .returning();
  if (!registration) return c.json({ error: "Confirmed registration not found" }, 404);
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Changed event attendance", target: event.title, targetId: registration.memberId, metadata: { attendanceStatus: parsed.data.attendanceStatus, registrationId: registration.id } });
  return c.json({ registration });
});

app.put("/:id/form", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = z.object({ fields: z.array(registrationFieldSchema).max(40) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid registration form", details: parsed.error.issues }, 400);
  if (new Set(parsed.data.fields.map((field) => field.id)).size !== parsed.data.fields.length) return c.json({ error: "Form field IDs must be unique." }, 400);
  const [updated] = await db.update(events).set({ registrationForm: parsed.data.fields, updatedAt: new Date() }).where(and(eq(events.id, event.id), eq(events.churchId, churchId))).returning();
  await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Changed event registration form", target: event.title, targetId: event.id, metadata: { fieldCount: parsed.data.fields.length } });
  return c.json({ event: updated });
});

app.post("/:id/registrations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const eventId = c.req.param("id");
  const parsed = z.object({ memberId: z.string().min(1), pickupLocationId: z.string().uuid().nullable().optional(), answers: z.record(z.unknown()).default({}) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid registration" }, 400);
  const member = await db.query.members.findFirst({ where: and(eq(members.id, parsed.data.memberId), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Active member not found" }, 404);
  try {
    const registration = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} AND church_id = ${churchId} FOR UPDATE`);
      const event = await tx.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
      if (!event) throw new Error("Event not found");
      if (event.status !== "PUBLISHED") throw new Error("Only published events can accept registrations.");
      const answersError = validateEventForm(event.registrationForm as RegistrationField[], parsed.data.answers);
      if (answersError.length) throw new Error(answersError.join(" "));
      if (event.busTransportEnabled && !parsed.data.pickupLocationId) throw new Error("Choose a bus pickup location.");
      let pickup = null;
      if (parsed.data.pickupLocationId) {
        await tx.execute(sql`SELECT id FROM event_pickup_locations WHERE id = ${parsed.data.pickupLocationId} AND event_id = ${eventId} FOR UPDATE`);
        pickup = await tx.query.eventPickupLocations.findFirst({ where: and(eq(eventPickupLocations.id, parsed.data.pickupLocationId), eq(eventPickupLocations.eventId, eventId), eq(eventPickupLocations.active, true)) });
        if (!pickup) throw new Error("Pickup location is unavailable.");
        const [pickupCount] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.pickupLocationId, pickup.id), eq(eventRegistrations.status, "CONFIRMED")));
        if (Number(pickupCount?.value || 0) >= pickup.capacity) throw new Error("Pickup location is full.");
      }
      const [confirmedCount] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "CONFIRMED")));
      const full = event.registrationCapacity !== null && Number(confirmedCount?.value || 0) >= event.registrationCapacity;
      if (full && !event.allowWaitlist) throw new Error("Event capacity is full.");
      const existing = await tx.query.eventRegistrations.findFirst({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.memberId, member.id)) });
      if (existing && ["CONFIRMED", "WAITLISTED"].includes(existing.status)) throw new Error("Member is already registered.");
      const [waitingCount] = full ? await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "WAITLISTED"))) : [{ value: 0 }];
      const values = { churchId, eventId, memberId: member.id, status: full ? "WAITLISTED" : "CONFIRMED", attendanceStatus: "REGISTERED", pickupLocationId: parsed.data.pickupLocationId ?? null, formAnswers: parsed.data.answers, formSnapshot: event.registrationForm, referenceCode: `GIC-${randomUUID().slice(0, 8).toUpperCase()}`, waitlistPosition: full ? Number(waitingCount?.value || 0) + 1 : null, cancelledAt: null, updatedAt: new Date() };
      const [saved] = existing ? await tx.update(eventRegistrations).set(values).where(eq(eventRegistrations.id, existing.id)).returning() : await tx.insert(eventRegistrations).values(values).returning();
      return saved;
    });
    await recordActivity({ churchId, actorId: c.get("user").sub, actorName: c.get("user").name, action: "Manually registered member for event", target: eventId, targetId: registration.memberId, metadata: { registrationId: registration.id } });
    return c.json({ registration }, 201);
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Registration could not be created." }, 409); }
});

app.get("/:id/reminders", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const reminders = await db.query.eventReminders.findMany({ where: eq(eventReminders.eventId, c.req.param("id")), orderBy: [desc(eventReminders.offsetMinutes)] });
  return c.json({ reminders });
});

app.put("/:id/reminders", async (c) => {
  const eventId = c.req.param("id");
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = reminderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid reminders", details: parsed.error.issues }, 400);
  const offsets = [...new Set(parsed.data.offsets)];
  await db.transaction(async (tx) => {
    await tx.delete(eventReminders).where(eq(eventReminders.eventId, eventId));
    if (offsets.length) {
      await tx.insert(eventReminders).values(offsets.map((offsetMinutes) => ({
        churchId,
        eventId,
        offsetMinutes,
        scheduledFor: new Date(event.startsAt.getTime() - offsetMinutes * 60_000),
        status: "pending",
        createdBy: c.get("user").sub,
        updatedAt: new Date(),
      })));
    }
  });
  return c.json({ reminders: await db.query.eventReminders.findMany({ where: eq(eventReminders.eventId, eventId), orderBy: [desc(eventReminders.offsetMinutes)] }) });
});

export default app;
