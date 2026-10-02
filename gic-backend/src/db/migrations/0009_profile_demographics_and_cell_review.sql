CREATE TABLE IF NOT EXISTS age_group_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_age integer NOT NULL CHECK (min_age >= 0),
  max_age integer CHECK (max_age IS NULL OR max_age >= min_age),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT age_group_definitions_church_name_unique UNIQUE (church_id, name),
  CONSTRAINT age_group_definitions_church_id_id_unique UNIQUE (church_id, id)
);
CREATE INDEX IF NOT EXISTS age_group_definitions_church_idx ON age_group_definitions(church_id);

ALTER TABLE members ADD COLUMN IF NOT EXISTS age_group_id uuid REFERENCES age_group_definitions(id) ON DELETE SET NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS relationship_status text;
DO $$ BEGIN
  ALTER TABLE members ADD CONSTRAINT members_age_group_tenant_fk
    FOREIGN KEY (church_id, age_group_id) REFERENCES age_group_definitions(church_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE members ADD CONSTRAINT members_relationship_status_check
    CHECK (relationship_status IS NULL OR relationship_status IN ('Single', 'Married'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS members_church_age_group_idx ON members(church_id, age_group_id);

UPDATE members
SET birthday = substring(birthday FROM 6 FOR 5)
WHERE birthday ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

ALTER TABLE cell_memberships ADD COLUMN IF NOT EXISTS eligibility_review_required boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS cell_memberships_review_idx
  ON cell_memberships(church_id, cell_id) WHERE eligibility_review_required = true;

INSERT INTO age_group_definitions (church_id, name, min_age, max_age)
SELECT churches.id, defaults.name, defaults.min_age, defaults.max_age
FROM churches
CROSS JOIN (VALUES
  ('Children', 0, 12),
  ('Teenagers', 13, 17),
  ('Young Adults', 18, 30),
  ('Adults', 31, 59),
  ('Seniors', 60, NULL)
) AS defaults(name, min_age, max_age)
ON CONFLICT (church_id, name) DO NOTHING;
