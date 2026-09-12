import { db } from "../db/index.js";
import { activityLogs } from "../db/schema.js";

export async function recordActivity(input: {
  actorId: string;
  actorName?: string;
  action: string;
  target: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(activityLogs).values({
    actorId: input.actorId,
    actorName: input.actorName,
    action: input.action,
    target: input.target,
    targetId: input.targetId,
    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
  });
}
