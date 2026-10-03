UPDATE age_group_definitions
SET max_age = 25, updated_at = now()
WHERE name = 'Young Adult';

UPDATE age_group_definitions
SET min_age = 26, updated_at = now()
WHERE name = 'Adult';
