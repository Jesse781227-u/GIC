import { db } from "../../db/index.js";
import { pushDevices } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export interface PushDeviceCreate {
  memberId: string;
  firebaseInstallationId?: string;
  token: string;
  platform?: string;
  browser?: string;
  deviceName?: string;
}

export class DeviceService {
  async register(data: PushDeviceCreate) {
    if (!data.memberId || data.memberId.trim().length === 0) {
      throw new Error("memberId is required");
    }

    const existing = await db.query.pushDevices.findFirst({
      where: eq(pushDevices.token, data.token),
    });

    if (existing) {
      if (existing.memberId !== data.memberId) {
        throw new Error("This push token is already registered to a different member");
      }

      if (existing.active) {
        const [updated] = await db
          .update(pushDevices)
          .set({
            firebaseInstallationId: data.firebaseInstallationId ?? existing.firebaseInstallationId,
            platform: data.platform ?? existing.platform,
            browser: data.browser ?? existing.browser,
            deviceName: data.deviceName ?? existing.deviceName,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pushDevices.id, existing.id))
          .returning();
        return updated;
      }

      const [updated] = await db
        .update(pushDevices)
        .set({
          memberId: data.memberId,
          active: true,
          firebaseInstallationId: data.firebaseInstallationId ?? existing.firebaseInstallationId,
          platform: data.platform ?? existing.platform,
          browser: data.browser ?? existing.browser,
          deviceName: data.deviceName ?? existing.deviceName,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pushDevices.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(pushDevices).values({
      ...data,
      active: true,
      updatedAt: new Date(),
    }).returning();
    return created;
  }

  async deactivateForMember(memberId: string, tokenOrId: string) {
    const device = await db.query.pushDevices.findFirst({
      where: and(eq(pushDevices.id, tokenOrId), eq(pushDevices.memberId, memberId)),
    });

    if (!device) {
      throw new Error("Device not found for this member");
    }

    await this.deactivate(device.id);
  }

  async deactivate(tokenOrId: string) {
    // Check if it's a UUID (id) or a long FCM token string
    if (tokenOrId.length > 36) {
      await db
        .update(pushDevices)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(pushDevices.token, tokenOrId));
    } else {
      await db
        .update(pushDevices)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(pushDevices.id, tokenOrId));
    }
  }
}

export const deviceService = new DeviceService();
