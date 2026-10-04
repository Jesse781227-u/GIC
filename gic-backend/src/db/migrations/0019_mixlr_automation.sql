CREATE TABLE IF NOT EXISTS mixlr_channel_state (
  channel_key text PRIMARY KEY,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mixlr_recordings (
  id text PRIMARY KEY,
  title text NOT NULL,
  audio_url text NOT NULL,
  recording_url text NOT NULL,
  duration integer,
  recording_created_at timestamptz,
  notification_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mixlr_recordings_created_at_idx
  ON mixlr_recordings(created_at DESC);