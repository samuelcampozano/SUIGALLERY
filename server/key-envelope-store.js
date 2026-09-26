import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_ENVELOPES_PER_ASSET = 500;

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function isP256PublicJwk(value) {
  return value && typeof value === "object" && value.kty === "EC" && value.crv === "P-256"
    && typeof value.x === "string" && typeof value.y === "string"
    && value.x.length >= 40 && value.y.length >= 40 && !Object.prototype.hasOwnProperty.call(value, "d");
}

/**
 * Durable metadata store for recipient-encrypted data-key envelopes.
 * It intentionally accepts public keys and ciphertext envelopes only; private
 * keys and plaintext data keys are structurally rejected.
 */
export class KeyEnvelopeStore {
  constructor({ filePath } = {}) {
    if (!filePath) throw new Error("filePath is required");
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.filePath)) writeJsonAtomic(this.filePath, { version: 1, identities: {}, assets: {} });
  }

  registerIdentity(address, payload = {}) {
    const { publicKey, recoveryPublicKey = null } = payload;
    if (Object.prototype.hasOwnProperty.call(payload, "privateKey") || Object.prototype.hasOwnProperty.call(payload, "recoveryPrivateKey")) {
      throw new Error("Private keys must not be sent to the server");
    }
    if (!isP256PublicJwk(publicKey)) throw new Error("A P-256 public encryption key is required");
    if (recoveryPublicKey !== null && !isP256PublicJwk(recoveryPublicKey)) throw new Error("Recovery key must be a P-256 public encryption key");
    const state = this.read();
    state.identities[address] = {
      address,
      publicKey,
      recoveryPublicKey,
      updatedAt: new Date().toISOString()
    };
    this.write(state);
    return this.publicIdentity(state.identities[address]);
  }

  getIdentity(address) {
    const identity = this.read().identities[address];
    return identity ? this.publicIdentity(identity) : null;
  }

  putEnvelopes(assetId, ownerAddress, envelopes) {
    if (!Array.isArray(envelopes) || envelopes.length < 1 || envelopes.length > MAX_ENVELOPES_PER_ASSET) {
      throw new Error(`envelopes must contain between 1 and ${MAX_ENVELOPES_PER_ASSET} entries`);
    }
    const state = this.read();
    const asset = state.assets[assetId] || {
      assetId,
      ownerAddress,
      createdAt: new Date().toISOString(),
      envelopes: []
    };
    if (asset.ownerAddress !== ownerAddress) throw new Error("Only the asset envelope owner can change key recipients");

    const normalized = envelopes.map((entry) => this.normalizeEnvelope(entry));
    for (const envelope of normalized) {
      const position = asset.envelopes.findIndex((existing) => this.envelopeId(existing) === this.envelopeId(envelope));
      if (position >= 0) asset.envelopes[position] = envelope;
      else asset.envelopes.push(envelope);
    }
    if (asset.envelopes.length > MAX_ENVELOPES_PER_ASSET) throw new Error(`An asset may have at most ${MAX_ENVELOPES_PER_ASSET} key envelopes`);
    asset.updatedAt = new Date().toISOString();
    state.assets[assetId] = asset;
    this.write(state);
    return this.publicAsset(asset);
  }

  envelopesForRecipient(assetId, recipientAddress) {
    const asset = this.read().assets[assetId];
    if (!asset) return null;
    return {
      assetId: asset.assetId,
      ownerAddress: asset.ownerAddress,
      updatedAt: asset.updatedAt,
      envelopes: asset.envelopes.filter((entry) => entry.recipientAddress === recipientAddress)
    };
  }

  deleteAsset(assetId) {
    const state = this.read();
    if (!state.assets[assetId]) return false;
    delete state.assets[assetId];
    this.write(state);
    return true;
  }

  revokeOrganizationRecipient(organizationId, recipientAddress) {
    const state = this.read();
    let removed = 0;
    for (const asset of Object.values(state.assets)) {
      const before = asset.envelopes.length;
      asset.envelopes = asset.envelopes.filter((entry) => !(entry.organizationId === organizationId && entry.recipientAddress === recipientAddress));
      if (asset.envelopes.length !== before) {
        removed += before - asset.envelopes.length;
        asset.updatedAt = new Date().toISOString();
      }
    }
    if (removed) this.write(state);
    return removed;
  }

  normalizeEnvelope(entry) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid key envelope");
    if (Object.prototype.hasOwnProperty.call(entry, "key") || Object.prototype.hasOwnProperty.call(entry, "privateKey")) {
      throw new Error("Raw or private keys must not be sent to the server");
    }
    if (!/^(user|recovery)$/.test(entry.recipientType || "")) throw new Error("recipientType must be 'user' or 'recovery'");
    if (typeof entry.recipientAddress !== "string" || entry.recipientAddress.length < 32 || entry.recipientAddress.length > 64) throw new Error("Invalid envelope recipient");
    if (entry.organizationId !== null && entry.organizationId !== undefined && (typeof entry.organizationId !== "string" || entry.organizationId.length > 64)) {
      throw new Error("Invalid envelope organization ID");
    }
    if (entry.algorithm !== "ECDH-P256/AES-256-GCM") throw new Error("Unsupported key-envelope algorithm");
    if (!isP256PublicJwk(entry.ephemeralPublicKey)) throw new Error("Invalid ephemeral public key");
    if (typeof entry.iv !== "string" || !/^[a-f0-9]{24}$/i.test(entry.iv)) throw new Error("Invalid envelope IV");
    if (typeof entry.ciphertext !== "string" || !/^[a-f0-9]{64,512}$/i.test(entry.ciphertext)) throw new Error("Invalid encrypted key envelope");
    return {
      recipientAddress: entry.recipientAddress,
      recipientType: entry.recipientType,
      organizationId: entry.organizationId || null,
      algorithm: entry.algorithm,
      ephemeralPublicKey: entry.ephemeralPublicKey,
      iv: entry.iv.toLowerCase(),
      ciphertext: entry.ciphertext.toLowerCase(),
      createdAt: new Date().toISOString()
    };
  }

  envelopeId(entry) {
    return `${entry.recipientAddress}:${entry.recipientType}:${entry.organizationId || "personal"}`;
  }

  publicAsset(asset) {
    return { assetId: asset.assetId, ownerAddress: asset.ownerAddress, updatedAt: asset.updatedAt, envelopeCount: asset.envelopes.length };
  }

  publicIdentity(identity) {
    return { address: identity.address, publicKey: identity.publicKey, recoveryPublicKey: identity.recoveryPublicKey, updatedAt: identity.updatedAt };
  }

  read() {
    try {
      const state = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { version: 1, identities: state.identities || {}, assets: state.assets || {} };
    } catch {
      return { version: 1, identities: {}, assets: {} };
    }
  }

  write(state) {
    writeJsonAtomic(this.filePath, state);
  }
}
