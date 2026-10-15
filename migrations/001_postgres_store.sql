CREATE TABLE opencircle_members (
  login text CONSTRAINT opencircle_members_pkey PRIMARY KEY,
  record jsonb NOT NULL,
  whatsapp text GENERATED ALWAYS AS (record ->> 'whatsapp') STORED NOT NULL,
  nickname_lower text GENERATED ALWAYS AS (lower(record ->> 'nickname')) STORED NOT NULL,
  CONSTRAINT opencircle_members_whatsapp_key UNIQUE (whatsapp),
  CONSTRAINT opencircle_members_nickname_key UNIQUE (nickname_lower),
  CONSTRAINT opencircle_members_login_check CHECK (
    login = lower(login) AND record ->> 'login' IS NOT NULL AND record ->> 'login' = login
  )
);

CREATE TABLE opencircle_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE opencircle_locks (
  name text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE INDEX opencircle_locks_expiry ON opencircle_locks (expires_at);

CREATE TABLE opencircle_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX opencircle_rate_limits_expiry ON opencircle_rate_limits (expires_at);
