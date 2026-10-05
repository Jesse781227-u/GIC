export const ATTENDANCE_RESPONSE_VALUES = ["in_person", "online", "not_attending"] as const;

export type AttendanceResponse = typeof ATTENDANCE_RESPONSE_VALUES[number];

export type AttendanceRow = {
  response?: string | null;
  [key: string]: unknown;
};

const responseAliases: Record<string, AttendanceResponse> = {
  in_person: "in_person",
  "in-person": "in_person",
  "in person": "in_person",
  onsite: "in_person",
  on_site: "in_person",
  great_at_church: "in_person",
  worshipping: "in_person",
  online: "online",
  live: "online",
  virtual: "online",
  hybrid: "online",
  not_attending: "not_attending",
  not_attaching: "not_attending",
  no: "not_attending",
  absent: "not_attending",
  unavailable: "not_attending",
  unknown: "not_attending",
};

function getStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function formatServiceOccurrenceLabel(title: string, occurrenceId: string, startedAt?: string | Date | null) {
  const cleanTitle = title?.trim() || "Service";
  const dateKey = occurrenceId.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
  const eventStart = startedAt ? new Date(startedAt) : null;
  if (!dateKey && (!eventStart || Number.isNaN(eventStart.getTime()))) return cleanTitle;

  const occurrenceDate = dateKey ? new Date(`${dateKey}T12:00:00.000Z`) : eventStart!;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(occurrenceDate);
  const timeLabel = eventStart && !Number.isNaN(eventStart.getTime())
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(eventStart)
    : "";

  return [dateLabel, cleanTitle, timeLabel].filter(Boolean).join(" · ");
}

export function groupServiceAttendanceRows(rows: Array<Record<string, unknown>> = []) {
  const buckets = new Map<string, {
    occurrenceId: string;
    eventTitle: string;
    serviceLabel: string;
    serviceStartsAt: string | null;
    total: number;
    inPerson: number;
    online: number;
    notAttending: number;
  }>();

  for (const row of rows) {
    const occurrenceId = getStringValue(row?.occurrenceId) || "unknown-occurrence";
    const eventTitle = getStringValue(row?.eventTitle) || "Service";
    const serviceStartsAt = row?.serviceStartsAt ? new Date(String(row.serviceStartsAt)).toISOString() : null;
    const key = occurrenceId;

    if (!buckets.has(key)) {
      buckets.set(key, {
        occurrenceId,
        eventTitle,
        serviceLabel: formatServiceOccurrenceLabel(eventTitle, occurrenceId, serviceStartsAt),
        serviceStartsAt,
        total: 0,
        inPerson: 0,
        online: 0,
        notAttending: 0,
      });
    }

    const bucket = buckets.get(key)!;
    const response = normalizeAttendanceResponse(getStringValue(row?.response));
    bucket.total += 1;
    if (response === "in_person") bucket.inPerson += 1;
    if (response === "online") bucket.online += 1;
    if (response === "not_attending") bucket.notAttending += 1;
    if (serviceStartsAt && !bucket.serviceStartsAt) bucket.serviceStartsAt = serviceStartsAt;
  }

  return Array.from(buckets.values()).sort((a, b) => (a.serviceStartsAt || "").localeCompare(b.serviceStartsAt || ""));
}

export function groupRegistrationRows(rows: Array<Record<string, unknown>> = []) {
  const buckets = new Map<string, {
    eventId: string;
    eventTitle: string;
    total: number;
    confirmed: number;
    waitlisted: number;
    pending: number;
  }>();

  for (const row of rows) {
    const eventId = getStringValue(row?.eventId) || "unknown-event";
    const eventTitle = getStringValue(row?.eventTitle) || "Event";
    const status = getStringValue(row?.status).toUpperCase();

    if (!buckets.has(eventId)) {
      buckets.set(eventId, {
        eventId,
        eventTitle,
        total: 0,
        confirmed: 0,
        waitlisted: 0,
        pending: 0,
      });
    }

    const bucket = buckets.get(eventId)!;
    bucket.total += 1;
    if (status === "CONFIRMED") bucket.confirmed += 1;
    else if (status === "WAITLISTED") bucket.waitlisted += 1;
    else if (status === "PENDING") bucket.pending += 1;
  }

  return Array.from(buckets.values()).sort((a, b) => a.eventTitle.localeCompare(b.eventTitle));
}

export function normalizeAttendanceResponse(value?: string | null): AttendanceResponse {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "not_attending";
  return responseAliases[normalized] ?? "not_attending";
}

export function buildAttendanceSummary(rows: AttendanceRow[] = [], totalEligible: number = 0) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const counts = {
    inPerson: 0,
    online: 0,
    notAttending: 0,
  };

  for (const row of safeRows) {
    const normalized = normalizeAttendanceResponse(typeof row?.response === "string" ? row.response : null);
    if (normalized === "in_person") counts.inPerson += 1;
    if (normalized === "online") counts.online += 1;
    if (normalized === "not_attending") counts.notAttending += 1;
  }

  const responded = counts.inPerson + counts.online + counts.notAttending;
  const eligibleTotal = Number.isFinite(totalEligible) && totalEligible > 0 ? totalEligible : Math.max(responded, 0);
  const responseRate = eligibleTotal === 0 ? 0 : Math.round((responded / eligibleTotal) * 100);

  return {
    totalEligible: eligibleTotal,
    responded,
    inPerson: counts.inPerson,
    online: counts.online,
    notAttending: counts.notAttending,
    noResponse: Math.max(0, eligibleTotal - responded),
    responseRate,
  };
}
