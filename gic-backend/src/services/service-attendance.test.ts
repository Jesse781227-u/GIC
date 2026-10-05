import test from "node:test";
import assert from "node:assert/strict";
import { buildAttendanceSummary, normalizeAttendanceResponse } from "./service-attendance.js";

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
