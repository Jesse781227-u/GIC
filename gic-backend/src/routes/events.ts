import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
import { churchIdForUser } from "../lib/tenant.js";
import { eventRegistrationAvailability, validateEventForm, type RegistrationField } from "../services/event-domain.js";

const app = new Hono();
app.use("*", authMiddleware);

const registrationSchema = z.object({
  pickupLocationId: z.string().uuid().nullable().optional(),
  answers: z.record(z.unknown()).default({}),
});

function isRegistrationOpen(event: typeof events.$inferSelect, now = new Date()) {
  return eventRegistrationAvailability(event, now).allowed;
}

function registrationMessage(reason: string) {
  if (reason === "not_open") return "Registration has not opened yet.";
  if (reason === "closed") return "Registration is closed.";
  if (reason === "cancelled") return "This event has been cancelled.";
  if (reason === "completed") return "This event has already completed.";
  return "This event is not available for registration yet.";
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
  const churchId = churchIdForUser(c.get("user"));
  const records = await db.query.events.findMany({
    where: and(eq(events.churchId, churchId), eq(events.status, "PUBLISHED")),
    orderBy: [asc(events.startsAt)],
  });
  const ids = records.map((event) => event.id);
  const pickupLocations = ids.length
    ? await db.query.eventPickupLocations.findMany({ where: inArray(eventPickupLocations.eventId, ids), orderBy: [asc(eventPickupLocations.pickupTime)], with: { busPickupPoint: true } })
    : [];
  return c.json({ events: records.map((event) => formatEvent(event, pickupLocations.filter((location) => location.eventId === event.id))) });
});

app.post("/:id/registrations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const eventId = c.req.param("id");
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  const availability = eventRegistrationAvailability(event);
  if (!availability.allowed) return c.json({ error: registrationMessage(availability.reason), reason: availability.reason }, 409);
  const parsed = registrationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid registration", details: parsed.error.issues }, 400);
  const memberId = c.get("user").sub;
  const member = await db.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.churchId, churchId), eq(members.active, true)) });
  if (!member) return c.json({ error: "Member account not found" }, 404);
  const formErrors = validateEventForm(event.registrationForm as RegistrationField[], parsed.data.answers);
  if (formErrors.length) return c.json({ error: "Please check the registration form.", details: formErrors }, 400);
  const pickupLocationId = parsed.data.pickupLocationId ?? null;
  if (!event.busTransportEnabled && pickupLocationId) {
    return c.json({ error: "Pickup selection is not available for this event" }, 400);
  }
  let outcome: { registration: typeof eventRegistrations.$inferSelect; pickupLocation: typeof eventPickupLocations.$inferSelect | null; alreadyRegistered: boolean };
  try {
    outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} AND church_id = ${churchId} FOR UPDATE`);
      const lockedEvent = await tx.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
      if (!lockedEvent) throw new Error("Event not found");
      const lockedAvailability = eventRegistrationAvailability(lockedEvent);
      if (!lockedAvailability.allowed) throw new Error(registrationMessage(lockedAvailability.reason));
      const existing = await tx.query.eventRegistrations.findFirst({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.memberId, memberId)) });
      if (existing && ["CONFIRMED", "WAITLISTED"].includes(existing.status)) return { registration: existing, pickupLocation: null, alreadyRegistered: true };

      let pickupLocation: typeof eventPickupLocations.$inferSelect | null = null;
      if (lockedEvent.busTransportEnabled) {
        if (!pickupLocationId) throw new Error("Choose a bus pickup location.");
        await tx.execute(sql`SELECT id FROM event_pickup_locations WHERE id = ${pickupLocationId} AND event_id = ${eventId} FOR UPDATE`);
        pickupLocation = await tx.query.eventPickupLocations.findFirst({ where: and(eq(eventPickupLocations.id, pickupLocationId), eq(eventPickupLocations.eventId, eventId), eq(eventPickupLocations.active, true)) }) || null;
        if (!pickupLocation) throw new Error("Pickup location is not available for this event.");
        const [pickupCount] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.pickupLocationId, pickupLocation.id), eq(eventRegistrations.status, "CONFIRMED")));
        if (Number(pickupCount?.value || 0) >= pickupLocation.capacity) throw new Error("That pickup location is full.");
      }

      const [confirmedCount] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "CONFIRMED")));
      const isFull = lockedEvent.registrationCapacity !== null && Number(confirmedCount?.value || 0) >= lockedEvent.registrationCapacity;
      if (isFull && !lockedEvent.allowWaitlist) throw new Error("This event is full.");
      const status = isFull ? "WAITLISTED" : "CONFIRMED";
      const [waitlistCount] = status === "WAITLISTED" ? await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "WAITLISTED"))) : [{ value: 0 }];
      const values = { churchId, eventId, memberId, status, attendanceStatus: "REGISTERED", pickupLocationId, formAnswers: parsed.data.answers, formSnapshot: lockedEvent.registrationForm, referenceCode: `GIC-${randomUUID().slice(0, 8).toUpperCase()}`, waitlistPosition: status === "WAITLISTED" ? Number(waitlistCount?.value || 0) + 1 : null, cancelledAt: null, updatedAt: new Date() };
      const [registration] = existing
        ? await tx.update(eventRegistrations).set(values).where(eq(eventRegistrations.id, existing.id)).returning()
        : await tx.insert(eventRegistrations).values(values).returning();
      return { registration, pickupLocation, alreadyRegistered: false };
    });
  } catch (registrationError) {
    return c.json({ error: registrationError instanceof Error ? registrationError.message : "Registration could not be completed." }, 409);
  }

  if (!outcome.alreadyRegistered && outcome.registration.status === "CONFIRMED" && event.sendRegistrationConfirmation) {
    await notificationService.sendToMember({ memberId, title: "Registration confirmed", body: `Your registration for ${event.title} is confirmed. Reference: ${outcome.registration.referenceCode}.`, type: "REGISTRATION_CONFIRMATION", destinationUrl: `/events/${event.id}` });
  }
  if (!outcome.alreadyRegistered && outcome.registration.status === "WAITLISTED") {
    await notificationService.sendToMember({ memberId, title: "Added to event waitlist", body: `You are waitlisted for ${event.title}. Position ${outcome.registration.waitlistPosition}.`, type: "REGISTRATION_CONFIRMATION", destinationUrl: `/events/${event.id}` });
  }
  return c.json({ ...outcome, event: { id: event.id, title: event.title } }, outcome.alreadyRegistered ? 200 : 201);
});

app.delete("/:id/registrations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const eventId = c.req.param("id");
  const memberId = c.get("user").sub;
  const event = await db.query.events.findFirst({ where: and(eq(events.id, eventId), eq(events.churchId, churchId)) });
  if (!event) return c.json({ error: "Event not found" }, 404);
  if (!event.allowRegistrationCancellation) return c.json({ error: "Registration cancellation is disabled for this event." }, 409);
  let cancelledRegistration: typeof eventRegistrations.$inferSelect;
  let promotedMemberId: string | null = null;
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM events WHERE id = ${eventId} AND church_id = ${churchId} FOR UPDATE`);
      const registration = await tx.query.eventRegistrations.findFirst({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.memberId, memberId)) });
      if (!registration || !["CONFIRMED", "WAITLISTED"].includes(registration.status)) throw new Error("An active registration was not found.");
      const [updated] = await tx.update(eventRegistrations).set({ status: "CANCELLED", cancelledAt: new Date(), waitlistPosition: null, updatedAt: new Date() }).where(eq(eventRegistrations.id, registration.id)).returning();
      let promoted: string | null = null;
      if (registration.status === "CONFIRMED" && event.status === "PUBLISHED") {
        const waiting = await tx.query.eventRegistrations.findMany({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "WAITLISTED")), orderBy: [asc(eventRegistrations.waitlistPosition), asc(eventRegistrations.registeredAt)] });
        for (const candidate of waiting) {
          if (event.busTransportEnabled && candidate.pickupLocationId) {
            const pickup = await tx.query.eventPickupLocations.findFirst({ where: and(eq(eventPickupLocations.id, candidate.pickupLocationId), eq(eventPickupLocations.eventId, eventId), eq(eventPickupLocations.active, true)) });
            if (!pickup) continue;
            const [pickupCount] = await tx.select({ value: count() }).from(eventRegistrations).where(and(eq(eventRegistrations.pickupLocationId, pickup.id), eq(eventRegistrations.status, "CONFIRMED")));
            if (Number(pickupCount?.value || 0) >= pickup.capacity) continue;
          }
          await tx.update(eventRegistrations).set({ status: "CONFIRMED", waitlistPosition: null, updatedAt: new Date() }).where(eq(eventRegistrations.id, candidate.id));
          promoted = candidate.memberId;
          break;
        }
        const remaining = await tx.query.eventRegistrations.findMany({ where: and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.status, "WAITLISTED")), orderBy: [asc(eventRegistrations.registeredAt)] });
        for (const [index, item] of remaining.entries()) await tx.update(eventRegistrations).set({ waitlistPosition: index + 1 }).where(eq(eventRegistrations.id, item.id));
      }
      return { registration: updated, promoted };
    });
    cancelledRegistration = outcome.registration;
    promotedMemberId = outcome.promoted;
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Registration could not be cancelled." }, 409);
  }
  await notificationService.sendToMember({ memberId, title: "Registration cancelled", body: `Your registration for ${event.title} has been cancelled.`, type: "REGISTRATION_CANCELLED", destinationUrl: `/events/${event.id}` });
  if (promotedMemberId) await notificationService.sendToMember({ memberId: promotedMemberId, title: "You are off the waitlist", body: `A place is available for ${event.title}. Your registration is confirmed.`, type: "REGISTRATION_CONFIRMATION", destinationUrl: `/events/${event.id}` });
  return c.json({ registration: cancelledRegistration, promotedMemberId });
});

app.get("/registrations", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
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
    .where(and(eq(eventRegistrations.memberId, c.get("user").sub), eq(events.churchId, churchId)))
    .orderBy(desc(events.startsAt));
  return c.json({ registrations });
});

app.get("/:id", async (c) => {
  const churchId = churchIdForUser(c.get("user"));
  const event = await db.query.events.findFirst({ where: and(eq(events.id, c.req.param("id")), eq(events.churchId, churchId), eq(events.status, "PUBLISHED")) });
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