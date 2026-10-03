ALTER TABLE events
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN IF NOT EXISTS allow_registration_cancellation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_form jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb,
  ADD COLUMN IF NOT EXISTS online_platform text;

ALTER TABLE events ALTER COLUMN status SET DEFAULT 'DRAFT';
DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_status_check CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED','CANCELLED','COMPLETED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN IF NOT EXISTS form_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS form_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS waitlist_position integer,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE event_registrations SET attendance_status = 'ATTENDED' WHERE status = 'ATTENDED';
UPDATE event_registrations SET status = 'CONFIRMED' WHERE status = 'ATTENDED';
DO $$ BEGIN
  ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status_check CHECK (status IN ('CONFIRMED','WAITLISTED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_attendance_status_check CHECK (attendance_status IN ('REGISTERED','ATTENDED','DID_NOT_ATTEND'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS event_registrations_waitlist_idx ON event_registrations(event_id, status, waitlist_position, registered_at);
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_reference_code_unique ON event_registrations(reference_code) WHERE reference_code IS NOT NULL;