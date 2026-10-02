import assert from "node:assert/strict";
import test from "node:test";
import { birthdayOccursOn, DEFAULT_AGE_GROUPS, normalizeBirthday } from "../lib/age-groups.js";

test("default age-group options use configurable ranges and include an open-ended senior range", () => {
  assert.deepEqual(DEFAULT_AGE_GROUPS.map(({ name, minAge, maxAge }) => [name, minAge, maxAge]), [
    ["Children", 0, 12],
    ["Teenagers", 13, 17],
    ["Young Adults", 18, 30],
    ["Adults", 31, 59],
    ["Seniors", 60, null],
  ]);
});

test("birthday normalization removes birth year and validates month and day", () => {
  assert.equal(normalizeBirthday("1995-04-12"), "04-12");
  assert.equal(normalizeBirthday("02-29"), "02-29");
  assert.equal(normalizeBirthday("2020-02-30"), "");
  assert.equal(normalizeBirthday("not-a-date"), "");
});

test("birthday matching works with and without legacy birth years", () => {
  assert.equal(birthdayOccursOn("04-12", { year: 2026, month: 4, day: 12 }), true);
  assert.equal(birthdayOccursOn("1995-04-12", { year: 2026, month: 4, day: 12 }), true);
  assert.equal(birthdayOccursOn("02-29", { year: 2025, month: 2, day: 28 }), true);
  assert.equal(birthdayOccursOn("02-29", { year: 2024, month: 2, day: 28 }), false);
});
