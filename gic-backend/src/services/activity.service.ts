import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";
import { DEFAULT_CHURCH_ID } from "../lib/tenant.js";

export async function recordActivity(input: {
  churchId?: string;
  actorId: string;
  actorName?: string;
  action: string;
  target: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(activityLogs).values({
    churchId: input.churchId || DEFAULT_CHURCH_ID,
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    target: input.target,
    targetId: input.targetId,
    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
  });
}
