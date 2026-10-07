import test from "node:test";
import assert from "node:assert/strict";
import { buildAttendanceSummary, formatServiceOccurrenceLabel, groupServiceAttendanceRows, groupRegistrationRows, normalizeAttendanceResponse } from "./service-attendance.js";

test("buildAttendanceSummary counts actual responses and response rate", () => {
  const summary = buildAttendanceSummary([
    { response: "in_person" },
    { response: "online" },
    { response: "online" },
    { response: "not_attending" },
    { response: "not_attending" },
    { response: "not_attending" },
  ], 12);

  assert.equal(summary.totalEligible, 12);
  assert.equal(summary.responded, 6);
  assert.equal(summary.inPerson, 1);
  assert.equal(summary.online, 2);
  assert.equal(summary.notAttending, 3);
  assert.equal(summary.noResponse, 6);
  assert.equal(summary.responseRate, 50);
});

test("attendance responses are normalized to the supported values", () => {
  assert.equal(normalizeAttendanceResponse("great_at_church"), "in_person");
  assert.equal(normalizeAttendanceResponse("online"), "online");
  assert.equal(normalizeAttendanceResponse("not_attending"), "not_attending");
  assert.equal(normalizeAttendanceResponse("unknown"), "not_attending");
});

test("service labels use the exact occurrence date and Lagos service time", () => {
  assert.equal(
    formatServiceOccurrenceLabel("Sunday Service", "event-1:sunday-service:2026-10-04", "2026-10-04T07:30:00.000Z"),
    "4 October 2026 · Sunday Service · 8:30 AM",
  );
});

test("service attendance and registrations are grouped by exact occurrence and event", () => {
  const serviceRows = [
    { occurrenceId: "svc-1", eventTitle: "Sunday Service", serviceStartsAt: "2026-10-04T08:30:00.000Z", response: "in_person" },
    { occurrenceId: "svc-1", eventTitle: "Sunday Service", serviceStartsAt: "2026-10-04T08:30:00.000Z", response: "online" },
    { occurrenceId: "svc-1", eventTitle: "Sunday Service", serviceStartsAt: "2026-10-04T08:30:00.000Z", response: "not_attaching" },
    { occurrenceId: "svc-2", eventTitle: "Sunday Service", serviceStartsAt: "2026-10-11T08:30:00.000Z", response: "in_person" },
  ];

  const registrationRows = [
    { eventId: "evt-1", eventTitle: "Youth Summit", status: "CONFIRMED" },
    { eventId: "evt-1", eventTitle: "Youth Summit", status: "CONFIRMED" },
    { eventId: "evt-1", eventTitle: "Youth Summit", status: "WAITLISTED" },
    { eventId: "evt-2", eventTitle: "Women Connect", status: "PENDING" },
  ];

  const groupedServices = groupServiceAttendanceRows(serviceRows);
  const groupedRegistrations = groupRegistrationRows(registrationRows);

  assert.deepEqual(groupedServices.map((row) => ({ occurrenceId: row.occurrenceId, total: row.total, inPerson: row.inPerson, online: row.online, notAttending: row.notAttending })), [
    { occurrenceId: "svc-1", total: 3, inPerson: 1, online: 1, notAttending: 1 },
    { occurrenceId: "svc-2", total: 1, inPerson: 1, online: 0, notAttending: 0 },
  ]);

  assert.deepEqual(groupedRegistrations.map((row) => ({ eventId: row.eventId, eventTitle: row.eventTitle, total: row.total, confirmed: row.confirmed, waitlisted: row.waitlisted, pending: row.pending })), [
    { eventId: "evt-2", eventTitle: "Women Connect", total: 1, confirmed: 0, waitlisted: 0, pending: 1 },
    { eventId: "evt-1", eventTitle: "Youth Summit", total: 3, confirmed: 2, waitlisted: 1, pending: 0 },
  ]);
});
