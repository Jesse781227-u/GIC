export const eventStatuses = ["DRAFT", "PUBLISHED", "UNPUBLISHED", "CANCELLED", "COMPLETED"] as const;
export type EventStatus = typeof eventStatuses[number];

export type EventRegistrationAvailability = {
  allowed: boolean;
  reason: "open" | "not_published" | "not_required" | "not_open" | "closed" | "cancelled" | "completed";
};

export function eventRegistrationAvailability(event: {
  status: string;
  registrationRequired: boolean;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
}, now = new Date()): EventRegistrationAvailability {
  if (event.status === "CANCELLED") return { allowed: false, reason: "cancelled" };
  if (event.status === "COMPLETED") return { allowed: false, reason: "completed" };
  if (event.status !== "PUBLISHED") return { allowed: false, reason: "not_published" };
  if (event.registrationOpensAt && event.registrationOpensAt > now) return { allowed: false, reason: "not_open" };
  if (event.registrationClosesAt && event.registrationClosesAt <= now) return { allowed: false, reason: "closed" };
  if (!event.registrationRequired) return { allowed: true, reason: "not_required" };
  return { allowed: true, reason: "open" };
}

const eventTransitions: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["PUBLISHED"],
  PUBLISHED: ["UNPUBLISHED", "CANCELLED", "COMPLETED"],
  UNPUBLISHED: ["PUBLISHED", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export function canTransitionEvent(from: string, to: string) {
  return eventStatuses.includes(from as EventStatus) && eventTransitions[from as EventStatus].includes(to as EventStatus);
}

export type RegistrationField = { id: string; label: string; type: "text" | "email" | "phone" | "textarea" | "checkbox"; required?: boolean };

export function validateEventForm(fields: RegistrationField[], answers: Record<string, unknown>) {
  const errors: string[] = [];
  for (const field of fields) {
    const value = answers[field.id];
    const present = field.type === "checkbox" ? value === true : typeof value === "string" && value.trim().length > 0;
    if (field.required && !present) errors.push(`${field.label} is required.`);
    if (present && field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push(`${field.label} must be a valid email address.`);
  }
  const allowed = new Set(fields.map((field) => field.id));
  if (Object.keys(answers).some((key) => !allowed.has(key))) errors.push("The form contains an unknown field.");
  return errors;
}