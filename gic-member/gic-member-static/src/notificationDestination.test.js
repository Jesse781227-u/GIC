import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNotificationDestinationRoute, validateMemberRoute } from './notificationDestination.js'

test('recognizes notification tap and media paths for cold-start routing', () => {
  assert.equal(isNotificationDestinationRoute('/notification-open'), true)
  assert.equal(isNotificationDestinationRoute('/notification/123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(isNotificationDestinationRoute('/home'), false)
  assert.equal(isNotificationDestinationRoute('/notification/not-a-uuid'), false)
})

test('allows supported exact and parameterized member routes', () => {
  for (const route of ['/home', '/profile', '/messages', '/registrations', '/events', '/events/123', '/events/123/register', '/events/123/registration', '/events/event_123/success', '/mixlr/recording-123']) {
    assert.equal(validateMemberRoute(route), route)
  }
})

test('rejects external, unsupported, and traversal destinations', () => {
  for (const route of ['https://example.com', '//example.com/path', '/unknown', '/events/%2f..%2fprofile', '/events/%2e%2e/profile', '/profile?next=https://example.com']) {
    assert.equal(validateMemberRoute(route), null)
  }
})

test('active service worker displays one background notification and honors stable tags', () => {
  const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.equal((worker.match(/onBackgroundMessage\(/g) || []).length, 1)
  assert.match(worker, /payload\?\.data\?\.tag \|\| notificationId/)
  assert.match(worker, /renotify: false/)
})