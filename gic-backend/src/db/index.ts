import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

export async function ensureDatabaseSchema() {
  await client`
    ALTER TABLE members
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS email text,
      ADD COLUMN IF NOT EXISTS ministries text,
      ADD COLUMN IF NOT EXISTS center text,
      ADD COLUMN IF NOT EXISTS service_time text,
      ADD COLUMN IF NOT EXISTS birthday text,
      ADD COLUMN IF NOT EXISTS membership_status text,
      ADD COLUMN IF NOT EXISTS avatar text
  `;
}

export const db = drizzle(client, { schema: { ...schema, ...relations } });
export type DB = typeof db;
