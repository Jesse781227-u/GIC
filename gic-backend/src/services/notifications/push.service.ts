import { getMessaging } from "../../lib/firebase.js";
import { db } from "../../db/index.js";
import { notificationDeliveries, pushDevices } from "../../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { deviceService } from "./device.service.js";
import { isAllowedMemberRoute } from "../../lib/member-routes.js";

export class PushService {
  async processDeliveries(deliveryIds: string[], title: string, body: string, url?: string, data?: Record<string, string>) {
    if (deliveryIds.length === 0) return;

    // 1. Fetch the deliveries and their associated devices
    const deliveries = await db.query.notificationDeliveries.findMany({
      where: inArray(notificationDeliveries.id, deliveryIds),
      with: {
        device: true,
        notification: true,
      },
    });

    if (deliveries.length === 0) return;

    // We can only send to deliveries that have an active device with a token
    const validDeliveries = deliveries.filter(d => d.device && d.device.active && d.device.token);
    
    if (validDeliveries.length === 0) {
      // Mark all as failed (no valid device)
      await db
        .update(notificationDeliveries)
        .set({ status: "failed", errorCode: "NO_ACTIVE_DEVICE", failedAt: new Date() })
        .where(inArray(notificationDeliveries.id, deliveryIds));
      return;
    }

    const messaging = getMessaging();

    // Use sendEachForMulticast to batch the sends (up to 500 at a time)
    // We construct a mapping from index -> delivery ID so we can correlate results
    const messages = validDeliveries.map((delivery) => {
      const notification = delivery.notification;
      const destinationType = notification?.destinationType || "none";
      const destinationRoute = destinationType === "internal_route" ? notification?.destinationRoute ?? undefined : undefined;
      const mediaId = destinationType === "media_page" ? notification?.destinationMediaId : undefined;
      const safeLegacyRoute = destinationType === "none" && isAllowedMemberRoute(notification?.destinationUrl) ? notification?.destinationUrl ?? undefined : undefined;
      const notificationData = {
        type: "gic_notification",
        notificationId: notification?.id || "",
        destinationType: mediaId ? "media_page" : destinationRoute || safeLegacyRoute ? "internal_route" : "none",
        ...(destinationRoute || safeLegacyRoute ? { destinationRoute: destinationRoute || safeLegacyRoute } : {}),
        ...(mediaId ? { mediaId } : {}),
        ...data,
      };
      const tapUrl = new URL(`/notification-open?notificationId=${encodeURIComponent(notification?.id || "")}`, process.env.MEMBER_APP_URL || "http://localhost:3000").toString();
      return {
        token: delivery.device.token,
        notification: { title, body },
        data: notificationData,
        webpush: { fcmOptions: { link: tapUrl } },
      };
    });

    try {
      const response = await messaging.sendEach(messages);
      
      const successIds: string[] = [];
      const failedUpdates: { id: string, error: string }[] = [];
      const deactivatedDeviceIds: string[] = [];

      response.responses.forEach((res, idx) => {
        const deliveryId = validDeliveries[idx].id;
        if (res.success) {
          successIds.push(deliveryId);
        } else {
          const error = res.error?.code || "UNKNOWN_ERROR";
          failedUpdates.push({ id: deliveryId, error });
          
          // Deactivate invalid tokens
          if (error === "messaging/invalid-registration-token" || error === "messaging/registration-token-not-registered") {
            deactivatedDeviceIds.push(validDeliveries[idx].device.id);
          }
        }
      });

      // Update statuses in DB
      if (successIds.length > 0) {
        await db
          .update(notificationDeliveries)
          .set({ status: "sent", sentAt: new Date() })
          .where(inArray(notificationDeliveries.id, successIds));
      }

      for (const fail of failedUpdates) {
        await db
          .update(notificationDeliveries)
          .set({ status: "failed", errorCode: fail.error, failedAt: new Date() })
          .where(eq(notificationDeliveries.id, fail.id));
      }

      // Deactivate dead devices
      for (const deviceId of deactivatedDeviceIds) {
        await deviceService.deactivate(deviceId);
      }

    } catch (e) {
      console.error("FCM Multicast Error:", e);
      // If the whole multicast call fails, mark them all failed
      await db
        .update(notificationDeliveries)
        .set({ status: "failed", errorCode: "FCM_NETWORK_ERROR", failedAt: new Date() })
        .where(inArray(notificationDeliveries.id, validDeliveries.map(d => d.id)));
    }
  }
}


export const pushService = new PushService();
