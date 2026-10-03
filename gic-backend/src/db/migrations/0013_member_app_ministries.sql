INSERT INTO ministries (church_id, name, description)
SELECT churches.id, catalog.name, catalog.description
FROM churches
CROSS JOIN (VALUES
  ('Ushering Ministry', 'Serving with excellence and a heart.'),
  ('Media Ministry', 'Telling the story of God''s work.'),
  ('Choir', 'Leading the church in worship through music.'),
  ('Children''s Ministry', 'Helping children discover faith and grow with joy.'),
  ('Prayer Ministry', 'Standing together in prayer for the church and community.'),
  ('Acts Of Mercy', 'Serving people in need through practical charity and compassion.'),
  ('Evangelism', 'Sharing the gospel and helping people encounter the love of Christ.')
) AS catalog(name, description)
ON CONFLICT (church_id, name) DO NOTHING;

INSERT INTO ministry_memberships (church_id, ministry_id, member_id, source)
SELECT segment_memberships.church_id, ministries.id, segment_memberships.member_id, 'legacy'
FROM segment_memberships
JOIN segments ON segments.id = segment_memberships.segment_id
JOIN ministries ON ministries.church_id = segments.church_id
  AND ministries.name = CASE segments.name
    WHEN 'Ushering Team' THEN 'Ushering Ministry'
    WHEN 'Media Team' THEN 'Media Ministry'
    ELSE segments.name
  END
WHERE segments.is_system = true
  AND segments.name IN ('Choir', 'Ushering Team', 'Media Team')
ON CONFLICT (church_id, ministry_id, member_id) DO NOTHING;

UPDATE segments
SET active = false, updated_at = now()
WHERE is_system = true
  AND name IN ('Choir', 'Ushering Team', 'Media Team');