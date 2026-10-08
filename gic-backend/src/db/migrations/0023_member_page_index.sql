CREATE INDEX IF NOT EXISTS members_church_created_at_idx
  ON members (church_id, created_at DESC);