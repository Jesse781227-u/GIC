DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('GENERAL_ANNOUNCEMENT','EVENT_PUBLISHED','EVENT_REMINDER','EVENT_UPDATED','EVENT_CANCELLED','REGISTRATION_CONFIRMATION','REGISTRATION_CANCELLED','FORM_AVAILABLE','MINISTRY_UPDATE','SYSTEM_NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE audience_type ADD VALUE IF NOT EXISTS 'cell'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE audience_type ADD VALUE IF NOT EXISTS 'segment'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS churches (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
INSERT INTO churches (id, name, slug) VALUES ('11111111-1111-4111-8111-111111111111', 'Global Impact Church', 'gic') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL, actor_name text, action text NOT NULL,
  target text NOT NULL, target_id text, metadata text, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS activity_logs_actor_id_idx ON activity_logs(actor_id);
CREATE TABLE IF NOT EXISTS member_merge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), canonical_member_id text NOT NULL, merged_member_id text NOT NULL,
  reason text NOT NULL, differences text, created_at timestamptz DEFAULT now()
);
ALTER TABLE member_merge_logs ADD COLUMN IF NOT EXISTS church_id uuid;

ALTER TABLE notification_media ADD COLUMN IF NOT EXISTS church_id uuid;
UPDATE notification_media SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE notification_media ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE notification_media ADD CONSTRAINT notification_media_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS church_id uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'church_id') THEN
    UPDATE push_devices d SET church_id = m.church_id FROM members m WHERE d.church_id IS NULL AND d.member_id = m.id;
  END IF;
END $$;
UPDATE push_devices SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE push_devices ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE push_devices ADD CONSTRAINT push_devices_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS church_id uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'church_id') THEN
    UPDATE notification_preferences p SET church_id = m.church_id FROM members m WHERE p.church_id IS NULL AND p.member_id = m.id;
  END IF;
END $$;
UPDATE notification_preferences SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE notification_preferences ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS church_id uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'church_id') THEN
    UPDATE event_registrations r SET church_id = e.church_id FROM events e WHERE r.church_id IS NULL AND r.event_id = e.id;
  END IF;
END $$;
UPDATE event_registrations SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE event_registrations ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE members ADD COLUMN IF NOT EXISTS church_id uuid;
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender text;
UPDATE members SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE members ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE members ADD CONSTRAINT members_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'church_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'member_merge_logs' AND column_name = 'church_id') THEN
    UPDATE member_merge_logs l SET church_id = m.church_id FROM members m WHERE l.church_id IS NULL AND l.canonical_member_id = m.id;
  END IF;
END $$;
UPDATE member_merge_logs SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE member_merge_logs ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE member_merge_logs ADD CONSTRAINT member_merge_logs_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS church_id uuid;
UPDATE activity_logs SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE activity_logs ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP INDEX IF EXISTS members_phone_identity_unique;
DROP INDEX IF EXISTS members_email_identity_unique;
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_identity_unique ON members(church_id, regexp_replace(phone, '[^0-9]', '', 'g')) WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS members_email_identity_unique ON members(church_id, lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';
DO $$ BEGIN ALTER TABLE members ADD CONSTRAINT members_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ministries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id), name text NOT NULL,
  description text, image_url text, active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT ministries_church_name_unique UNIQUE(church_id, name)
);
CREATE INDEX IF NOT EXISTS ministries_church_idx ON ministries(church_id);
DO $$ BEGIN ALTER TABLE ministries ADD CONSTRAINT ministries_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS ministry_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id),
  ministry_id uuid NOT NULL REFERENCES ministries(id), member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'admin', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT ministry_memberships_unique UNIQUE(church_id, ministry_id, member_id)
);
DO $$ BEGIN ALTER TABLE ministry_memberships ADD CONSTRAINT ministry_memberships_tenant_ministry_fk FOREIGN KEY(church_id, ministry_id) REFERENCES ministries(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ministry_memberships ADD CONSTRAINT ministry_memberships_tenant_member_fk FOREIGN KEY(church_id, member_id) REFERENCES members(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ministry_memberships_church_idx ON ministry_memberships(church_id);
CREATE INDEX IF NOT EXISTS ministry_memberships_member_idx ON ministry_memberships(member_id);

CREATE TABLE IF NOT EXISTS cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id), name text NOT NULL,
  description text, image_url text, eligibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb, active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), CONSTRAINT cells_church_name_unique UNIQUE(church_id, name)
);
CREATE INDEX IF NOT EXISTS cells_church_idx ON cells(church_id);
DO $$ BEGIN ALTER TABLE cells ADD CONSTRAINT cells_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS cell_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id), cell_id uuid NOT NULL REFERENCES cells(id),
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT cell_memberships_unique UNIQUE(church_id, cell_id, member_id)
);
DO $$ BEGIN ALTER TABLE cell_memberships ADD CONSTRAINT cell_memberships_tenant_cell_fk FOREIGN KEY(church_id, cell_id) REFERENCES cells(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE cell_memberships ADD CONSTRAINT cell_memberships_tenant_member_fk FOREIGN KEY(church_id, member_id) REFERENCES members(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS cell_memberships_church_idx ON cell_memberships(church_id);
CREATE INDEX IF NOT EXISTS cell_memberships_member_idx ON cell_memberships(member_id);

CREATE TABLE IF NOT EXISTS segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id), name text NOT NULL, description text,
  segment_type text NOT NULL CHECK (segment_type IN ('automatic','manual')), rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true, created_by text NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), CONSTRAINT segments_church_name_unique UNIQUE(church_id, name)
);
CREATE INDEX IF NOT EXISTS segments_church_idx ON segments(church_id);
DO $$ BEGIN ALTER TABLE segments ADD CONSTRAINT segments_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS segment_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id), segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT segment_memberships_unique UNIQUE(church_id, segment_id, member_id)
);
DO $$ BEGIN ALTER TABLE segment_memberships ADD CONSTRAINT segment_memberships_tenant_segment_fk FOREIGN KEY(church_id, segment_id) REFERENCES segments(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE segment_memberships ADD CONSTRAINT segment_memberships_tenant_member_fk FOREIGN KEY(church_id, member_id) REFERENCES members(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS segment_memberships_church_idx ON segment_memberships(church_id);
CREATE INDEX IF NOT EXISTS segment_memberships_member_idx ON segment_memberships(member_id);

-- Normalize the legacy ministry text before the new relational model becomes authoritative.
INSERT INTO ministries (church_id, name)
SELECT DISTINCT m.church_id, btrim(value)
FROM members m CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.ministries, ''), ',') AS value
WHERE btrim(value) <> ''
ON CONFLICT (church_id, name) DO NOTHING;
INSERT INTO ministry_memberships (church_id, ministry_id, member_id, source)
SELECT m.church_id, g.id, m.id, 'legacy'
FROM members m CROSS JOIN LATERAL regexp_split_to_table(COALESCE(m.ministries, ''), ',') AS value
JOIN ministries g ON g.church_id = m.church_id AND g.name = btrim(value)
WHERE btrim(value) <> ''
ON CONFLICT (church_id, ministry_id, member_id) DO NOTHING;

ALTER TABLE ministry_applications ADD COLUMN IF NOT EXISTS church_id uuid;
ALTER TABLE ministry_applications ADD COLUMN IF NOT EXISTS ministry_id uuid;
UPDATE ministry_applications SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
INSERT INTO ministries (church_id, name)
SELECT DISTINCT church_id, btrim(ministry) FROM ministry_applications WHERE btrim(ministry) <> ''
ON CONFLICT (church_id, name) DO NOTHING;
UPDATE ministry_applications a SET ministry_id = m.id FROM ministries m WHERE a.ministry_id IS NULL AND m.church_id = a.church_id AND m.name = a.ministry;
ALTER TABLE ministry_applications ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE ministry_applications ADD CONSTRAINT ministry_applications_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ministry_applications ADD CONSTRAINT ministry_applications_ministry_id_fk FOREIGN KEY (ministry_id) REFERENCES ministries(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ministry_applications ADD CONSTRAINT ministry_applications_tenant_ministry_fk FOREIGN KEY (church_id, ministry_id) REFERENCES ministries(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO ministry_memberships (church_id, ministry_id, member_id, source)
SELECT church_id, ministry_id, member_id, 'application' FROM ministry_applications
WHERE status = 'APPROVED' AND ministry_id IS NOT NULL
ON CONFLICT (church_id, ministry_id, member_id) DO NOTHING;

ALTER TABLE events ADD COLUMN IF NOT EXISTS church_id uuid;
UPDATE events SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE events ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE events ADD CONSTRAINT events_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE events ADD CONSTRAINT events_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_tenant_event_fk FOREIGN KEY (church_id, event_id) REFERENCES events(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_tenant_member_fk FOREIGN KEY (church_id, member_id) REFERENCES members(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS church_id uuid;
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS audience_cell_id uuid;
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS audience_segment_id uuid;
UPDATE admin_notifications SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE admin_notifications ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_audience_cell_id_fk FOREIGN KEY (audience_cell_id) REFERENCES cells(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_audience_segment_id_fk FOREIGN KEY (audience_segment_id) REFERENCES segments(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS church_id uuid;
UPDATE notifications SET church_id = '11111111-1111-4111-8111-111111111111' WHERE church_id IS NULL;
ALTER TABLE notifications ALTER COLUMN church_id SET NOT NULL;
DO $$ BEGIN ALTER TABLE notifications ADD CONSTRAINT notifications_church_id_fk FOREIGN KEY (church_id) REFERENCES churches(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE admin_notifications ADD CONSTRAINT admin_notifications_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE notification_media ADD CONSTRAINT notification_media_church_id_id_unique UNIQUE(church_id, id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE notifications ADD CONSTRAINT notifications_tenant_campaign_fk FOREIGN KEY(church_id, message_id) REFERENCES admin_notifications(church_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO segments (church_id, name, description, segment_type, rules, is_system, created_by) VALUES
('11111111-1111-4111-8111-111111111111', 'All Members', 'All active members of this church.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'New Members', 'Members who joined within the configured number of months.', 'automatic', '{"conditions":[{"field":"joined_within_months","operator":"within","value":5}]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Choir', 'Choir team members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Ushering Team', 'Ushering and front-of-house team members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Media Team', 'Media and livestream team members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Protocol', 'Protocol and event coordination team members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Security', 'Security team members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Pastors', 'Pastoral leadership members.', 'manual', '{"conditions":[]}', true, 'system'),
('11111111-1111-4111-8111-111111111111', 'Youth Fellowship', 'Youth fellowship members.', 'manual', '{"conditions":[]}', true, 'system')
ON CONFLICT (church_id, name) DO NOTHING;