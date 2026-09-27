CREATE TABLE IF NOT EXISTS public_idempotency_records (
  id UUID PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL, operation TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('in_progress','completed')) DEFAULT 'in_progress',
  response_status INTEGER, response_body JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS public_idempotency_unique_idx ON public_idempotency_records (organization_id, actor_key, operation, idempotency_key);
CREATE INDEX IF NOT EXISTS public_idempotency_expiry_idx ON public_idempotency_records (created_at);
