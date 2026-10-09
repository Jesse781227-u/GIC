import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_EVENTS_KEY, createCalendarFile, getEventStartTimestamp, getMemberEventStorageKey, isCalendarEventSaved, readCalendarEvents, saveCalendarEvent } from './myEvents.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('calendar-added events persist once per event and can be read by My Events', () => {
  const storage = createStorage()
  const event = { id: 'event-1', title: 'Community Day', startsAt: '2026-11-01T10:00:00.000Z', location: 'Lagos' }
  saveCalendarEvent(event, storage)
  saveCalendarEvent({ ...event, title: 'Community Day Updated' }, storage)
  assert.equal(isCalendarEventSaved(event.id, storage), true)
  assert.equal(readCalendarEvents(storage).length, 1)
  assert.equal(readCalendarEvents(storage)[0].title, 'Community Day Updated')
  assert.equal(storage.getItem(CALENDAR_EVENTS_KEY) !== null, true)
})

test('calendar invites use the actual event times and escape text fields', () => {
  const content = createCalendarFile({
    id: 'event-2',
    title: 'Worship, Word; & Welcome',
    startsAt: '2026-11-01T10:00:00.000Z',
    endsAt: '2026-11-01T12:30:00.000Z',
    location: 'Main Hall, Lagos',
    description: 'Bring a friend\nJoin us.',
  })
  assert.match(content, /DTSTART:20261101T100000Z/)
  assert.match(content, /DTEND:20261101T123000Z/)
  assert.match(content, /SUMMARY:Worship\\, Word\\; & Welcome/)
  assert.match(content, /DESCRIPTION:Bring a friend\\nJoin us\./)
})

test('countdown reads ISO timestamps from registrations and calendar-saved events', () => {
  const startsAt = '2026-10-24T09:00:00.000Z'
  const expected = Date.parse(startsAt)

  assert.equal(getEventStartTimestamp({ startAt: startsAt }), expected)
  assert.equal(getEventStartTimestamp({ startsAt, date: '24/10/2026', time: '10:00 AM' }), expected)
  assert.equal(getEventStartTimestamp({ date: 'Oct 24, 2026', time: '10:00 AM' }), Date.parse('Oct 24, 2026 10:00 AM'))
  assert.equal(getEventStartTimestamp({ date: 'not a date', time: '' }), null)
})

test('calendar additions and local registration keys are isolated by member account', () => {
  const storage = createStorage()
  storage.setItem('gic_account_id', 'member-a')
  const event = { id: 'event-1', title: 'Community Day', startsAt: '2026-11-01T10:00:00.000Z' }
  saveCalendarEvent(event, storage)
  storage.setItem(getMemberEventStorageKey('gic_registration', event.id, storage), JSON.stringify({ eventId: event.id }))

  assert.equal(readCalendarEvents(storage).length, 1)
  assert.equal(readCalendarEvents(storage, 'member-b').length, 0)
  assert.ok(storage.getItem(getMemberEventStorageKey('gic_registration', event.id, storage)))
  assert.equal(storage.getItem(getMemberEventStorageKey('gic_registration', event.id, storage, 'member-b')), null)
  assert.equal(storage.getItem(CALENDAR_EVENTS_KEY), null)
})