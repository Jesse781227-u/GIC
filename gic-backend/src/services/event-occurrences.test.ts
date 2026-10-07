import test from "node:test";
import assert from "node:assert/strict";
import { buildServiceReminderRows, generateServiceOccurrences, parseServiceReminderOffsets } from "./event-occurrences.js";

const now = new Date("2026-10-04T10:00:00.000Z");

function serviceEvent(title: string, startsAt: string, serviceType: string, weekday: number) {
  return {
    id: "event-123",
    title,
    eventType: "Service",
    startsAt,
    recurrenceRule: { frequency: "weekly", interval: 1, serviceType, byWeekday: [weekday], reminderOffsetsMinutes: [1440, 60, 30] },
  };
}

test("generates Sunday and Wednesday occurrences in Africa/Lagos", () => {
  const sunday = generateServiceOccurrences(serviceEvent("Sunday Service", "2026-10-04T08:00:00.000Z", "sunday-service", 0), now, 14);
  const midweek = generateServiceOccurrences(serviceEvent("Midweek Service", "2026-10-07T17:00:00.000Z", "midweek-service", 3), now, 14);
  assert.deepEqual(sunday.map(({ startsAt }) => startsAt.toISOString()), ["2026-10-11T08:00:00.000Z", "2026-10-18T08:00:00.000Z"]);
  assert.deepEqual(midweek.map(({ startsAt }) => startsAt.toISOString()), ["2026-10-07T17:00:00.000Z", "2026-10-14T17:00:00.000Z"]);
  assert.match(midweek[0].occurrenceKey, /2026-10-07$/);
});

test("uses configured reminder offsets, excludes past occurrences and past reminder times", () => {
  const event = serviceEvent("Midweek Service", "2026-10-07T17:00:00.000Z", "midweek-service", 3);
  const occurrence = generateServiceOccurrences(event, now, 7)[0];
  const reminders = buildServiceReminderRows(occurrence, ["member-a", "member-b"], now);
  assert.deepEqual(reminders.map(({ offsetMinutes }) => offsetMinutes), ["1440", "1440", "60", "60", "30", "30"]);
  assert.ok(reminders.every(({ scheduledFor }) => scheduledFor > now));
  assert.ok(reminders.every(({ occurrenceKey }) => occurrenceKey === occurrence.occurrenceKey));
  const noPast = generateServiceOccurrences(serviceEvent("Sunday Service", "2026-10-04T07:00:00.000Z", "sunday-service", 0), now, 1);
  assert.equal(noPast.length, 0);
});

test("defaults service reminder offsets centrally and rejects non-service recurrence", () => {
  const event = { id: "sunday-id", title: "Sunday Service", eventType: "Service", startsAt: "2026-10-04T08:00:00.000Z", recurrenceRule: { frequency: "weekly" } };
  const next = generateServiceOccurrences(event, now, 7)[0];
  assert.deepEqual(next.reminderOffsetsMinutes, [1440, 60, 30]);
  assert.equal(generateServiceOccurrences({ ...event, eventType: "Conference" }, now).length, 0);
  assert.equal(generateServiceOccurrences({ ...event, recurrenceRule: null }, now).length, 0);
  assert.deepEqual(parseServiceReminderOffsets("1440, 120, 30, 120, -1, 99999"), [1440, 120, 30]);
});

test("repeated scheduler runs produce the same occurrence reminder identities", () => {
  const occurrence = generateServiceOccurrences(serviceEvent("Midweek Service", "2026-10-07T17:00:00.000Z", "midweek-service", 3), now, 7)[0];
  const firstRun = buildServiceReminderRows(occurrence, ["member-a", "member-b"], now);
  const secondRun = buildServiceReminderRows(occurrence, ["member-a", "member-b"], now);
  const identity = ({ memberId, occurrenceKey, offsetMinutes }: typeof firstRun[number]) => `${memberId}|${occurrenceKey}|${offsetMinutes}`;
  assert.deepEqual(secondRun.map(identity), firstRun.map(identity));
  assert.equal(new Set(firstRun.map(identity)).size, firstRun.length);
});

test("changing the configured service time recalculates future reminder timestamps", () => {
  const original = serviceEvent("Sunday Service", "2026-10-11T07:00:00.000Z", "sunday-service", 0);
  const revised = { ...original, startsAt: "2026-10-11T08:00:00.000Z" };
  const originalOccurrence = generateServiceOccurrences(original, now, 7)[0];
  const revisedOccurrence = generateServiceOccurrences(revised, now, 7)[0];
  assert.equal(revisedOccurrence.occurrenceKey, originalOccurrence.occurrenceKey);
  assert.equal(revisedOccurrence.startsAt.getTime() - originalOccurrence.startsAt.getTime(), 60 * 60 * 1000);
  const before = buildServiceReminderRows(originalOccurrence, ["member-a"], now).find((row) => row.offsetMinutes === "60");
  const after = buildServiceReminderRows(revisedOccurrence, ["member-a"], now).find((row) => row.offsetMinutes === "60");
  assert.equal(after!.scheduledFor.getTime() - before!.scheduledFor.getTime(), 60 * 60 * 1000);
});