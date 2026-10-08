import { QueryClient } from '@tanstack/react-query'

export const adminQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false },
  },
})

const STATIC_STALE_TIME = 15 * 60 * 1000
const STANDARD_STALE_TIME = 2 * 60 * 1000
const FAST_STALE_TIME = 20 * 1000

export function adminResourceForPath(path) {
  const pathname = path.split('?')[0]
  if (/\/members(?:\/|$)/.test(pathname)) return 'members'
  if (/\/events(?:\/|$)/.test(pathname)) return 'events'
  if (/\/notifications(?:\/|$)/.test(pathname)) return 'notifications'
  if (/\/ministry-applications(?:\/|$)/.test(pathname)) return 'applications'
  if (/\/(?:groups|organizations|reference)(?:\/|$)/.test(pathname)) return 'organizations'
  if (/\/attendance(?:\/|$)/.test(pathname)) return 'attendance'
  if (/\/activity(?:\/|$)/.test(pathname)) return 'activity'
  if (/\/dashboard(?:\/|$)/.test(pathname)) return 'dashboard'
  return 'api'
}

export function adminStaleTime(path) {
  const pathname = path.split('?')[0]
  if (/\/dashboard$/.test(pathname)) return FAST_STALE_TIME
  if (/\/attendance\/(?:service|mixlr)/.test(pathname)) return FAST_STALE_TIME
  if (/\/(?:reference|groups|organizations)(?:\/|$)/.test(pathname)) return STATIC_STALE_TIME
  return STANDARD_STALE_TIME
}

export function adminApiQueryKey(scope, path) {
  const url = new URL(path, 'https://cache.invalid')
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
  return ['tenant', scope, adminResourceForPath(url.pathname), url.pathname, params]
}

export function invalidateAdminResource(scope, resource) {
  return adminQueryClient.invalidateQueries({ queryKey: ['tenant', scope, resource] })
}

export function invalidateAdminDashboard(scope) {
  return invalidateAdminResource(scope, 'dashboard')
}

export function cachedAdminQuery(queryKey, queryFn, staleTime, client = adminQueryClient) {
  const state = client.getQueryState(queryKey)
  if (state?.data !== undefined) {
    if (state.isInvalidated || Date.now() - state.dataUpdatedAt >= staleTime) {
      void client.fetchQuery({ queryKey, queryFn, staleTime: 0 }).catch(() => {})
    }
    return Promise.resolve(state.data)
  }
  return client.fetchQuery({ queryKey, queryFn, staleTime })
}