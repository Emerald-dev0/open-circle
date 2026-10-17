CREATE TABLE opencircle_forum_threads (
  id uuid PRIMARY KEY,
  document jsonb NOT NULL CHECK (document->>'id' = id::text)
);
CREATE INDEX opencircle_forum_kind ON opencircle_forum_threads ((document->>'kind'), ((document->>'createdAt')::bigint) DESC);
CREATE INDEX opencircle_forum_review ON opencircle_forum_threads ((document->>'review'));
CREATE TABLE opencircle_forum_comments (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES opencircle_forum_threads(id),
  document jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX opencircle_forum_comments_thread ON opencircle_forum_comments (thread_id, created_at, id);
CREATE TABLE opencircle_forum_votes (
  thread_id uuid NOT NULL REFERENCES opencircle_forum_threads(id),
  voter_id bigint NOT NULL CHECK (voter_id > 0),
  option_id text NOT NULL,
  PRIMARY KEY (thread_id, voter_id)
);
CREATE TABLE opencircle_forum_reports (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES opencircle_forum_threads(id),
  document jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX opencircle_forum_reports_thread ON opencircle_forum_reports (thread_id, created_at, id);
CREATE TABLE opencircle_forum_audit (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES opencircle_forum_threads(id),
  document jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX opencircle_forum_audit_thread ON opencircle_forum_audit (thread_id, created_at, id);
CREATE TABLE opencircle_forum_requests (
  thread_id uuid NOT NULL REFERENCES opencircle_forum_threads(id),
  request_key text NOT NULL,
  fingerprint text NOT NULL,
  PRIMARY KEY (thread_id, request_key)
);
