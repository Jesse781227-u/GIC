export const SERVICE_TIME_ZONE = "Africa/Lagos";
export const SERVICE_OCCURRENCE_LOOKAHEAD_DAYS = 56;
export const DEFAULT_SERVICE_REMINDER_OFFSETS = parseServiceReminderOffsets(process.env.GIC_SERVICE_REMINDER_OFFSETS_MINUTES);

export type GicServiceType = "sunday-service" | "midweek-service";

type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function parseServiceReminderOffsets(value: string | undefined): number[] {
  if (!value?.trim()) return [1440, 60, 30];
  const offsets = [...new Set(value.split(",").map((part) => Number(part.trim())).filter((offset) => Number.isInteger(offset) && offset > 0 && offset <= 10080))];
  return offsets.length ? offsets : [1440, 60, 30];
}

export type ServiceOccurrence = {
  eventId: string;
  serviceType: GicServiceType;
  occurrenceKey: string;
  startsAt: Date;
  reminderOffsetsMinutes: number[];
};

function localParts(date: Date): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SERVICE_TIME_ZONE,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function localDateToInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone = SERVICE_TIME_ZONE): Date {
  const expected = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = expected;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = expected - represented;
    instant += correction;
    if (!correction) break;
  }
  return new Date(instant);
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function inferGicServiceType(event: { title: string; eventType: string }): GicServiceType | null {
  if (event.eventType.toLowerCase() !== "service") return null;
  const title = event.title.toLowerCase();
  if (title.includes("midweek") || title.includes("wednesday service")) return "midweek-service";
  if (title.includes("sunday service")) return "sunday-service";
  return null;
}

function reminderOffsets(rule: Record<string, unknown>): number[] {
  const configured = rule.reminderOffsetsMinutes;
  if (!Array.isArray(configured)) return [...DEFAULT_SERVICE_REMINDER_OFFSETS];
  return [...new Set(configured.filter((value): value is number => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 10080))];
}

export function generateServiceOccurrences(
  event: { id: string; title: string; eventType: string; startsAt: Date | string; recurrenceRule: unknown },
  now = new Date(),
  lookaheadDays = SERVICE_OCCURRENCE_LOOKAHEAD_DAYS,
): ServiceOccurrence[] {
  const inferredService = inferGicServiceType(event);
  if (!inferredService) return [];
  const rule = event.recurrenceRule && typeof event.recurrenceRule === "object" && !Array.isArray(event.recurrenceRule)
    ? event.recurrenceRule as Record<string, unknown>
    : {};
  const serviceType = rule.serviceType === "sunday-service" || rule.serviceType === "midweek-service" ? rule.serviceType : inferredService;
  const expectedWeekday = serviceType === "sunday-service" ? 0 : 3;
  if (rule.frequency !== "weekly") return [];
  const interval = Number.isInteger(rule.interval) && Number(rule.interval) > 0 ? Number(rule.interval) : 1;
  const configuredWeekdays = Array.isArray(rule.byWeekday)
    ? rule.byWeekday.filter((value): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6)
    : [expectedWeekday];
  if (!configuredWeekdays.includes(expectedWeekday)) return [];
  const weekdays = [expectedWeekday];

  const anchor = localParts(new Date(event.startsAt));
  const today = localParts(now);
  const firstDateNumber = Math.max(dateNumber(anchor.year, anchor.month, anchor.day), dateNumber(today.year, today.month, today.day));
  const lastDateNumber = dateNumber(today.year, today.month, today.day) + lookaheadDays;
  const anchorWeek = dateNumber(anchor.year, anchor.month, anchor.day) - new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day)).getUTCDay();
  const offsets = reminderOffsets(rule);
  const untilValue = typeof rule.until === "string" ? new Date(rule.until) : null;
  const untilKey = untilValue && !Number.isNaN(untilValue.getTime()) ? dateKey(...[localParts(untilValue).year, localParts(untilValue).month, localParts(untilValue).day]) : null;
  const occurrences: ServiceOccurrence[] = [];

  for (let currentDayNumber = firstDateNumber; currentDayNumber <= lastDateNumber; currentDayNumber += 1) {
    const current = new Date(currentDayNumber * 86_400_000);
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth() + 1;
    const day = current.getUTCDate();
    const weekday = current.getUTCDay();
    const weekIndex = Math.floor((dateNumber(year, month, day) - anchorWeek) / 7);
    if (dateNumber(year, month, day) < dateNumber(anchor.year, anchor.month, anchor.day)) continue;
    if (!weekdays.includes(weekday) || weekIndex < 0 || weekIndex % interval !== 0) continue;
    const keyDate = dateKey(year, month, day);
    if (untilKey && keyDate > untilKey) continue;
    const startsAt = localDateToInstant(year, month, day, anchor.hour, anchor.minute);
    if (startsAt.getTime() <= now.getTime()) continue;
    occurrences.push({
      eventId: event.id,
      serviceType,
      occurrenceKey: `${event.id}:${serviceType}:${keyDate}`,
      startsAt,
      reminderOffsetsMinutes: offsets,
    });
  }
  return occurrences;
}

export function buildServiceReminderRows(
  occurrence: ServiceOccurrence,
  memberIds: string[],
  now = new Date(),
) {
  return occurrence.reminderOffsetsMinutes.flatMap((offsetMinutes) => {
    const scheduledFor = new Date(occurrence.startsAt.getTime() - offsetMinutes * 60_000);
    if (scheduledFor.getTime() <= now.getTime()) return [];
    return memberIds.map((memberId) => ({
      memberId,
      serviceType: occurrence.serviceType,
      occurrenceKey: occurrence.occurrenceKey,
      serviceStartsAt: occurrence.startsAt,
      offsetMinutes: String(offsetMinutes),
      scheduledFor,
      status: "pending" as const,
    }));
  });
}

export function formatServiceReminderOffset(offsetMinutes: number): string {
  if (offsetMinutes === 1440) return "1 day";
  if (offsetMinutes === 60) return "1 hour";
  if (offsetMinutes % 1440 === 0) return `${offsetMinutes / 1440} days`;
  if (offsetMinutes % 60 === 0) return `${offsetMinutes / 60} hours`;
  return `${offsetMinutes} minutes`;
}