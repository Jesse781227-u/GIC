import test from 'node:test'
import assert from 'node:assert/strict'
import { getGicServiceRecurrence } from './eventSchedule.js'

test('maps named Sunday and Midweek services to their recurring Lagos weekdays', () => {
  assert.deepEqual(getGicServiceRecurrence('Service', 'Sunday Service'), {
    frequency: 'weekly', interval: 1, serviceType: 'sunday-service', byWeekday: [0],
  })
  assert.deepEqual(getGicServiceRecurrence('Service', 'GIC Midweek Service'), {
    frequency: 'weekly', interval: 1, serviceType: 'midweek-service', byWeekday: [3],
  })
  assert.equal(getGicServiceRecurrence('Conference', 'Sunday Service'), null)
  assert.equal(getGicServiceRecurrence('Service', 'Prayer Gathering'), null)
})