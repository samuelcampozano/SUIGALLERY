CREATE TABLE IF NOT EXISTS organization_api_keys (
  id UUID PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, name TEXT NOT NULL, key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, scopes JSONB NOT NULL, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), rotated_from UUID REFERENCES organization_api_keys(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS organization_api_keys_active_idx ON organization_api_keys (organization_id, revoked_at, expires_at);
CREATE TABLE IF NOT EXISTS api_key_audit_events (
  id UUID PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES organization_api_keys(id) ON DELETE SET NULL, actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
