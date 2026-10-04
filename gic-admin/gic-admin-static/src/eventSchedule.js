export function getGicServiceRecurrence(eventType, title) {
  if (eventType !== 'Service') return null
  if (/\bmidweek service\b/i.test(title)) return { frequency: 'weekly', interval: 1, serviceType: 'midweek-service', byWeekday: [3] }
  if (/\bsunday service\b/i.test(title)) return { frequency: 'weekly', interval: 1, serviceType: 'sunday-service', byWeekday: [0] }
  return null
}