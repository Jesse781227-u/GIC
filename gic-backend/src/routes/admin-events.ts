import { Hono } from "hono";
import { z } from "zod";
import { desc, count, and, eq, gte, sql } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  events,
  eventPickupLocations,
  eventRegistrations,
  eventReminders,
  members,
} from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";
import { recordActivity } from "../services/activity.service.js";

const app = new Hono();
app.use("*", authMiddleware, adminMiddleware);

const eventTypes = ["Service", "Conference", "Meeting", "Outreach", "Special Event", "Other"] as const;
const locationTypes = ["CHURCH", "PHYSICAL", "ONLINE"] as const;
const dateValue = z.string().datetime().nullable().optional();

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
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).default("DRAFT"),
  eventType: z.enum(eventTypes).default("Service"),
  registrationRequired: z.boolean().default(false),
  registrationOpensAt: dateValue,
  registrationClosesAt: dateValue,
  registrationCapacity: z.number().int().positive().nullable().optional(),
  allowWaitlist: z.boolean().default(false),
  organizerUnit: z.string().trim().nullable().optional(),
  organizerContactPerson: z.string().trim().nullable().optional(),
  organizerContactPhone: z.string().trim().nullable().optional(),
  isOnline: z.boolean().default(false),
  onlineUrl: z.string().trim().nullable().optional(),
  onlineAccessInstructions: z.string().trim().nullable().optional(),
  busTransportEnabled: z.boolean().default(false),
  locationType: z.enum(locationTypes).default("CHURCH"),
  venueName: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  mapInfo: z.string().trim().nullable().optional(),
  sendRegistrationConfirmation: z.boolean().default(false),
});
const eventSchema = eventSchemaBase.superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End time must be after start time" });
  }
  if (value.isPaid && value.price === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Price is required for paid events" });
  }
  if (value.registrationOpensAt && value.registrationClosesAt && new Date(value.registrationClosesAt) <= new Date(value.registrationOpensAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationClosesAt"], message: "Registration close time must be after open time" });
  }
  if (value.registrationRequired && value.registrationCapacity === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationCapacity"], message: "Capacity is required when registration is enabled" });
  }
  if (value.locationType === "ONLINE" && !value.isOnline) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["isOnline"], message: "Online location must enable online event" });
  }
  if (value.isOnline && !value.onlineUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["onlineUrl"], message: "Streaming link is required for online events" });
  }
});

const pickupSchema = z.object({
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

function eventValues(value: z.infer<typeof eventSchema>, createdBy: string) {
  return {
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
    registrationRequired: value.registrationRequired,
    registrationOpensAt: value.registrationOpensAt ? new Date(value.registrationOpensAt) : null,
    registrationClosesAt: value.registrationClosesAt ? new Date(value.registrationClosesAt) : null,
    registrationCapacity: value.registrationCapacity ?? null,
    allowWaitlist: value.allowWaitlist,
    organizerUnit: value.organizerUnit ?? null,
    organizerContactPerson: value.organizerContactPerson ?? null,
    organizerContactPhone: value.organizerContactPhone ?? null,
    isOnline: value.isOnline,
    onlineUrl: value.onlineUrl ?? null,
    onlineAccessInstructions: value.onlineAccessInstructions ?? null,
    busTransportEnabled: value.busTransportEnabled,
    locationType: value.locationType,
    venueName: value.venueName ?? null,
    address: value.address ?? null,
    mapInfo: value.mapInfo ?? null,
    sendRegistrationConfirmation: value.sendRegistrationConfirmation,
    createdBy,
    updatedAt: new Date(),
  };
}

async function eventWithCounts(event: typeof events.$inferSelect) {
  const [registrationCount] = await db.select({ value: count() }).from(eventRegistrations).where(and(
    eq(eventRegistrations.eventId, event.id),
    eq(eventRegistrations.status, "CONFIRMED"),
  ));
  return { ...event, registrationCount: Number(registrationCount?.value || 0) };
}

app.get("/", async (c) => {
  const records = await db.query.events.findMany({ orderBy: [desc(events.startsAt)] });
  return c.json({ events: await Promise.all(records.map(eventWithCounts)) });
});

app.post("/", async (c) => {
  const parsed = eventSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  const [event] = await db.insert(events).values(eventValues(parsed.data, c.get("user").sub)).returning();
  if (event.notifyOnPublish && event.status === "PUBLISHED") {
    const notification = await notificationService.createDraft({
      title: event.title,
      body: event.description || `${event.title} has been published.`,
      type: "EVENT_PUBLISHED",
      audience: "everyone",
      destinationUrl: "/events",
      createdBy: c.get("user").sub,
    });
    await notificationService.sendNow(notification.id);
  }
  await recordActivity({ actorId: c.get("user").sub, actorName: c.get("user").name, action: "Created event", target: event.title, targetId: event.id, metadata: { status: event.status } });
  return c.json({ event }, 201);
});

app.put("/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = eventSchemaBase.partial().extend({ startsAt: z.string().datetime() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid event", details: parsed.error.issues }, 400);
  const existing = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!existing) return c.json({ error: "Event not found" }, 404);
  const next = { ...existing, ...parsed.data };
  const normalized = eventSchema.safeParse(next);
  if (!normalized.success) return c.json({ error: "Invalid event", details: normalized.error.issues }, 400);
  const [event] = await db.update(events).set(eventValues(normalized.data, existing.createdBy)).where(eq(events.id, id)).returning();
  return c.json({ event });
});

app.get("/:id/pickup-locations", async (c) => {
  const event = await db.query.events.findFirst({ where: eq(events.id, c.req.param("id")) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  return c.json({ pickupLocations: await db.query.eventPickupLocations.findMany({ where: eq(eventPickupLocations.eventId, event.id), orderBy: [desc(eventPickupLocations.createdAt)] }) });
});

app.post("/:id/pickup-locations", async (c) => {
  const eventId = c.req.param("id");
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = pickupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid pickup location", details: parsed.error.issues }, 400);
  const [pickupLocation] = await db.insert(eventPickupLocations).values({
    eventId,
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
  const pickupId = c.req.param("pickupId");
  const existing = await db.query.eventPickupLocations.findFirst({ where: and(eq(eventPickupLocations.id, pickupId), eq(eventPickupLocations.eventId, eventId)) });
  if (!existing) return c.json({ error: "Pickup location not found" }, 404);
  const parsed = pickupSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid pickup location", details: parsed.error.issues }, 400);
  const [pickupLocation] = await db.update(eventPickupLocations).set({
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
  const deleted = await db.delete(eventPickupLocations).where(and(eq(eventPickupLocations.id, c.req.param("pickupId")), eq(eventPickupLocations.eventId, c.req.param("id")))).returning({ id: eventPickupLocations.id });
  if (!deleted.length) return c.json({ error: "Pickup location not found" }, 404);
  return c.json({ success: true });
});

app.get("/:id/registrations", async (c) => {
  const eventId = c.req.param("id");
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const registrations = await db.select({
    id: eventRegistrations.id,
    memberId: eventRegistrations.memberId,
    memberName: members.displayName,
    memberPhone: members.phone,
    status: eventRegistrations.status,
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

app.get("/:id/reminders", async (c) => {
  const reminders = await db.query.eventReminders.findMany({ where: eq(eventReminders.eventId, c.req.param("id")), orderBy: [desc(eventReminders.offsetMinutes)] });
  return c.json({ reminders });
});

app.put("/:id/reminders", async (c) => {
  const eventId = c.req.param("id");
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const parsed = reminderSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid reminders", details: parsed.error.issues }, 400);
  const offsets = [...new Set(parsed.data.offsets)];
  await db.transaction(async (tx) => {
    await tx.delete(eventReminders).where(eq(eventReminders.eventId, eventId));
    if (offsets.length) {
      await tx.insert(eventReminders).values(offsets.map((offsetMinutes) => ({
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

app.get("/summary", async (c) => {
  const now = new Date();
  const [upcoming] = await db.select({ value: count() }).from(events).where(and(eq(events.status, "PUBLISHED"), gte(events.startsAt, now)));
  return c.json({ upcomingEvents: Number(upcoming?.value || 0), asOf: now.toISOString() });
});

export default app;