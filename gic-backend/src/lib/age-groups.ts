export const DEFAULT_AGE_GROUPS = [
  { name: "Teenagers", minAge: 13, maxAge: 17 },
  { name: "Young Adults", minAge: 18, maxAge: 30 },
  { name: "Adults", minAge: 31, maxAge: 59 },
  { name: "Seniors", minAge: 60, maxAge: null },
] as const;

export function normalizeBirthday(value: string | null | undefined) {
  const input = String(value || "").trim();
  const match = input.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const validDay = new Date(Date.UTC(2000, month - 1, day));
  if (month < 1 || month > 12 || validDay.getUTCMonth() !== month - 1 || validDay.getUTCDate() !== day) return "";
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function birthdayOccursOn(value: string | null | undefined, today: { year: number; month: number; day: number }) {
  const normalized = normalizeBirthday(value);
  if (!normalized) return false;
  const [birthMonth, birthDay] = normalized.split("-").map(Number);
  const isLeapYear = today.year % 4 === 0 && (today.year % 100 !== 0 || today.year % 400 === 0);
  const feb29Fallback = birthMonth === 2 && birthDay === 29 && today.month === 2 && today.day === 28 && !isLeapYear;
  return (birthMonth === today.month && birthDay === today.day) || feb29Fallback;
}
