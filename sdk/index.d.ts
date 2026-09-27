/**
 * TypeScript definitions for @nodus/sdk
 */

export interface NodusClientConfig {
  gatewayUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  keyIdentity?: DeviceKeyIdentity;
}

export interface DeviceKeyIdentity {
  version?: number;
  algorithm?: "ECDH-P256/AES-256-GCM";
  primaryPublicKey: JsonWebKey;
  primaryPrivateKey: JsonWebKey;
  recoveryPublicKey?: JsonWebKey | null;
  recoveryPrivateKey?: JsonWebKey | null;
}

export interface RecoveryKit {
  version: number;
  algorithm: "PBKDF2-SHA256/AES-256-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface PutOptions {
  name: string;
  type?: string;
  description?: string;
  tags?: string[];
  encrypt?: boolean;
  resumable?: boolean;
  resumableThresholdBytes?: number;
  chunkSize?: number;
  /** Publish encrypted segments directly to the configured Walrus publisher. */
  directPublisher?: boolean;
  /** Plaintext bytes per Walrus blob; must be divisible by chunkSize. */
  segmentSize?: number;
  /** Walrus storage duration requested for direct publisher uploads. */
  epochs?: number;
  /** Optional Sui address to receive the created Walrus Blob object. */
  sendObjectTo?: string;
  uploadId?: string;
  key?: string;
  iv?: string;
  onProgress?: (progress: ResumableUploadProgress) => void;
}

export interface ResumableUploadProgress {
  uploadId: string;
  partNumber: number;
  partCount: number;
  uploadedBytes: number;
  totalBytes: number;
}

export interface DirectUploadProgress {
  uploadId: string;
  segmentIndex: number;
  segmentCount: number;
  uploadedBytes: number;
  totalBytes: number;
}

export interface DirectUpload {
  uploadId: string;
  status: "uploading" | "completed";
  originalName: string;
  originalSize: number;
  segmentSize: number;
  segmentCount: number;
  completedSegments: number[];
  missingSegments: number[];
  segments: any[];
  expiresAt: string;
  completedAsset?: any;
}

export interface ResumableUpload {
  uploadId: string;
  status: "uploading" | "assembling" | "completed";
  originalName: string;
  originalSize: number;
  encryptedSize: number;
  partSize: number;
  partCount: number;
  receivedParts: number[];
  missingParts: number[];
  receivedBytes: number;
  expiresAt: string;
  completedAsset?: any;
}

export interface PutResult {
  success: boolean;
  id: string;
  blob_id: string;
  name: string;
  size: number;
  encrypted: boolean;
  key?: string;
  iv?: string;
  record?: any;
}

export interface GetOptions {
  key?: string;
  iv?: string;
}

export interface GetResult {
  data: Uint8Array;
  name: string;
  type: string;
  size: number;
  encrypted: boolean;
}

export interface SearchOptions {
  type?: string;
  tag?: string;
  limit?: number;
}

export interface SolanaChallengeResult {
  success: boolean;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface SolanaAuthResult {
  success: boolean;
  address: string;
  provider: string;
  scheme: string;
  verifiedAt: string;
  organizations: any[];
}

export interface Organization {
  orgId: string;
  name: string;
  owner: string;
  storageCapBytes: number;
  storageUsedBytes: number;
  pda: string;
  bump: number;
  members?: any[];
  userRole?: string;
}

export declare class NodusSearchIndex {
  documents: Map<string, any>;
  indexDocument(doc: any): void;
  indexAll(docs: any[]): void;
  search(query?: string, options?: SearchOptions): any[];
}

export declare class NodusClient {
  gatewayUrl: string;
  apiKey: string | null;
  userAddress?: string;
  searchIndex: NodusSearchIndex;
  /** Ephemeral device-local decryption keys, never sent to the gateway. */
  keyCache: Map<string, string>;
  keyIdentity: DeviceKeyIdentity | null;

  constructor(config?: NodusClientConfig);
  getStatus(): Promise<any>;
  put(data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions): Promise<PutResult>;
  putResumable(data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions): Promise<PutResult & { uploadId: string; upload: ResumableUpload }>;
  resumeResumableUpload(uploadId: string, data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions & { key: string; iv: string }): Promise<PutResult & { uploadId: string; upload: ResumableUpload }>;
  putDirectPublisher(data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions): Promise<PutResult & { uploadId: string; upload: DirectUpload; manifest: any }>;
  resumeDirectPublisherUpload(uploadId: string, data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions & { key: string; iv: string }): Promise<PutResult & { uploadId: string; upload: DirectUpload; manifest: any }>;
  createResumableUpload(payload: Record<string, any>): Promise<ResumableUpload>;
  getResumableUpload(uploadId: string): Promise<ResumableUpload>;
  uploadResumablePart(uploadId: string, partNumber: number, data: Uint8Array, checksum: string): Promise<any>;
  completeResumableUpload(uploadId: string): Promise<any>;
  abortResumableUpload(uploadId: string): Promise<{ success: boolean; aborted: boolean }>;
  createDirectUpload(payload: Record<string, any>): Promise<DirectUpload>;
  getDirectUpload(uploadId: string): Promise<DirectUpload>;
  authorizeDirectSegment(uploadId: string, segmentIndex: number, sendObjectTo?: string): Promise<any>;
  completeDirectSegment(uploadId: string, segmentIndex: number, payload: any): Promise<DirectUpload>;
  finalizeDirectUpload(uploadId: string): Promise<{ upload: DirectUpload; asset: any; manifest: any }>;
  getDirectManifest(assetId: string): Promise<any>;
  stream(fileId: string, options?: GetOptions): Promise<ReadableStream<Uint8Array>>;
  get(fileId: string, options?: GetOptions): Promise<GetResult>;
  list(filters?: { tag?: string }): Promise<any[]>;
  search(query: string, options?: SearchOptions): Promise<any[]>;
  delete(fileId: string): Promise<{ success: boolean; deleted: boolean }>;

  getSolanaChallenge(address: string, domain?: string): Promise<SolanaChallengeResult>;
  verifySolanaAuth(address: string, signature: string, message?: string): Promise<SolanaAuthResult>;
  bootstrapKeyIdentity(options?: { passphrase?: string }): Promise<{ identity: DeviceKeyIdentity; recoveryKit: RecoveryKit | null }>;
  registerKeyIdentity(identity: DeviceKeyIdentity): Promise<any>;
  getKeyIdentity(address: string): Promise<any>;
  getOrganizationKeyRecipients(orgId: string): Promise<any[]>;
  protectAssetKey(assetId: string, options?: { recipientAddresses?: string[]; organizationId?: string | null }): Promise<any>;
  recoverAssetKey(assetId: string, options?: { recoveryKit?: RecoveryKit; passphrase?: string; recoveryPrivateKey?: JsonWebKey }): Promise<string>;
  listPendingKeyRotations(): Promise<Array<{ id: string; assetId: string; revokedAddress: string; createdAt: string }>>;
  rotateAssetAfterRevocation(options: { rotationId: string; assetId: string; name?: string; type?: string; description?: string; tags?: string[] }): Promise<any>;
  listOrganizations(address?: string): Promise<Organization[]>;
  createOrganization(params: { orgId: string; name?: string; ownerAddress: string; storageCapBytes?: number }): Promise<Organization>;
  getOrganization(orgId: string): Promise<Organization>;
  addOrganizationMember(orgId: string, params: { memberAddress: string; role?: string; callerAddress: string }): Promise<any>;
  removeOrganizationMember(orgId: string, memberAddress: string, callerAddress?: string): Promise<boolean>;
  deriveOrgPDA(orgId: string): { pda: any; bump: number; pdaString: string };
  deriveMemberPDA(orgPDA: any, memberAddress: string): { pda: any; bump: number; pdaString: string };
}

export declare function deriveOrgPDA(orgId: string, programIdStr?: string): { pda: any; bump: number; pdaString: string };
export declare function deriveMemberPDA(orgPDA: any, memberPubkey: any, programIdStr?: string): { pda: any; bump: number; pdaString: string };
export declare function createNodusClient(config?: NodusClientConfig): NodusClient;

export default NodusClient;
