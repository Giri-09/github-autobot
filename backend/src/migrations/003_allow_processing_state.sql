ALTER TABLE events DROP CONSTRAINT events_status_check;
ALTER TABLE events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'failed'));
