import type { members } from "../db/schema.js";

export type GroupCondition = { field: string; operator: string; value?: unknown; min?: number; max?: number };
export type GroupRules = { logic?: "and" | "or"; conditions?: GroupCondition[] };
export type GroupMember = typeof members.$inferSelect;

function memberAge(member: GroupMember, now: Date) {
  const birthday = member.birthday || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const date = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

export function matchesProfileCondition(member: GroupMember, condition: GroupCondition, now = new Date()) {
  switch (condition.field) {
    case "gender": return condition.operator === "equals" && member.gender === condition.value;
    case "center": return condition.operator === "equals" && member.center === condition.value;
    case "membership_status": return condition.operator === "equals" && member.membershipStatus === condition.value;
    case "age": {
      const age = memberAge(member, now);
      return age !== null && (condition.min === undefined || age >= condition.min) && (condition.max === undefined || age <= condition.max);
    }
    case "joined_within_months": {
      const months = Number(condition.value);
      if (!Number.isInteger(months) || months < 1 || !member.joinedYear) return false;
      const joined = new Date(Date.UTC(member.joinedYear, (member.joinedMonth || 1) - 1, 1));
      const cutoff = new Date(now);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
      return joined >= new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1)) && joined <= now;
    }
    default: return false;
  }
}

export function describeGroupRules(rules: GroupRules) {
  const conditions = rules.conditions || [];
  if (!conditions.length) return "All members";
  const descriptions = conditions.map((condition) => {
    switch (condition.field) {
      case "gender": return `gender is ${String(condition.value)}`;
      case "center": return `center is ${String(condition.value)}`;
      case "membership_status": return `membership status is ${String(condition.value)}`;
      case "age": return `age is between ${condition.min ?? 0} and ${condition.max ?? 120}`;
      case "joined_within_months": return `joined within the last ${Number(condition.value ?? 0)} month${Number(condition.value ?? 0) === 1 ? "" : "s"}`;
      case "ministry_id": return `belongs to ministry ${String(condition.value ?? "")}`;
      case "cell_id": return `belongs to fellowship/cell ${String(condition.value ?? "")}`;
      default: return "matches the configured criteria";
    }
  });
  return descriptions.length === 1 ? descriptions[0] : descriptions.join(rules.logic === "or" ? " or " : " and ");
}

export function matchesGroupRules(member: GroupMember, rules: GroupRules, relationMatch: (condition: GroupCondition) => boolean = () => false, now = new Date()) {
  const conditions = rules.conditions || [];
  if (!conditions.length) return true;
  const results = conditions.map((condition) => ["ministry_id", "cell_id"].includes(condition.field)
    ? relationMatch(condition)
    : matchesProfileCondition(member, condition, now));
  return rules.logic === "or" ? results.some(Boolean) : results.every(Boolean);
}
