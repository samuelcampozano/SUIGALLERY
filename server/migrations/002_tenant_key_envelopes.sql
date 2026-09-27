CREATE TABLE IF NOT EXISTS user_key_identities (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key JSONB NOT NULL,
  recovery_public_key JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS key_envelope_assets (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, asset_id)
);

CREATE TABLE IF NOT EXISTS asset_key_envelopes (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'recovery')),
  algorithm TEXT NOT NULL CHECK (algorithm = 'ECDH-P256/AES-256-GCM'),
  ephemeral_public_key JSONB NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_key_envelopes_asset_fk
    FOREIGN KEY (organization_id, asset_id)
    REFERENCES key_envelope_assets(organization_id, asset_id)
    ON DELETE CASCADE,
  CONSTRAINT asset_key_envelopes_recipient_unique
    UNIQUE (organization_id, asset_id, recipient_user_id, recipient_type)
);

CREATE INDEX IF NOT EXISTS asset_key_envelopes_recipient_idx
  ON asset_key_envelopes (organization_id, asset_id, recipient_user_id);
