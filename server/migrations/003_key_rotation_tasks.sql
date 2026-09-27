CREATE TABLE IF NOT EXISTS key_rotation_tasks (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  revoked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
  replacement_asset_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id, asset_id, revoked_user_id)
);

CREATE INDEX IF NOT EXISTS key_rotation_tasks_pending_idx
  ON key_rotation_tasks (organization_id, status, created_at);
