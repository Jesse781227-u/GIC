CREATE TABLE IF NOT EXISTS event_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT event_interests_event_member_unique UNIQUE(event_id, member_id)
);

CREATE INDEX IF NOT EXISTS event_interests_event_id_idx ON event_interests(event_id);
CREATE INDEX IF NOT EXISTS event_interests_member_id_idx ON event_interests(member_id);
CREATE INDEX IF NOT EXISTS event_interests_church_id_idx ON event_interests(church_id);