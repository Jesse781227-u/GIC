import { relations } from "drizzle-orm";
import {
  pushDevices,
  notificationPreferences,
  adminNotifications,
  notifications,
  notificationDeliveries,
  serviceReminders,
  birthdayNotificationSends,
  events,
  eventPickupLocations,
  eventRegistrations,
  eventReminders,
  busPickupPoints,
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

export const serviceRemindersRelations = relations(serviceReminders, () => ({}));
export const birthdayNotificationSendsRelations = relations(birthdayNotificationSends, () => ({}));
export const eventsRelations = relations(events, ({ many }) => ({
  pickupLocations: many(eventPickupLocations),
  registrations: many(eventRegistrations),
  reminders: many(eventReminders),
}));
export const eventPickupLocationsRelations = relations(eventPickupLocations, ({ one, many }) => ({
  event: one(events, { fields: [eventPickupLocations.eventId], references: [events.id] }),
  busPickupPoint: one(busPickupPoints, { fields: [eventPickupLocations.busPickupPointId], references: [busPickupPoints.id] }),
  registrations: many(eventRegistrations),
}));
export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  event: one(events, { fields: [eventRegistrations.eventId], references: [events.id] }),
  pickupLocation: one(eventPickupLocations, { fields: [eventRegistrations.pickupLocationId], references: [eventPickupLocations.id] }),
}));
export const eventRemindersRelations = relations(eventReminders, ({ one }) => ({
  event: one(events, { fields: [eventReminders.eventId], references: [events.id] }),
}));
