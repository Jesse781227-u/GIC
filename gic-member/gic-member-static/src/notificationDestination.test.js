import test from 'node:test'
import assert from 'node:assert/strict'
import { validateMemberRoute } from './notificationDestination.js'

test('allows supported exact and parameterized member routes', () => {
  for (const route of ['/home', '/profile', '/messages', '/registrations', '/events', '/events/123', '/events/123/register', '/events/123/registration', '/events/event_123/success']) {
    assert.equal(validateMemberRoute(route), route)
  }
})

test('rejects external, unsupported, and traversal destinations', () => {
  for (const route of ['https://example.com', '//example.com/path', '/unknown', '/events/%2f..%2fprofile', '/events/%2e%2e/profile', '/profile?next=https://example.com']) {
    assert.equal(validateMemberRoute(route), null)
  }
})