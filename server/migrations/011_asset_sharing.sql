-- Tenant-scoped access grants are control-plane metadata only. Asset data keys
-- remain exclusively in client-generated key envelopes.
CREATE TABLE IF NOT EXISTS asset_access_grants (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'contributor', 'admin')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, asset_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS asset_access_grants_recipient_idx
  ON asset_access_grants (organization_id, recipient_user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS folder_access_grants (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'contributor', 'admin')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, folder_id, recipient_user_id),
  FOREIGN KEY (organization_id, folder_id) REFERENCES asset_folders(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS folder_access_grants_recipient_idx
  ON folder_access_grants (organization_id, recipient_user_id, expires_at)
  WHERE revoked_at IS NULL;
