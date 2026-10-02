import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedMemberRoute } from "./member-routes.js";

test("accepts exact application routes and dynamic event paths", () => {
  for (const route of ["/home", "/events", "/events/123", "/events/123/registration", "/profile", "/messages", "/registrations"]) {
    assert.equal(isAllowedMemberRoute(route), true);
  }
});

test("rejects external URLs, unsupported routes, and normalized traversal", () => {
  for (const route of ["https://example.com", "//example.com", "/unknown", "/events/%2e%2e/profile", "/profile?next=https://example.com"]) {
    assert.equal(isAllowedMemberRoute(route), false);
  }
});