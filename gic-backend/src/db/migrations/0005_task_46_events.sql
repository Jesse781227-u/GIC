ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'Service',
  ADD COLUMN IF NOT EXISTS registration_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_capacity integer,
  ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS organizer_unit text,
  ADD COLUMN IF NOT EXISTS organizer_contact_person text,
  ADD COLUMN IF NOT EXISTS organizer_contact_phone text,
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_url text,
  ADD COLUMN IF NOT EXISTS online_access_instructions text,
  ADD COLUMN IF NOT EXISTS bus_transport_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'CHURCH',
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS map_info text,
  ADD COLUMN IF NOT EXISTS send_registration_confirmation boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS event_pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  address_landmark text NOT NULL,
  pickup_time timestamptz NOT NULL,
  capacity integer NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_pickup_locations_event_id_idx ON event_pickup_locations(event_id);
CREATE INDEX IF NOT EXISTS event_pickup_locations_active_idx ON event_pickup_locations(active);

CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED',
  pickup_location_id uuid REFERENCES event_pickup_locations(id) ON DELETE SET NULL,
  registered_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, member_id)
);
CREATE INDEX IF NOT EXISTS event_registrations_event_id_idx ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS event_registrations_member_id_idx ON event_registrations(member_id);
CREATE INDEX IF NOT EXISTS event_registrations_pickup_location_id_idx ON event_registrations(pickup_location_id);

CREATE TABLE IF NOT EXISTS event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  offset_minutes integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, offset_minutes)
);
CREATE INDEX IF NOT EXISTS event_reminders_due_idx ON event_reminders(status, scheduled_for);