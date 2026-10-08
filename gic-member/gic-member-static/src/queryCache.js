import { QueryClient } from '@tanstack/react-query'

export const memberQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false },
  },
})

const STATIC_STALE_TIME = 15 * 60 * 1000
const STANDARD_STALE_TIME = 2 * 60 * 1000
const FAST_STALE_TIME = 30 * 1000

export function memberScopeFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const tenant = payload.churchId || payload.church_id || 'default'
    return `${tenant}:${payload.sub || payload.user_id || 'authenticated'}`
  } catch {
    let hash = 2166136261
    for (let index = 0; index < token.length; index += 1) hash = Math.imul(hash ^ token.charCodeAt(index), 16777619)
    return `unknown:${(hash >>> 0).toString(36)}`
  }
}

export function memberResourceForPath(path) {
  const pathname = path.split('?')[0]
  if (/\/auth\/profile/.test(pathname)) return 'profile'
  if (/\/events(?:\/|$)/.test(pathname)) return 'events'
  if (/\/mixlr(?:\/|$)/.test(pathname)) return 'mixlr'
  if (/\/notifications(?:\/|$)/.test(pathname)) return 'notifications'
  if (/\/ministry-applications(?:\/|$)/.test(pathname)) return 'applications'
  if (/\/service-reminders(?:\/|$)/.test(pathname)) return 'reminders'
  if (/\/push-devices(?:\/|$)/.test(pathname)) return 'pushDevices'
  if (/\/(?:ministries|groups|cells|fellowships)(?:\/|$)/.test(pathname)) return 'organizations'
  return 'api'
}

export function memberStaleTime(path) {
  const resource = memberResourceForPath(path)
  if (resource === 'profile') return 5 * 60 * 1000
  if (resource === 'events') return STANDARD_STALE_TIME
  if (resource === 'notifications') return FAST_STALE_TIME
  if (resource === 'organizations') return STATIC_STALE_TIME
  return STANDARD_STALE_TIME
}

export function memberApiQueryKey(scope, path) {
  const url = new URL(path, 'https://cache.invalid')
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
  return ['tenant', scope, memberResourceForPath(url.pathname), url.pathname, params]
}

export function invalidateMemberResource(scope, resource) {
  return memberQueryClient.invalidateQueries({ queryKey: ['tenant', scope, resource] })
}

export function cachedMemberQuery(queryKey, queryFn, staleTime, client = memberQueryClient) {
  const state = client.getQueryState(queryKey)
  if (state?.data !== undefined) {
    if (state.isInvalidated || Date.now() - state.dataUpdatedAt >= staleTime) {
      void client.fetchQuery({ queryKey, queryFn, staleTime: 0 }).catch(() => {})
    }
    return Promise.resolve(state.data)
  }
  return client.fetchQuery({ queryKey, queryFn, staleTime })
}

export function updateMemberProfileCache(scope, profile, client = memberQueryClient) {
  if (!profile?.id) return
  client.setQueryData(memberApiQueryKey(scope, '/api/auth/profile'), { profile })
}