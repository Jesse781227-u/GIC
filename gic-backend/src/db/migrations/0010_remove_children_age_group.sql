UPDATE members AS member
SET age_group_id = NULL
FROM age_group_definitions AS age_group
WHERE member.church_id = age_group.church_id
  AND member.age_group_id = age_group.id
  AND age_group.name = 'Children';

DELETE FROM age_group_definitions
WHERE name = 'Children';