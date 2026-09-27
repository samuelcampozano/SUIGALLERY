CREATE TABLE IF NOT EXISTS tenant_storage_usage (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes BIGINT NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS managed_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_asset_id TEXT,
  upload_kind TEXT NOT NULL CHECK (upload_kind IN ('resumable', 'direct', 'single')),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'active', 'aborted', 'expired', 'failed')),
  original_name TEXT NOT NULL,
  original_size BIGINT NOT NULL CHECK (original_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS managed_assets_tenant_idx ON managed_assets (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES managed_assets(id) ON DELETE CASCADE,
  upload_kind TEXT NOT NULL CHECK (upload_kind IN ('resumable', 'direct', 'single')),
  reserved_bytes BIGINT NOT NULL CHECK (reserved_bytes > 0),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'assembling', 'completed', 'aborted', 'expired', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_asset_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS upload_sessions_tenant_status_idx ON upload_sessions (organization_id, status, expires_at);

CREATE TABLE IF NOT EXISTS quota_reservations (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL UNIQUE REFERENCES upload_sessions(id) ON DELETE CASCADE,
  bytes BIGINT NOT NULL CHECK (bytes > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'committed', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS upload_audit_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  upload_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
  asset_id TEXT,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_audit_events_tenant_idx ON upload_audit_events (organization_id, created_at DESC);
