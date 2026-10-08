import test from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { adminApiQueryKey, adminStaleTime, cachedAdminQuery } from './queryCache.js'

test('admin cache keys canonicalize filters and isolate tenant scopes', () => {
  assert.deepEqual(adminApiQueryKey('tenant-a', '/api/admin/members?page=2&search=anna'), adminApiQueryKey('tenant-a', '/api/admin/members?search=anna&page=2'))
  assert.notDeepEqual(adminApiQueryKey('tenant-a', '/api/admin/members'), adminApiQueryKey('tenant-b', '/api/admin/members'))
})

test('admin cache freshness is shorter for dashboard than reference data', () => {
  assert.ok(adminStaleTime('/api/admin/dashboard') < adminStaleTime('/api/admin/reference/age-groups'))
})

test('admin cache serves fresh hits without requests and revalidates stale data in background', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0, gcTime: 0 } } })
  const queryKey = ['tenant', 'tenant-a', 'dashboard']
  let requests = 0
  const load = async () => ({ revision: ++requests })

  assert.deepEqual(await cachedAdminQuery(queryKey, load, 60_000, client), { revision: 1 })
  assert.deepEqual(await cachedAdminQuery(queryKey, load, 60_000, client), { revision: 1 })
  assert.equal(requests, 1)

  client.setQueryData(queryKey, { revision: 1 }, { updatedAt: Date.now() - 61_000 })
  assert.deepEqual(await cachedAdminQuery(queryKey, load, 60_000, client), { revision: 1 })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(requests, 2)
  assert.deepEqual(client.getQueryData(queryKey), { revision: 2 })
  client.clear()
})