CREATE TABLE opencircle_profile_votes (
  target text NOT NULL CHECK (target ~ '^tool:.+$'),
  actor text NOT NULL CHECK (actor ~ '^[0-9a-f]{64}$'),
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (target, actor)
);

CREATE TABLE opencircle_github_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  profile jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX opencircle_github_sessions_expiry ON opencircle_github_sessions (expires_at);
