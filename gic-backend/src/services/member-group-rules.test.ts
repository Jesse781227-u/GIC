import test from "node:test";
import assert from "node:assert/strict";
import { matchesGroupRules, matchesProfileCondition } from "./member-group-rules.js";

test("new-member window uses the configured number of months", () => {
  const member = { joinedYear: 2026, joinedMonth: 8, birthday: null, gender: null, center: null, membershipStatus: null };
  const now = new Date("2026-10-02T12:00:00Z");
  assert.equal(matchesProfileCondition(member as never, { field: "joined_within_months", operator: "within", value: 3 }, now), true);
  assert.equal(matchesProfileCondition(member as never, { field: "joined_within_months", operator: "within", value: 1 }, now), false);
});

test("age and gender rules combine with AND or OR semantics", () => {
  const member = { joinedYear: 2020, joinedMonth: 1, birthday: "2000-06-15", gender: "female", center: "Lagos", membershipStatus: "Active" };
  assert.equal(matchesGroupRules(member as never, { logic: "and", conditions: [
    { field: "gender", operator: "equals", value: "female" },
    { field: "age", operator: "between", min: 18, max: 30 },
  ] }, undefined, new Date("2026-10-02T12:00:00Z")), true);
  assert.equal(matchesGroupRules(member as never, { logic: "and", conditions: [
    { field: "gender", operator: "equals", value: "male" },
    { field: "age", operator: "between", min: 18, max: 30 },
  ] }), false);
  assert.equal(matchesGroupRules(member as never, { logic: "or", conditions: [
    { field: "gender", operator: "equals", value: "male" },
    { field: "center", operator: "equals", value: "Lagos" },
  ] }), true);
});

test("relation rules are delegated to tenant-scoped membership checks", () => {
  const member = { joinedYear: 2020, joinedMonth: 1, birthday: "2000-01-01", gender: "male", center: "Lagos", membershipStatus: "Active" };
  assert.equal(matchesGroupRules(member as never, { conditions: [{ field: "cell_id", operator: "equals", value: "cell-a" }] }, (condition) => condition.value === "cell-a"), true);
});
