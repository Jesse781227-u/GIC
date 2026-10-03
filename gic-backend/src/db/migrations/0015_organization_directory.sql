ALTER TABLE ministries ADD COLUMN IF NOT EXISTS organization_type text NOT NULL DEFAULT 'ministry';
ALTER TABLE ministries ADD COLUMN IF NOT EXISTS application_required boolean NOT NULL DEFAULT true;
ALTER TABLE cells ADD COLUMN IF NOT EXISTS organization_type text NOT NULL DEFAULT 'cell';
ALTER TABLE cells ADD COLUMN IF NOT EXISTS application_required boolean NOT NULL DEFAULT false;
ALTER TABLE ministry_applications ADD COLUMN IF NOT EXISTS cell_id uuid REFERENCES cells(id) ON DELETE CASCADE;
ALTER TABLE ministry_applications ADD COLUMN IF NOT EXISTS organization_kind text NOT NULL DEFAULT 'ministry';
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_kind text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE cells SET organization_type = 'fellowship' WHERE lower(name) LIKE '%fellowship%';

CREATE TABLE IF NOT EXISTS organization_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  organization_kind text NOT NULL,
  organization_id uuid NOT NULL,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Leader',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT organization_leaders_unique UNIQUE(church_id, organization_kind, organization_id, member_id)
);
CREATE INDEX IF NOT EXISTS organization_leaders_org_idx ON organization_leaders(church_id, organization_kind, organization_id);

CREATE INDEX IF NOT EXISTS events_organization_idx ON events(church_id, organization_kind, organization_id);
CREATE INDEX IF NOT EXISTS ministry_applications_cell_idx ON ministry_applications(church_id, cell_id, status);