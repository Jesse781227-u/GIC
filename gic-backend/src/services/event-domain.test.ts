import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionEvent, eventRegistrationAvailability, validateEventForm } from "./event-domain.js";

test("registration availability distinguishes lifecycle and registration windows", () => {
  const base = { status: "PUBLISHED", registrationRequired: true, registrationOpensAt: null, registrationClosesAt: null };
  assert.deepEqual(eventRegistrationAvailability(base).reason, "open");
  assert.equal(eventRegistrationAvailability({ ...base, status: "DRAFT" }).reason, "not_published");
  assert.equal(eventRegistrationAvailability({ ...base, status: "CANCELLED" }).reason, "cancelled");
  assert.equal(eventRegistrationAvailability({ ...base, registrationRequired: false }).reason, "not_required");
  assert.equal(eventRegistrationAvailability({ ...base, registrationOpensAt: new Date(Date.now() + 60_000) }).reason, "not_open");
  assert.equal(eventRegistrationAvailability({ ...base, registrationClosesAt: new Date(Date.now() - 60_000) }).reason, "closed");
});

test("event lifecycle only allows explicit supported transitions", () => {
  assert.equal(canTransitionEvent("DRAFT", "PUBLISHED"), true);
  assert.equal(canTransitionEvent("PUBLISHED", "UNPUBLISHED"), true);
  assert.equal(canTransitionEvent("PUBLISHED", "CANCELLED"), true);
  assert.equal(canTransitionEvent("CANCELLED", "PUBLISHED"), false);
  assert.equal(canTransitionEvent("COMPLETED", "CANCELLED"), false);
});

test("event form validation checks required, typed and unknown answers", () => {
  const fields = [
    { id: "email", label: "Email", type: "email" as const, required: true },
    { id: "consent", label: "Consent", type: "checkbox" as const, required: true },
  ];
  assert.deepEqual(validateEventForm(fields, { email: "member@example.com", consent: true }), []);
  assert.equal(validateEventForm(fields, { email: "bad", consent: false }).length, 2);
  assert.equal(validateEventForm(fields, { email: "member@example.com", consent: true, injected: "x" }).length, 1);
});