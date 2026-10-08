import { adminAuth } from './firebase'
import { adminApiQueryKey, adminResourceForPath, adminStaleTime, cachedAdminQuery, invalidateAdminResource } from './queryCache'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'

export async function adminApiScope(user = adminAuth.currentUser) {
  if (!user) return ''
  const { claims = {} } = await user.getIdTokenResult()
  return `${claims.church_id || claims.churchId || 'default'}:${user.uid}`
}

export async function requestAdminApi(path, options = {}) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const multipart = options.body instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => 'Request failed')
    try { throw new Error(JSON.parse(body).error || JSON.parse(body).message || body) } catch (error) { if (error instanceof SyntaxError) throw new Error(body); throw error }
  }
  return response.json()
}

export async function fetchAdminApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const scope = await adminApiScope(user)
  if (method === 'GET') {
    const queryKey = adminApiQueryKey(scope, path)
    return cachedAdminQuery(queryKey, () => requestAdminApi(path), adminStaleTime(path))
  }

  const result = await requestAdminApi(path, options)
  const resource = adminResourceForPath(path)
  await invalidateAdminResource(scope, resource)
  if (['members', 'events', 'notifications', 'applications', 'organizations'].includes(resource)) await invalidateAdminResource(scope, 'dashboard')
  if (resource === 'members') await invalidateAdminResource(scope, 'organizations')
  return result
}