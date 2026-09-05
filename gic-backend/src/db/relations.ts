import { relations } from "drizzle-orm";
import {
  pushDevices,
  notificationPreferences,
  adminNotifications,
  notifications,
  notificationDeliveries,
} from "./schema.js";

export const pushDevicesRelations = relations(pushDevices, ({ many }) => ({
  deliveries: many(notificationDeliveries),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  () => ({})
);

export const adminNotificationsRelations = relations(adminNotifications, ({ many }) => ({
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  adminNotification: one(adminNotifications, {
    fields: [notifications.messageId],
    references: [adminNotifications.id],
  }),
  deliveries: many(notificationDeliveries),
}));

export const notificationDeliveriesRelations = relations(notificationDeliveries, ({ one }) => ({
  notification: one(notifications, {
    fields: [notificationDeliveries.notificationId],
    references: [notifications.id],
  }),
  device: one(pushDevices, {
    fields: [notificationDeliveries.deviceId],
    references: [pushDevices.id],
  }),
}));
