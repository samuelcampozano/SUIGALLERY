-- Canonical control-plane payloads for direct publisher uploads. The JSON
-- contains public encryption metadata, receipts, and blob references only;
-- data keys and ciphertext are never stored here.
CREATE TABLE IF NOT EXISTS upload_session_payloads (
  upload_id UUID PRIMARY KEY REFERENCES upload_sessions(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_session_payloads_org_idx ON upload_session_payloads (organization_id, updated_at DESC);

-- A tombstone makes publisher-orphan cleanup observable and retryable rather
-- than relying on a process-local best-effort sweep.
CREATE TABLE IF NOT EXISTS orphaned_publisher_blobs (
  blob_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleaned_at TIMESTAMPTZ
);
