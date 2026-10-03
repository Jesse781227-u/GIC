import test from "node:test";
import assert from "node:assert/strict";
import { matchesGroupRules } from "../member-group-rules.js";

const makeMember = (gender: string) => ({
  joinedYear: 2020,
  joinedMonth: 1,
  birthday: "1995-04-12",
  gender,
  center: "Central",
  membershipStatus: "Active",
});

test("cell gender eligibility rejects direct cross-gender join attempts", () => {
  const mensRules = { conditions: [{ field: "gender", operator: "equals", value: "male" }] };
  const womensRules = { conditions: [{ field: "gender", operator: "equals", value: "female" }] };
  assert.equal(matchesGroupRules(makeMember("female") as never, mensRules), false);
  assert.equal(matchesGroupRules(makeMember("male") as never, womensRules), false);
  assert.equal(matchesGroupRules(makeMember("male") as never, mensRules), true);
  assert.equal(matchesGroupRules(makeMember("female") as never, womensRules), true);
});
