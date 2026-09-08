import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pushDevicesApp from "./routes/push-devices.js";
import notificationsApp from "./routes/notifications.js";
import adminNotificationsApp from "./routes/admin-notifications.js";
import authApp from "./routes/auth.js";
import mixlrApp from "./routes/mixlr.js";
import { schedulingService } from "./services/notifications/scheduling.service.js";

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
app.route("/api/push-devices", pushDevicesApp);
app.route("/api/notifications", notificationsApp);
app.route("/api/admin/notifications", adminNotificationsApp);

// Start cron worker
schedulingService.start();

const port = parseInt(process.env.PORT || "3001");
console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
