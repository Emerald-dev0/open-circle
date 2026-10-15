CREATE TABLE opencircle_tools (
  id text PRIMARY KEY,
  url text NOT NULL UNIQUE,
  record jsonb NOT NULL,
  CONSTRAINT opencircle_tools_record_check CHECK (
    record ->> 'id' IS NOT NULL AND record ->> 'id' = id
    AND record ->> 'url' IS NOT NULL AND record ->> 'url' = url
  )
);

CREATE TABLE opencircle_votes (
  target text NOT NULL,
  actor text NOT NULL,
  PRIMARY KEY (target, actor),
  CONSTRAINT opencircle_votes_target_check CHECK (target ~ '^(repo|tool):.+$'),
  CONSTRAINT opencircle_votes_actor_check CHECK (actor ~ '^[0-9a-f]{64}$')
);

CREATE INDEX opencircle_votes_actor ON opencircle_votes (actor);
