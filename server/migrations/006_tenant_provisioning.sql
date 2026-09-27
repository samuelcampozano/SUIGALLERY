CREATE TABLE IF NOT EXISTS tenant_provisioning_operations (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL UNIQUE,
  owner_address TEXT NOT NULL,
  requested_name TEXT NOT NULL,
  requested_quota_bytes BIGINT NOT NULL CHECK (requested_quota_bytes >= 0),
  storage_context JSONB,
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'active', 'suspended', 'failed', 'closed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tenant_provisioning_operations_status_idx
  ON tenant_provisioning_operations (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS tenant_provisioning_events (
  id UUID PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES tenant_provisioning_operations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
