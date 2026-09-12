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
      ADD COLUMN IF NOT EXISTS joined_month integer,
      ADD COLUMN IF NOT EXISTS joined_year integer,
      ADD COLUMN IF NOT EXISTS avatar text
  `;
  await client`CREATE TABLE IF NOT EXISTS events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text, starts_at timestamptz NOT NULL, location text, status text NOT NULL DEFAULT 'DRAFT', created_by text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await client`CREATE TABLE IF NOT EXISTS service_reminders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, service_type text NOT NULL, occurrence_key text NOT NULL, service_starts_at timestamptz NOT NULL, offset_minutes text NOT NULL, scheduled_for timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(member_id, occurrence_key, offset_minutes))`;
  await client`CREATE INDEX IF NOT EXISTS service_reminders_due_idx ON service_reminders(status, scheduled_for)`;
}

export const db = drizzle(client, { schema: { ...schema, ...relations } });
export type DB = typeof db;
