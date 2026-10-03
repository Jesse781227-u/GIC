INSERT INTO ministries (church_id, name, description)
SELECT churches.id, catalog.name, catalog.description
FROM churches
CROSS JOIN (VALUES
  ('Protocol', 'Supporting church services and events through protocol and coordination.'),
  ('Security', 'Supporting a safe and welcoming environment across church activities.'),
  ('Pastors', 'Pastoral leadership and spiritual care for the church.')
) AS catalog(name, description)
ON CONFLICT (church_id, name) DO NOTHING;

INSERT INTO ministry_memberships (church_id, ministry_id, member_id, source)
SELECT segment_memberships.church_id, ministries.id, segment_memberships.member_id, 'legacy'
FROM segment_memberships
JOIN segments ON segments.id = segment_memberships.segment_id
JOIN ministries ON ministries.church_id = segments.church_id AND ministries.name = segments.name
WHERE segments.is_system = true
  AND segments.name IN ('Protocol', 'Security', 'Pastors')
ON CONFLICT (church_id, ministry_id, member_id) DO NOTHING;

UPDATE ministry_applications
SET ministry_id = ministries.id, organization_kind = 'ministry', updated_at = now()
FROM ministries
WHERE ministry_applications.ministry_id IS NULL
  AND ministry_applications.cell_id IS NULL
  AND ministry_applications.church_id = ministries.church_id
  AND ministry_applications.ministry = ministries.name
  AND ministries.name IN ('Protocol', 'Security', 'Pastors');

UPDATE segments
SET active = false, updated_at = now()
WHERE is_system = true
  AND name IN ('Protocol', 'Security', 'Pastors');

UPDATE ministries SET organization_type = 'unit' WHERE organization_type <> 'unit';
UPDATE cells SET organization_type = 'fellowship' WHERE organization_type <> 'fellowship';
ALTER TABLE ministries ALTER COLUMN organization_type SET DEFAULT 'unit';
ALTER TABLE cells ALTER COLUMN organization_type SET DEFAULT 'fellowship';
