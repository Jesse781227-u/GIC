CREATE TABLE IF NOT EXISTS notification_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0),
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS destination_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS destination_route text,
  ADD COLUMN IF NOT EXISTS destination_media_id uuid REFERENCES notification_media(id) ON DELETE SET NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS destination_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS destination_route text,
  ADD COLUMN IF NOT EXISTS destination_media_id uuid REFERENCES notification_media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS destination_opened_at timestamptz;