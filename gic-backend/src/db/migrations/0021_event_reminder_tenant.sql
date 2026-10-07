ALTER TABLE event_reminders
  ADD COLUMN IF NOT EXISTS church_id uuid REFERENCES churches(id);

UPDATE event_reminders AS reminder
SET church_id = event.church_id
FROM events AS event
WHERE reminder.event_id = event.id
  AND reminder.church_id IS NULL;

ALTER TABLE event_reminders
  ALTER COLUMN church_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS event_reminders_church_event_idx
  ON event_reminders(church_id, event_id);