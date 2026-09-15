import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import {
  events,
  eventPickupLocations,
  eventRegistrations,
  members,
  busPickupPoints,
} from "../db/schema.js";
import { notificationService } from "../services/notifications/notification.service.js";

const app = new Hono();
app.use("*", authMiddleware);

const registrationSchema = z.object({
  pickupLocationId: z.string().uuid().nullable().optional(),
});

function isRegistrationOpen(event: typeof events.$inferSelect, now = new Date()) {
  return event.registrationRequired
    && event.status === "PUBLISHED"
    && (!event.registrationOpensAt || event.registrationOpensAt <= now)
    && (!event.registrationClosesAt || event.registrationClosesAt > now);
}

type EventPickupWithReference = typeof eventPickupLocations.$inferSelect & {
  busPickupPoint?: typeof busPickupPoints.$inferSelect | null;
};

function formatEvent(event: typeof events.$inferSelect, pickupLocations: EventPickupWithReference[] = []) {
  return {
    ...event,
    registrationOpen: isRegistrationOpen(event),
    pickupLocations: event.busTransportEnabled ? pickupLocations.filter((location) => location.active).map((location) => ({
      ...location,
      managerName: location.busPickupPoint?.managerName || null,
      managerPhone: location.busPickupPoint?.managerPhone || null,
    })) : [],
  };
}

app.get("/", async (c) => {
  const records = await db.query.events.findMany({
    where: eq(events.status, "PUBLISHED"),
    orderBy: [asc(events.startsAt)],
  });
  const ids = records.map((event) => event.id);
  const pickupLocations = ids.length
    ? await db.query.eventPickupLocations.findMany({ where: inArray(eventPickupLocations.eventId, ids), orderBy: [asc(eventPickupLocations.pickupTime)], with: { busPickupPoint: true } })
    : [];
  return c.json({ events: records.map((event) => formatEvent(event, pickupLocations.filter((location) => location.eventId === event.id))) });
});

app.post("/:id/registrations", async (c) => {
  const event = await db.query.events.findFirst({ where: eq(events.id, c.req.param("id")) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  if (!isRegistrationOpen(event)) return c.json({ error: "Registration is not open for this event" }, 409);
  const parsed = registrationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid registration", details: parsed.error.issues }, 400);

  const memberId = c.get("user").sub;
  const existing = await db.query.eventRegistrations.findFirst({
    where: and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.memberId, memberId)),
  });
  if (existing) return c.json({ registration: existing, alreadyRegistered: true });

  const pickupLocationId = parsed.data.pickupLocationId ?? null;
  let pickupLocation: typeof eventPickupLocations.$inferSelect | undefined;
  if (event.busTransportEnabled) {
    if (!pickupLocationId) return c.json({ error: "Choose a bus pickup location" }, 400);
    pickupLocation = await db.query.eventPickupLocations.findFirst({
      where: and(eq(eventPickupLocations.id, pickupLocationId), eq(eventPickupLocations.eventId, event.id), eq(eventPickupLocations.active, true)),
    });
    if (!pickupLocation) return c.json({ error: "Pickup location is not available for this event" }, 400);
    const [pickupCount] = await db.select({ value: count() }).from(eventRegistrations).where(and(
      eq(eventRegistrations.pickupLocationId, pickupLocation.id),
      eq(eventRegistrations.status, "CONFIRMED"),
    ));
    if (Number(pickupCount?.value || 0) >= pickupLocation.capacity) {
      return c.json({ error: "That pickup location is full" }, 409);
    }
  } else if (pickupLocationId) {
    return c.json({ error: "Pickup selection is not available for this event" }, 400);
  }

  const [confirmedCount] = await db.select({ value: count() }).from(eventRegistrations).where(and(
    eq(eventRegistrations.eventId, event.id),
    eq(eventRegistrations.status, "CONFIRMED"),
  ));
  const isFull = event.registrationCapacity !== null && Number(confirmedCount?.value || 0) >= event.registrationCapacity;
  if (isFull && !event.allowWaitlist) return c.json({ error: "This event is full" }, 409);
  const status = isFull ? "WAITLISTED" : "CONFIRMED";
  const [registration] = await db.insert(eventRegistrations).values({
    eventId: event.id,
    memberId,
    status,
    pickupLocationId,
    updatedAt: new Date(),
  }).returning();

  if (status === "CONFIRMED" && event.sendRegistrationConfirmation) {
    await notificationService.sendToMember({
      memberId,
      title: "Registration confirmed",
      body: `Your registration for ${event.title} is confirmed.`,
      type: "REGISTRATION_CONFIRMATION",
      destinationUrl: `/events/${event.id}`,
    });
  }
  return c.json({ registration, event: { id: event.id, title: event.title }, pickupLocation: pickupLocation || null }, 201);
});

app.get("/registrations", async (c) => {
  const registrations = await db.select({
    id: eventRegistrations.id,
    eventId: eventRegistrations.eventId,
    status: eventRegistrations.status,
    registeredAt: eventRegistrations.registeredAt,
    pickupLocationId: eventRegistrations.pickupLocationId,
    pickupLocationName: eventPickupLocations.locationName,
    pickupLocationAddress: eventPickupLocations.addressLandmark,
    pickupLocationTime: eventPickupLocations.pickupTime,
    pickupManagerName: busPickupPoints.managerName,
    pickupManagerPhone: busPickupPoints.managerPhone,
    eventTitle: events.title,
    startsAt: events.startsAt,
    location: events.location,
  }).from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .leftJoin(eventPickupLocations, eq(eventPickupLocations.id, eventRegistrations.pickupLocationId))
    .where(eq(eventRegistrations.memberId, c.get("user").sub))
    .orderBy(desc(events.startsAt));
  return c.json({ registrations });
});

app.get("/:id", async (c) => {
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.status, "PUBLISHED")) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const pickupLocations = await db.query.eventPickupLocations.findMany({
    where: and(eq(eventPickupLocations.eventId, event.id), eq(eventPickupLocations.active, true)),
    orderBy: [asc(eventPickupLocations.pickupTime)],
    with: { busPickupPoint: true },
  });
  const registration = await db.query.eventRegistrations.findFirst({
    where: and(eq(eventRegistrations.eventId, event.id), eq(eventRegistrations.memberId, c.get("user").sub)),
  });
  return c.json({ event: formatEvent(event, pickupLocations), registration: registration || null });
});

export default app;