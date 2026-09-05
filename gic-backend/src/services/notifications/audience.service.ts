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
    // Note: Since we don't have the real member/event/ministry tables in this DB 
    // (they'd be in the real platform DB), we will mock the resolution logic based on 
    // the devices we know about. In a full system, you would JOIN on the members table
    // or call an internal API to get member IDs.
    
    // For now, we resolve by simply getting all active devices.
    // If 'members' is specified, we filter by those.
    // 'ministry' and 'event_registrants' would normally filter by member associations.
    
    let devices = await db.query.pushDevices.findMany({
      where: eq(pushDevices.active, true),
    });

    if (query.kind === "members" && query.memberIds && query.memberIds.length > 0) {
      devices = devices.filter(d => query.memberIds!.includes(d.memberId));
    }
    
    // In a real integration, we'd also filter by ministry/event here.
    // For now, if we don't have the data, we just assume all active devices 
    // (or none, depending on the strictness required. Given the context, we'll return all active).

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
