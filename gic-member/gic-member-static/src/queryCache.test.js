import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { cachedMemberQuery, memberApiQueryKey, memberScopeFromToken, memberStaleTime } from './queryCache.js'

function token(payload) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

test('member cache scopes include both tenant and authenticated member', () => {
  assert.equal(memberScopeFromToken(token({ churchId: 'church-a', sub: 'member-a' })), 'church-a:member-a')
  assert.notEqual(memberScopeFromToken(token({ churchId: 'church-a', sub: 'member-a' })), memberScopeFromToken(token({ churchId: 'church-b', sub: 'member-a' })))
})

test('member API query keys canonicalize filters and freshness favors profile reuse', () => {
  assert.deepEqual(memberApiQueryKey('church-a:member-a', '/api/events?page=2&type=service'), memberApiQueryKey('church-a:member-a', '/api/events?type=service&page=2'))
  assert.ok(memberStaleTime('/api/auth/profile') > memberStaleTime('/api/notifications/unread-count'))
})

test('member cache reuses fresh reads and updates stale data without blocking the caller', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0, gcTime: 0 } } })
  const queryKey = memberApiQueryKey('church-a:member-a', '/api/events')
  let requests = 0
  const load = async () => ({ revision: ++requests })

  assert.deepEqual(await cachedMemberQuery(queryKey, load, 60_000, client), { revision: 1 })
  assert.deepEqual(await cachedMemberQuery(queryKey, load, 60_000, client), { revision: 1 })
  assert.equal(requests, 1)

  client.setQueryData(queryKey, { revision: 1 }, { updatedAt: Date.now() - 61_000 })
  assert.deepEqual(await cachedMemberQuery(queryKey, load, 60_000, client), { revision: 1 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(requests, 2)
  assert.deepEqual(client.getQueryData(queryKey), { revision: 2 })
  client.clear()
})