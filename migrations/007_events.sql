CREATE TABLE opencircle_events (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  record jsonb NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  published boolean NOT NULL DEFAULT false,
  updated_at bigint NOT NULL
);
CREATE INDEX opencircle_events_published ON opencircle_events (published, updated_at DESC);
CREATE UNIQUE INDEX opencircle_events_bot_session ON opencircle_events ((record -> 'content' ->> 'botSessionId')) WHERE record -> 'content' ->> 'botSessionId' <> '';
CREATE TABLE opencircle_event_uploads (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES opencircle_events(id),
  record jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX opencircle_event_uploads_event ON opencircle_event_uploads (event_id, created_at);
