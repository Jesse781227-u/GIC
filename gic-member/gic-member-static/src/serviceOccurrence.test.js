import test from 'node:test'
import assert from 'node:assert/strict'
import { formatServiceOccurrenceLabel, getNextServiceOccurrence, SERVICE_TYPES } from './serviceOccurrence.js'

test('midweek occurrence and label are consistent across every day', () => {
  const cases = [
    ['2026-09-06T12:00:00Z', 'Next Wednesday'],
    ['2026-09-07T12:00:00Z', 'Next Wednesday'],
    ['2026-09-08T12:00:00Z', 'Next Wednesday'],
    ['2026-09-09T16:59:00Z', 'This Wednesday'],
    ['2026-09-09T18:01:00Z', 'Next Wednesday'],
    ['2026-09-10T12:00:00Z', 'Next Wednesday'],
    ['2026-09-11T12:00:00Z', 'Next Wednesday'],
    ['2026-09-12T12:00:00Z', 'Next Wednesday'],
  ]
  for (const [value, label] of cases) {
    const now = new Date(value)
    const occurrence = getNextServiceOccurrence(SERVICE_TYPES.MIDWEEK, now)
    assert.equal(formatServiceOccurrenceLabel(occurrence, now), label)
    assert.equal(occurrence.getUTCDay(), 3)
  }
})

test('Sunday occurrence and label are consistent before and after service', () => {
  const before = new Date('2026-09-06T07:44:00Z')
  const after = new Date('2026-09-06T07:46:00Z')
  assert.equal(formatServiceOccurrenceLabel(getNextServiceOccurrence(SERVICE_TYPES.SUNDAY, before, 'Sunday Services: 08:45AM'), before), 'This Sunday')
  assert.equal(formatServiceOccurrenceLabel(getNextServiceOccurrence(SERVICE_TYPES.SUNDAY, after, 'Sunday Services: 08:45AM'), after), 'Next Sunday')
})
