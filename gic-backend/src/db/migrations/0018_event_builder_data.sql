ALTER TABLE events
  ADD COLUMN IF NOT EXISTS builder_data jsonb NOT NULL DEFAULT '{}'::jsonb;