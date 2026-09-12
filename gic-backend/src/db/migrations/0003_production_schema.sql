-- Production-safe schema reconciliation. This migration is deliberately
-- idempotent because production databases were previously managed by push.
DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('GENERAL_ANNOUNCEMENT','EVENT_PUBLISHED','EVENT_REMINDER','EVENT_UPDATED','EVENT_CANCELLED','REGISTRATION_CONFIRMATION','REGISTRATION_CANCELLED','FORM_AVAILABLE','MINISTRY_UPDATE','SYSTEM_NOTIFICATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE delivery_status AS ENUM ('pending','sent','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_status AS ENUM ('DRAFT','SCHEDULED','PROCESSING','SENT','PARTIALLY_FAILED','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE audience_type AS ENUM ('everyone','ministry','event_registrants','members'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS admin_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL, type notification_type NOT NULL, audience audience_type NOT NULL, audience_ministry_id text, audience_event_id text, audience_member_ids text[], destination_url text, status notification_status NOT NULL DEFAULT 'DRAFT', scheduled_at timestamptz, sent_at timestamptz, created_by text NOT NULL, recipient_count text DEFAULT '0', sent_count text DEFAULT '0', failed_count text DEFAULT '0', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS ministry_applications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, member_name text NOT NULL, ministry text NOT NULL, message text, status text NOT NULL DEFAULT 'PENDING', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS notification_preferences (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL UNIQUE, push_enabled boolean NOT NULL DEFAULT true, email_enabled boolean NOT NULL DEFAULT false, general_announcements boolean NOT NULL DEFAULT true, event_updates boolean NOT NULL DEFAULT true, reminders boolean NOT NULL DEFAULT true, ministry_updates boolean NOT NULL DEFAULT true, registration_updates boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS push_devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, firebase_installation_id text, token text NOT NULL UNIQUE, platform text NOT NULL DEFAULT 'web', browser text NOT NULL DEFAULT 'unknown', device_name text, active boolean NOT NULL DEFAULT true, last_seen_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, message_id uuid, title text NOT NULL, body text NOT NULL, type notification_type NOT NULL, destination_url text, read_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS notification_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL, member_id text NOT NULL, device_id uuid NOT NULL, status delivery_status NOT NULL DEFAULT 'pending', sent_at timestamptz, failed_at timestamptz, error_code text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS service_reminders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id text NOT NULL, service_type text NOT NULL, occurrence_key text NOT NULL, service_starts_at timestamptz NOT NULL, offset_minutes text NOT NULL, scheduled_for timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

-- Keep the earliest delivery attempt for each notification/device pair before
-- applying the idempotency constraint. No delivery history is truncated.
DELETE FROM notification_deliveries duplicate_row
USING notification_deliveries kept_row
WHERE duplicate_row.notification_id = kept_row.notification_id
  AND duplicate_row.device_id = kept_row.device_id
  AND (duplicate_row.created_at > kept_row.created_at OR (duplicate_row.created_at = kept_row.created_at AND duplicate_row.id > kept_row.id));

DO $$ BEGIN
  ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_unique UNIQUE (notification_id, device_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notifications ADD CONSTRAINT notifications_message_id_admin_notifications_id_fk FOREIGN KEY (message_id) REFERENCES admin_notifications(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_notification_id_notifications_id_fk FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_device_id_push_devices_id_fk FOREIGN KEY (device_id) REFERENCES push_devices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS service_reminders_member_occurrence_offset_unique ON service_reminders(member_id, occurrence_key, offset_minutes);
CREATE INDEX IF NOT EXISTS notifications_member_id_idx ON notifications(member_id);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx ON notifications(read_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx ON notification_deliveries(status);
CREATE INDEX IF NOT EXISTS service_reminders_due_idx ON service_reminders(status, scheduled_for);
