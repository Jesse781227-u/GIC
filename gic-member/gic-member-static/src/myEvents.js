export const CALENDAR_EVENTS_KEY = 'gic_member_calendar_events'

export function getMemberEventStorageKey(prefix, eventId, storage = globalThis.localStorage, memberId = storage.getItem('gic_account_id')) {
  return memberId ? `${prefix}:${memberId}:${eventId}` : `${prefix}_${eventId}`
}

function calendarEventsKey(storage, memberId) {
  const activeMemberId = memberId || storage.getItem('gic_account_id')
  return activeMemberId ? `${CALENDAR_EVENTS_KEY}:${activeMemberId}` : CALENDAR_EVENTS_KEY
}

export function readCalendarEvents(storage = globalThis.localStorage, memberId) {
  try {
    const records = JSON.parse(storage.getItem(calendarEventsKey(storage, memberId)) || '[]')
    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}

export function isCalendarEventSaved(eventId, storage = globalThis.localStorage, memberId) {
  return readCalendarEvents(storage, memberId).some((event) => event.id === eventId)
}

export function getEventStartTimestamp(event) {
  const timestamp = Date.parse(event?.startAt || event?.startsAt || '')
  if (Number.isFinite(timestamp)) return timestamp

  const date = String(event?.date || '').replace(/^\w+,\s*/, '')
  const fallback = Date.parse(`${date} ${event?.time || ''}`)
  return Number.isFinite(fallback) ? fallback : null
}

export function saveCalendarEvent(event, storage = globalThis.localStorage, memberId) {
  const key = calendarEventsKey(storage, memberId)
  const current = readCalendarEvents(storage, memberId).filter((item) => item.id !== event.id)
  const startsAt = event.startsAt || event.startAt
  const savedEvent = {
    id: event.id,
    title: event.title,
    date: event.date || (startsAt ? new Date(startsAt).toLocaleDateString() : ''),
    time: event.time || (startsAt ? new Date(startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''),
    location: event.location || event.venueName || 'Location to be announced',
    image: event.image || event.imageUrl || '',
    flyerMediaUrl: event.flyerMediaUrl || '',
    flyerMediaType: event.flyerMediaType || '',
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    endsAt: event.endsAt || event.endAt || null,
    status: 'CALENDAR_ADDED',
    addedAt: new Date().toISOString(),
  }
  storage.setItem(key, JSON.stringify([...current, savedEvent]))
  return savedEvent
}

function escapeCalendarText(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function toCalendarDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export function createCalendarFile(event) {
  const startsAt = event.startsAt || event.startAt
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) throw new Error('Event start time is unavailable.')
  const start = new Date(startsAt)
  const end = event.endsAt || event.endAt
    ? new Date(event.endsAt || event.endAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Global Impact Church//Events//EN',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(event.id)}@gic.org`,
    `DTSTAMP:${toCalendarDate(new Date())}`,
    `DTSTART:${toCalendarDate(start)}`,
    `DTEND:${toCalendarDate(end)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText(event.location || event.venueName || '')}`,
    `DESCRIPTION:${escapeCalendarText(event.description || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}