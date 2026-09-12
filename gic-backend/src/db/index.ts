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
  await client`CREATE TABLE IF NOT EXISTS member_merge_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_member_id text NOT NULL, merged_member_id text NOT NULL, reason text NOT NULL, differences text, created_at timestamptz DEFAULT now())`;
  await client`CREATE TABLE IF NOT EXISTS activity_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL, actor_name text, action text NOT NULL, target text NOT NULL, target_id text, metadata text, created_at timestamptz DEFAULT now())`;
  await client`CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at)`;
  await client`CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx ON activity_logs(actor_id)`;
  await client`CREATE TABLE IF NOT EXISTS events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text, starts_at timestamptz NOT NULL, ends_at timestamptz, location text, image_url text, is_paid boolean NOT NULL DEFAULT false, price integer, notify_on_publish boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'DRAFT', created_by text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await client`ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at timestamptz, ADD COLUMN IF NOT EXISTS image_url text, ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS price integer, ADD COLUMN IF NOT EXISTS notify_on_publish boolean NOT NULL DEFAULT false`;
  await client`CREATE TABLE IF NOT EXISTS service_reminders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, service_type text NOT NULL, occurrence_key text NOT NULL, service_starts_at timestamptz NOT NULL, offset_minutes text NOT NULL, scheduled_for timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(member_id, occurrence_key, offset_minutes))`;
  await client`CREATE INDEX IF NOT EXISTS service_reminders_due_idx ON service_reminders(status, scheduled_for)`;
  await client`CREATE TABLE IF NOT EXISTS birthday_notification_sends (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, birthday_date text NOT NULL, status text NOT NULL DEFAULT 'processing', sent_at timestamptz, error text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE(member_id, birthday_date))`;
  await client`CREATE INDEX IF NOT EXISTS birthday_notification_sends_date_idx ON birthday_notification_sends(birthday_date)`;
  await client`CREATE TABLE IF NOT EXISTS ministry_applications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, member_name text NOT NULL, ministry text NOT NULL, message text, status text NOT NULL DEFAULT 'PENDING', decided_at timestamptz, decided_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`;
  await client`ALTER TABLE ministry_applications ADD COLUMN IF NOT EXISTS decided_at timestamptz, ADD COLUMN IF NOT EXISTS decided_by text`;
  await client`CREATE INDEX IF NOT EXISTS ministry_applications_member_id_idx ON ministry_applications(member_id)`;
  // Consolidate legacy records before adding identity indexes. The log preserves
  // the ids and the differing profile values for review after deployment.
  const duplicateGroups = await client`
    SELECT array_agg(id ORDER BY created_at NULLS LAST, id) AS ids,
      'phone' AS reason, regexp_replace(phone, '[^0-9]', '', 'g') AS identity
    FROM members WHERE phone IS NOT NULL AND btrim(phone) <> ''
    GROUP BY regexp_replace(phone, '[^0-9]', '', 'g') HAVING count(*) > 1
    UNION ALL
    SELECT array_agg(id ORDER BY created_at NULLS LAST, id), 'email', lower(btrim(email))
    FROM members WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email)) HAVING count(*) > 1
  `;
  for (const group of duplicateGroups) {
    const ids = group.ids as string[];
    const canonicalId = ids[0];
    for (const mergedId of ids.slice(1)) {
      const [canonical] = await client`SELECT display_name, phone, email, ministries, center, service_time, birthday, membership_status, joined_month, joined_year, avatar FROM members WHERE id = ${canonicalId}`;
      const [merged] = await client`SELECT display_name, phone, email, ministries, center, service_time, birthday, membership_status, joined_month, joined_year, avatar FROM members WHERE id = ${mergedId}`;
      if (!canonical || !merged) continue;
      await client`INSERT INTO member_merge_logs (canonical_member_id, merged_member_id, reason, differences) VALUES (${canonicalId}, ${mergedId}, ${group.reason}, ${JSON.stringify({ canonical, merged })})`;
      await client`UPDATE push_devices SET member_id = ${canonicalId} WHERE member_id = ${mergedId}`;
      await client`UPDATE notification_preferences SET member_id = ${canonicalId} WHERE member_id = ${mergedId} AND NOT EXISTS (SELECT 1 FROM notification_preferences WHERE member_id = ${canonicalId})`;
      await client`UPDATE notifications SET member_id = ${canonicalId} WHERE member_id = ${mergedId}`;
      await client`UPDATE service_reminders SET member_id = ${canonicalId} WHERE member_id = ${mergedId}`;
      await client`UPDATE ministry_applications SET member_id = ${canonicalId} WHERE member_id = ${mergedId}`;
      await client`UPDATE notification_deliveries SET member_id = ${canonicalId} WHERE member_id = ${mergedId}`;
      await client`DELETE FROM notification_preferences WHERE member_id = ${mergedId}`;
      await client`DELETE FROM members WHERE id = ${mergedId}`;
    }
  }
  await client`CREATE UNIQUE INDEX IF NOT EXISTS members_phone_identity_unique ON members (regexp_replace(phone, '[^0-9]', '', 'g')) WHERE phone IS NOT NULL AND btrim(phone) <> ''`;
  await client`CREATE UNIQUE INDEX IF NOT EXISTS members_email_identity_unique ON members (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> ''`;
}

export const db = drizzle(client, { schema: { ...schema, ...relations } });
export type DB = typeof db;
