import { db } from "../../db/index.js";
import { pushDevices } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export type AudienceQuery = {
  kind: "everyone" | "ministry" | "event_registrants" | "members";
  ministryId?: string;
  eventId?: string;
  memberIds?: string[];
};

export type ResolvedRecipient = {
  memberId: string;
  deviceIds: string[];
};

export class AudienceService {
  async resolve(query: AudienceQuery): Promise<ResolvedRecipient[]> {
    let devices = await db.query.pushDevices.findMany({
      where: eq(pushDevices.active, true),
    });

    if (query.kind === "members" && query.memberIds && query.memberIds.length > 0) {
      devices = devices.filter(d => query.memberIds!.includes(d.memberId));
    }
    
    // Group devices by member
    const map = new Map<string, string[]>();
    for (const d of devices) {
      if (!map.has(d.memberId)) {
        map.set(d.memberId, []);
      }
      map.get(d.memberId)!.push(d.id);
    }

    const result: ResolvedRecipient[] = [];
    for (const [memberId, deviceIds] of map.entries()) {
      result.push({ memberId, deviceIds });
    }

    return result;
  }
}

export const audienceService = new AudienceService();
