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
  no: "not_attending",
  absent: "not_attending",
  unavailable: "not_attending",
  unknown: "not_attending",
};

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
