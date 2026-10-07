export function mapPickupPoints(points, pickupTime = '06:30') {
  return points.map((point) => ({
    busPickupPointId: point.id,
    name: point.name,
    address: point.address,
    pickupTime,
    capacity: '40',
    notes: '',
    active: false,
  }))
}

export function setPickupActive(pickups, pickupPointId, active) {
  return pickups.map((pickup) => pickup.busPickupPointId === pickupPointId ? { ...pickup, active } : pickup)
}

export function activateAllPickupPoints(points, pickups, pickupTime = '06:30') {
  const existingByPoint = new Map(pickups.map((pickup) => [pickup.busPickupPointId, pickup]))
  return points.map((point) => ({
    ...(existingByPoint.get(point.id) || mapPickupPoints([point], pickupTime)[0]),
    active: true,
  }))
}

export function clearPickupPoints(pickups) {
  return pickups.map((pickup) => ({ ...pickup, active: false }))
}

export function applyPickupTimeToActive(pickups, pickupTime) {
  return pickups.map((pickup) => pickup.active ? { ...pickup, pickupTime } : pickup)
}

export function activePickupPoints(pickups) {
  return pickups.filter((pickup) => pickup.active && pickup.name.trim() && pickup.address.trim())
}