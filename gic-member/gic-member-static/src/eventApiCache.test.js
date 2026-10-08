import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EVENT_API_CACHE_TTL,
  invalidateEventApiCache,
  readEventApiCache,
  shouldCacheEventApiRequest,
  writeEventApiCache,
} from './eventApiCache.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

test('caches event data per member until its expiry', () => {
  const storage = createStorage()
  const data = { events: [{ id: 'event-1' }] }
  writeEventApiCache('/api/events', 'member-token-a', data, storage, 1000)

  assert.deepEqual(readEventApiCache('/api/events', 'member-token-a', storage, 1001), { found: true, data })
  assert.deepEqual(readEventApiCache('/api/events', 'member-token-b', storage, 1001), { found: false })
  assert.deepEqual(readEventApiCache('/api/events', 'member-token-a', storage, 1000 + EVENT_API_CACHE_TTL), { found: false })
})

test('caches member event reads but not unrelated or mutating paths', () => {
  assert.equal(shouldCacheEventApiRequest('/api/events'), true)
  assert.equal(shouldCacheEventApiRequest('/api/events/registrations'), true)
  assert.equal(shouldCacheEventApiRequest('/api/events/interests'), true)
  assert.equal(shouldCacheEventApiRequest('/api/events/event-1'), true)
  assert.equal(shouldCacheEventApiRequest('/api/events/event-1/registrations'), false)
  assert.equal(shouldCacheEventApiRequest('/api/auth/profile'), false)
})

test('invalidates all event data only for the matching member', () => {
  const storage = createStorage()
  writeEventApiCache('/api/events', 'member-token-a', { events: [] }, storage, 1000)
  writeEventApiCache('/api/events/registrations', 'member-token-a', { registrations: [] }, storage, 1000)
  writeEventApiCache('/api/events', 'member-token-b', { events: [] }, storage, 1000)

  invalidateEventApiCache('member-token-a', storage)

  assert.deepEqual(readEventApiCache('/api/events', 'member-token-a', storage, 1001), { found: false })
  assert.deepEqual(readEventApiCache('/api/events', 'member-token-b', storage, 1001), { found: true, data: { events: [] } })
})