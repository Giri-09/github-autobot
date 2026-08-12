CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  github_user_id BIGINT NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id BIGINT NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  github_access_token TEXT NOT NULL,
  webhook_id BIGINT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner, name)
);

CREATE TABLE rules (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  match_field TEXT NOT NULL CHECK (match_field IN ('title', 'body')),
  match_value TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('add_label', 'comment')),
  action_value TEXT NOT NULL,
  notify_slack BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_delivery_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  action TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE action_logs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES rules(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('github_write', 'slack_notify')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_repositories_user_id ON repositories(user_id);
CREATE INDEX idx_rules_repository_id ON rules(repository_id);
CREATE INDEX idx_events_repository_id ON events(repository_id);
CREATE INDEX idx_action_logs_event_id ON action_logs(event_id);
