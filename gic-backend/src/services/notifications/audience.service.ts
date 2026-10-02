import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cells, cellMemberships, eventRegistrations, events, members, ministries, ministryMemberships, pushDevices, segments } from "../../db/schema.js";
import { resolveSegmentMemberIds } from "../member-groups.service.js";

export type AudienceQuery = {
  kind: "everyone" | "ministry" | "cell" | "segment" | "event_registrants" | "members";
  churchId: string;
  ministryId?: string;
  cellId?: string;
  segmentId?: string;
  eventId?: string;
  memberIds?: string[];
};

export type ResolvedRecipient = {
  memberId: string;
  deviceIds: string[];
};

export class AudienceService {
  async resolve(query: AudienceQuery): Promise<ResolvedRecipient[]> {
    let memberIds: string[];
    if (query.kind === "everyone") {
      memberIds = (await db.query.members.findMany({ where: and(eq(members.churchId, query.churchId), eq(members.active, true)) })).map((member) => member.id);
    } else if (query.kind === "members") {
      if (!query.memberIds?.length) return [];
      const allowed = new Set(query.memberIds);
      memberIds = (await db.query.members.findMany({ where: and(eq(members.churchId, query.churchId), eq(members.active, true), inArray(members.id, [...allowed])) })).map((member) => member.id);
    } else if (query.kind === "ministry") {
      if (!query.ministryId || !await db.query.ministries.findFirst({ where: and(eq(ministries.id, query.ministryId), eq(ministries.churchId, query.churchId), eq(ministries.active, true)) })) return [];
      memberIds = (await db.query.ministryMemberships.findMany({ where: and(eq(ministryMemberships.churchId, query.churchId), eq(ministryMemberships.ministryId, query.ministryId)) })).map((row) => row.memberId);
    } else if (query.kind === "cell") {
      if (!query.cellId || !await db.query.cells.findFirst({ where: and(eq(cells.id, query.cellId), eq(cells.churchId, query.churchId), eq(cells.active, true)) })) return [];
      memberIds = (await db.query.cellMemberships.findMany({ where: and(eq(cellMemberships.churchId, query.churchId), eq(cellMemberships.cellId, query.cellId)) })).map((row) => row.memberId);
    } else if (query.kind === "segment") {
      const segment = query.segmentId ? await db.query.segments.findFirst({ where: and(eq(segments.id, query.segmentId), eq(segments.churchId, query.churchId), eq(segments.active, true)) }) : null;
      if (!segment) return [];
      memberIds = await resolveSegmentMemberIds(query.churchId, segment);
    } else {
      if (!query.eventId || !await db.query.events.findFirst({ where: and(eq(events.id, query.eventId), eq(events.churchId, query.churchId)) })) return [];
      memberIds = (await db.query.eventRegistrations.findMany({ where: and(eq(eventRegistrations.eventId, query.eventId), eq(eventRegistrations.status, "CONFIRMED")) })).map((row) => row.memberId);
    }
    const activeMembers = memberIds.length ? await db.query.members.findMany({ where: and(eq(members.churchId, query.churchId), eq(members.active, true), inArray(members.id, [...new Set(memberIds)])) }) : [];
    const activeIds = activeMembers.map((member) => member.id);
    if (!activeIds.length) return [];
    const devices = await db.query.pushDevices.findMany({ where: and(eq(pushDevices.churchId, query.churchId), eq(pushDevices.active, true), inArray(pushDevices.memberId, activeIds)) });

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
