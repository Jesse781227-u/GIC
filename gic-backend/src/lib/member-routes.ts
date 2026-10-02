const allowedMemberRoutes = [
  /^\/home$/,
  /^\/announcements$/,
  /^\/announcements\/birthday$/,
  /^\/announcements\/[A-Za-z0-9_-]+$/,
  /^\/events$/,
  /^\/events\/[A-Za-z0-9_-]+$/,
  /^\/events\/[A-Za-z0-9_-]+\/(?:register|registration|success)$/,
  /^\/my-registrations$/,
  /^\/registrations$/,
  /^\/messages$/,
  /^\/forms$/,
  /^\/forms\/prayer-request$/,
  /^\/ministries$/,
  /^\/ministries\/browse$/,
  /^\/ministries\/[A-Za-z0-9_-]+$/,
  /^\/ministries\/[A-Za-z0-9_-]+\/apply$/,
  /^\/profile$/,
  /^\/profile\/edit$/,
];

export function isAllowedMemberRoute(route?: string | null): route is string {
  if (!route || route.length > 500 || !route.startsWith("/") || route.startsWith("//")) return false;
  if (/[\\?#\u0000-\u001f]/.test(route) || /%(?:2e|2f|5c)/i.test(route)) return false;
  if (route.split("/").some((segment) => segment === "." || segment === "..")) return false;
  return allowedMemberRoutes.some((pattern) => pattern.test(route));
}