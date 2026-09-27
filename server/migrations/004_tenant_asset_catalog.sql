-- Persistent, tenant-scoped control-plane catalog. Ciphertext remains in Walrus;
-- this database stores only operational metadata and never encryption keys.
CREATE TABLE IF NOT EXISTS asset_folders (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, parent_id) REFERENCES asset_folders(organization_id, id) ON DELETE RESTRICT,
  UNIQUE NULLS NOT DISTINCT (organization_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS catalog_assets (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  folder_id UUID,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('walrus', 'direct')),
  status TEXT NOT NULL CHECK (status IN ('active', 'deleted')) DEFAULT 'active',
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, asset_id),
  FOREIGN KEY (organization_id, folder_id) REFERENCES asset_folders(organization_id, id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS catalog_assets_list_idx ON catalog_assets (organization_id, status, created_at DESC, asset_id DESC);
CREATE INDEX IF NOT EXISTS catalog_assets_folder_idx ON catalog_assets (organization_id, folder_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS asset_versions (
  organization_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  change_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, asset_id, version),
  FOREIGN KEY (organization_id, asset_id) REFERENCES catalog_assets(organization_id, asset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_audit_events (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_audit_events_asset_idx ON asset_audit_events (organization_id, asset_id, created_at DESC);
