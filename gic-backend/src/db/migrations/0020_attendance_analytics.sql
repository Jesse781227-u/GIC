CREATE TABLE IF NOT EXISTS mixlr_recording_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id text NOT NULL REFERENCES mixlr_recordings(id) ON DELETE CASCADE,
  recorded_at timestamptz DEFAULT now(),
  listeners integer NOT NULL DEFAULT 0,
  plays integer NOT NULL DEFAULT 0,
  listening_time_seconds integer,
  source text NOT NULL DEFAULT 'mixlr',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mixlr_recording_stats_recording_id_idx
  ON mixlr_recording_stats(recording_id);

CREATE TABLE IF NOT EXISTS mixlr_listener_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id text NOT NULL REFERENCES mixlr_recordings(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mixlr_listener_sessions_recording_id_idx
  ON mixlr_listener_sessions(recording_id);
CREATE INDEX IF NOT EXISTS mixlr_listener_sessions_member_id_idx
  ON mixlr_listener_sessions(member_id);

CREATE TABLE IF NOT EXISTS service_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_id text NOT NULL,
  member_id text NOT NULL,
  response text NOT NULL,
  responded_at timestamptz DEFAULT now(),
  source text NOT NULL DEFAULT 'attendance_pulse',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT service_attendance_occurrence_member_unique UNIQUE (occurrence_id, member_id)
);
CREATE INDEX IF NOT EXISTS service_attendance_member_id_idx ON service_attendance(member_id);
CREATE INDEX IF NOT EXISTS service_attendance_occurrence_id_idx ON service_attendance(occurrence_id);
CREATE INDEX IF NOT EXISTS service_attendance_event_id_idx ON service_attendance(event_id);
CREATE INDEX IF NOT EXISTS service_attendance_response_idx ON service_attendance(response);

CREATE TABLE IF NOT EXISTS service_attendance_pulses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_id text NOT NULL,
  scheduled_time timestamptz NOT NULL,
  actual_send_time timestamptz,
  status text NOT NULL DEFAULT 'pending',
  delay_count integer NOT NULL DEFAULT 0,
  sent_by text,
  eligible_count integer NOT NULL DEFAULT 0,
  notification_id uuid REFERENCES admin_notifications(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_attendance_pulses_occurrence_status_idx
  ON service_attendance_pulses(occurrence_id, status);
CREATE INDEX IF NOT EXISTS service_attendance_pulses_event_id_idx
  ON service_attendance_pulses(event_id);