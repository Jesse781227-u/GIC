const allowedRoutes = [
  /^\/home$/,
  /^\/announcements$/,
  /^\/announcements\/birthday$/,
  /^\/announcements\/[A-Za-z0-9_-]+$/,
  /^\/events$/,
  /^\/events\/[A-Za-z0-9_-]+$/,
  /^\/events\/[A-Za-z0-9_-]+\/(?:register|success)$/,
  /^\/my-registrations$/,
  /^\/forms$/,
  /^\/forms\/prayer-request$/,
  /^\/ministries$/,
  /^\/ministries\/browse$/,
  /^\/ministries\/[A-Za-z0-9_-]+$/,
  /^\/ministries\/[A-Za-z0-9_-]+\/apply$/,
  /^\/profile$/,
  /^\/profile\/edit$/,
  /^\/notification\/[A-Fa-f0-9-]+$/,
  /^\/messages$/,
  /^\/registrations$/,
  /^\/events\/[A-Za-z0-9_-]+\/registration$/,
  /^\/mixlr\/[A-Za-z0-9_-]+$/,
]

export function isNotificationDestinationRoute(pathname) {
  return pathname === '/notification-open' || /^\/notification\/[A-Fa-f0-9-]+$/.test(pathname)
}

export function validateMemberRoute(route) {
  if (typeof route !== 'string' || route.length > 500 || !route.startsWith('/') || route.startsWith('//')) return null
  if (/[\\?#\u0000-\u001f]/.test(route) || /%(?:2e|2f|5c)/i.test(route)) return null
  if (route.split('/').some((segment) => segment === '.' || segment === '..')) return null
  let parsed
  try {
    parsed = new URL(route, 'https://member.gic.invalid')
  } catch {
    return null
  }
  if (parsed.origin !== 'https://member.gic.invalid' || parsed.search || parsed.hash) return null
  return allowedRoutes.some((pattern) => pattern.test(parsed.pathname)) ? parsed.pathname : null
}
