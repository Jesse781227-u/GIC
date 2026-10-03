INSERT INTO ministries (church_id, name, description)
SELECT id, 'IT Ministry', 'Supporting the church through technology and digital systems.'
FROM churches
ON CONFLICT (church_id, name) DO NOTHING;

INSERT INTO cells (church_id, name, description)
SELECT id, 'Youth Fellowship', 'Youth fellowship group.'
FROM churches
ON CONFLICT (church_id, name) DO NOTHING;

INSERT INTO cell_memberships (church_id, cell_id, member_id)
SELECT segment_memberships.church_id, cells.id, segment_memberships.member_id
FROM segment_memberships
JOIN segments ON segments.id = segment_memberships.segment_id
JOIN cells ON cells.church_id = segments.church_id AND cells.name = 'Youth Fellowship'
WHERE segments.is_system = true AND segments.name = 'Youth Fellowship'
ON CONFLICT (church_id, cell_id, member_id) DO NOTHING;

UPDATE segments
SET active = false, updated_at = now()
WHERE is_system = true AND name = 'Youth Fellowship';