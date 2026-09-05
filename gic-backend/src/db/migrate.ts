import "dotenv/config";
import { db } from "./index.js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function runMigrations() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations complete.");
  process.exit(0);
}

runMigrations().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
