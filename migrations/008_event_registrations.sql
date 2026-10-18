CREATE TABLE opencircle_event_registrations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES opencircle_events(id),
  member_id bigint NOT NULL CHECK (member_id > 0),
  record jsonb NOT NULL,
  registered_at bigint NOT NULL,
  UNIQUE (event_id, member_id)
);
CREATE INDEX opencircle_event_registrations_event ON opencircle_event_registrations (event_id, registered_at, id);
