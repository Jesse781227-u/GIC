DO $$
DECLARE
  age_group_pair record;
BEGIN
  FOR age_group_pair IN
    SELECT plural.id AS plural_id,
      plural.church_id,
      plural.name AS plural_name,
      names.singular_name,
      singular.id AS singular_id
    FROM age_group_definitions AS plural
    CROSS JOIN (VALUES
      ('Teenagers', 'Teenager'),
      ('Young Adults', 'Young Adult'),
      ('Adults', 'Adult'),
      ('Seniors', 'Senior')
    ) AS names(plural_name, singular_name)
    LEFT JOIN age_group_definitions AS singular
      ON singular.church_id = plural.church_id
      AND singular.name = names.singular_name
    WHERE plural.name = names.plural_name
  LOOP
    IF age_group_pair.singular_id IS NULL THEN
      UPDATE age_group_definitions
      SET name = age_group_pair.singular_name,
          min_age = CASE age_group_pair.singular_name
            WHEN 'Teenager' THEN 13
            WHEN 'Young Adult' THEN 18
            WHEN 'Adult' THEN 26
            WHEN 'Senior' THEN 60
          END,
          max_age = CASE age_group_pair.singular_name
            WHEN 'Teenager' THEN 17
            WHEN 'Young Adult' THEN 25
            WHEN 'Adult' THEN 59
            ELSE NULL
          END,
          updated_at = now()
      WHERE id = age_group_pair.plural_id
        AND church_id = age_group_pair.church_id;
    ELSE
      UPDATE members
      SET age_group_id = age_group_pair.singular_id
      WHERE age_group_id = age_group_pair.plural_id
        AND church_id = age_group_pair.church_id;
      DELETE FROM age_group_definitions
      WHERE id = age_group_pair.plural_id
        AND church_id = age_group_pair.church_id;
    END IF;
  END LOOP;
END $$;
