const TIME_ZONE = 'Africa/Lagos'

export const SERVICE_TYPES = {
  SUNDAY: 'sunday-service',
  MIDWEEK: 'midweek-service',
}

export function parseServiceTime(value = '') {
  const match = String(value).replace(/^Sunday Services?:\s*/i, '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i)
  if (!match) return { hours: 8, minutes: 45 }
  let hours = Number(match[1])
  if (match[3].toUpperCase() === 'PM' && hours < 12) hours += 12
  if (match[3].toUpperCase() === 'AM' && hours === 12) hours = 0
  return { hours, minutes: Number(match[2] || 0) }
}

function getLagosParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]))
}

function lagosDateToInstant(year, month, day, hours, minutes) {
  // Lagos is UTC+01:00. Building the wall-clock date as UTC then subtracting
  // the offset preserves the requested Africa/Lagos occurrence instant.
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0) - 60 * 60 * 1000)
}

export function getNextServiceOccurrence(serviceType, now = new Date(), sundayTime = 'Sunday Services: 08:45AM') {
  const nowParts = getLagosParts(now)
  const candidateDay = serviceType === SERVICE_TYPES.MIDWEEK ? 3 : 0
  const serviceTime = serviceType === SERVICE_TYPES.MIDWEEK ? { hours: 18, minutes: 0 } : parseServiceTime(sundayTime)
  const currentInstant = new Date(now)
  const currentDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day))
  const currentDay = currentDate.getUTCDay()
  let daysUntil = (candidateDay - currentDay + 7) % 7
  let occurrence = lagosDateToInstant(nowParts.year, nowParts.month, nowParts.day + daysUntil, serviceTime.hours, serviceTime.minutes)
  if (occurrence.getTime() <= currentInstant.getTime()) {
    occurrence = lagosDateToInstant(nowParts.year, nowParts.month, nowParts.day + daysUntil + 7, serviceTime.hours, serviceTime.minutes)
  }
  return occurrence
}

export function formatServiceOccurrence(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date)
}

export function formatServiceTime(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatServiceOccurrenceLabel(serviceDate, now = new Date()) {
  const nowParts = getLagosParts(now)
  const serviceParts = getLagosParts(serviceDate)
  const nowDay = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)
  const serviceDay = Date.UTC(serviceParts.year, serviceParts.month - 1, serviceParts.day)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long' }).format(serviceDate)
  return serviceDay === nowDay ? `This ${weekday}` : `Next ${weekday}`
}

export { TIME_ZONE }
