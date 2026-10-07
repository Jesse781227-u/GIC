const CACHE_PREFIX = 'gic_member_event_api_cache_v1:'
export const EVENT_API_CACHE_TTL = 2 * 60 * 1000

function tokenFingerprint(token) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(index), 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cacheKey(path, token) {
  return `${CACHE_PREFIX}${tokenFingerprint(token)}:${path}`
}

export function shouldCacheEventApiRequest(path) {
  const pathname = path.split('?')[0]
  return pathname === '/api/events'
    || pathname === '/api/events/registrations'
    || pathname === '/api/events/interests'
    || /^\/api\/events\/[^/]+$/.test(pathname)
}

export function readEventApiCache(path, token, storage, now = Date.now()) {
  const key = cacheKey(path, token)
  try {
    const cached = JSON.parse(storage.getItem(key) || 'null')
    if (!cached || cached.expiresAt <= now) {
      if (cached) storage.removeItem(key)
      return { found: false }
    }
    return { found: true, data: cached.data }
  } catch {
    return { found: false }
  }
}

export function writeEventApiCache(path, token, data, storage, now = Date.now()) {
  try {
    storage.setItem(cacheKey(path, token), JSON.stringify({ data, expiresAt: now + EVENT_API_CACHE_TTL }))
  } catch {
    // Caching is optional when browser storage is unavailable or full.
  }
}

export function invalidateEventApiCache(token, storage) {
  const prefix = `${CACHE_PREFIX}${tokenFingerprint(token)}:`
  try {
    const keys = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // Stale entries expire automatically if storage cannot be enumerated.
  }
}