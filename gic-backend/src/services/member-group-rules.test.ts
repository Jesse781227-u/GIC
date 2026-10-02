import test from "node:test";
import assert from "node:assert/strict";
import { describeGroupRules, matchesGroupRules, matchesProfileCondition } from "./member-group-rules.js";

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

test("age-group and relationship rules use explicit profile selections", () => {
  const member = { ageGroupId: "young-adults", relationshipStatus: "Single" };
  assert.equal(matchesProfileCondition(member as never, { field: "age_group_id", operator: "equals", value: "young-adults" }), true);
  assert.equal(matchesProfileCondition(member as never, { field: "age_group_id", operator: "equals", value: "adults" }), false);
  assert.equal(matchesProfileCondition(member as never, { field: "relationship_status", operator: "equals", value: "Single" }), true);
  assert.equal(matchesProfileCondition(member as never, { field: "relationship_status", operator: "equals", value: "Married" }), false);
});

test("automatic rules combine age group and relationship status", () => {
  const member = { ageGroupId: "adults", relationshipStatus: "Married" };
  assert.equal(matchesGroupRules(member as never, { logic: "and", conditions: [
    { field: "age_group_id", operator: "equals", value: "adults" },
    { field: "relationship_status", operator: "equals", value: "Married" },
  ] }), true);
  assert.equal(matchesGroupRules(member as never, { logic: "and", conditions: [
    { field: "age_group_id", operator: "equals", value: "adults" },
    { field: "relationship_status", operator: "equals", value: "Single" },
  ] }), false);
});

test("automatic segment rules are summarized in user-friendly text", () => {
  const description = describeGroupRules({ logic: "and", conditions: [
    { field: "gender", operator: "equals", value: "female" },
    { field: "joined_within_months", operator: "within", value: 5 },
  ] });
  assert.match(description, /female/i);
  assert.match(description, /5 months|within the last 5 months/i);
});
