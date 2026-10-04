import test from 'node:test'
import assert from 'node:assert/strict'
import { activateAllPickupPoints, activePickupPoints, applyPickupTimeToActive, clearPickupPoints, mapPickupPoints, setPickupActive } from './pickupSelection.js'

const points = [
  { id: 'ikeja', name: 'Ikeja', address: 'Ikeja address' },
  { id: 'yaba', name: 'Yaba', address: 'Yaba address' },
]

test('activation controls reuse reference IDs, activate all, and clear without removing individual rows', () => {
  const initial = mapPickupPoints(points)
  assert.deepEqual(initial.map((pickup) => pickup.busPickupPointId), ['ikeja', 'yaba'])
  assert.deepEqual(initial.map((pickup) => pickup.active), [false, false])
  const oneEnabled = setPickupActive(initial, 'ikeja', true)
  assert.equal(activePickupPoints(oneEnabled).length, 1)
  assert.deepEqual(activateAllPickupPoints(points, oneEnabled).map((pickup) => pickup.active), [true, true])
  assert.deepEqual(clearPickupPoints(initial).map((pickup) => pickup.active), [false, false])
})

test('bulk time updates active points only and leaves individual overrides possible', () => {
  const initial = activateAllPickupPoints(points, mapPickupPoints(points))
  const withOverride = initial.map((pickup) => pickup.busPickupPointId === 'ikeja' ? { ...pickup, pickupTime: '07:00' } : pickup)
  const applied = applyPickupTimeToActive(withOverride, '06:30')
  assert.deepEqual(applied.map((pickup) => pickup.pickupTime), ['06:30', '06:30'])
  const individuallyEdited = applied.map((pickup) => pickup.busPickupPointId === 'yaba' ? { ...pickup, pickupTime: '07:15' } : pickup)
  assert.deepEqual(individuallyEdited.map((pickup) => pickup.pickupTime), ['06:30', '07:15'])
  assert.deepEqual(applyPickupTimeToActive(clearPickupPoints(individuallyEdited), '08:00').map((pickup) => pickup.pickupTime), ['06:30', '07:15'])
})