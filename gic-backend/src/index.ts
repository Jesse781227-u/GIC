import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pushDevicesApp from "./routes/push-devices.js";
import notificationsApp from "./routes/notifications.js";
import adminNotificationsApp from "./routes/admin-notifications.js";
import authApp from "./routes/auth.js";
import mixlrApp from "./routes/mixlr.js";
import { memberApp as ministryApplicationsApp, adminApp as adminMinistryApplicationsApp } from "./routes/ministry-applications.js";
import { schedulingService } from "./services/notifications/scheduling.service.js";
import { ensureDatabaseSchema } from "./db/index.js";
import adminEventsApp from "./routes/admin-events.js";
import serviceRemindersApp from "./routes/service-reminders.js";
import adminActivityApp from "./routes/admin-activity.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      process.env.MEMBER_APP_URL || "http://localhost:3000",
      process.env.ADMIN_APP_URL || "http://localhost:3002",
    ],
    credentials: true,
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/auth", authApp);
app.route("/api/mixlr", mixlrApp);
app.route("/api/ministry-applications", ministryApplicationsApp);
app.route("/api/admin/ministry-applications", adminMinistryApplicationsApp);
app.route("/api/push-devices", pushDevicesApp);
app.route("/api/notifications", notificationsApp);
app.route("/api/admin/notifications", adminNotificationsApp);
app.route("/api/admin/events", adminEventsApp);
app.route("/api/admin/activity", adminActivityApp);
app.route("/api/service-reminders", serviceRemindersApp);

const port = parseInt(process.env.PORT || "3001");

async function start() {
  await ensureDatabaseSchema();
  schedulingService.start();
  console.log(`Starting server on port ${port}...`);
  serve({ fetch: app.fetch, port });
}

start().catch((error) => {
  console.error("Database schema check failed:", error);
  process.exit(1);
});
