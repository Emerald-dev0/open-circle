CREATE TABLE opencircle_analytics_meta (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  started_at bigint NOT NULL
);

CREATE TABLE opencircle_analytics_visitors (
  day date NOT NULL,
  actor text NOT NULL CHECK (actor ~ '^[0-9a-f]{64}$'),
  views bigint NOT NULL CHECK (views > 0),
  PRIMARY KEY (day, actor)
);

CREATE TABLE opencircle_analytics_counts (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('page', 'source')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 253),
  views bigint NOT NULL CHECK (views > 0),
  PRIMARY KEY (day, kind, name)
);
