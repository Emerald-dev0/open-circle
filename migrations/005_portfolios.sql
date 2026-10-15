CREATE TABLE opencircle_portfolios (
  owner_id bigint PRIMARY KEY CHECK (owner_id > 0),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$'),
  github_login text NOT NULL,
  draft jsonb NOT NULL,
  published jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  published_at bigint,
  updated_at bigint NOT NULL,
  CHECK (draft->>'slug' = slug),
  CHECK (published IS NULL OR published->>'slug' = slug),
  CHECK ((published IS NULL) = (published_at IS NULL))
);
