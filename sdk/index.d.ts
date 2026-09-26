/**
 * TypeScript definitions for @nodus/sdk
 */

export interface NodusClientConfig {
  gatewayUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface PutOptions {
  name: string;
  type?: string;
  description?: string;
  tags?: string[];
  encrypt?: boolean;
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

  constructor(config?: NodusClientConfig);
  getStatus(): Promise<any>;
  put(data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions): Promise<PutResult>;
  get(fileId: string, options?: GetOptions): Promise<GetResult>;
  list(filters?: { tag?: string }): Promise<any[]>;
  search(query: string, options?: SearchOptions): Promise<any[]>;
  delete(fileId: string): Promise<{ success: boolean; deleted: boolean }>;

  getSolanaChallenge(address: string, domain?: string): Promise<SolanaChallengeResult>;
  verifySolanaAuth(address: string, signature: string, message?: string): Promise<SolanaAuthResult>;
  listOrganizations(address?: string): Promise<Organization[]>;
  createOrganization(params: { orgId: string; name?: string; ownerAddress: string; storageCapBytes?: number }): Promise<Organization>;
  getOrganization(orgId: string): Promise<Organization>;
  addOrganizationMember(orgId: string, params: { memberAddress: string; role?: string; callerAddress: string }): Promise<any>;
  deriveOrgPDA(orgId: string): { pda: any; bump: number; pdaString: string };
  deriveMemberPDA(orgPDA: any, memberAddress: string): { pda: any; bump: number; pdaString: string };
}

export declare function deriveOrgPDA(orgId: string, programIdStr?: string): { pda: any; bump: number; pdaString: string };
export declare function deriveMemberPDA(orgPDA: any, memberPubkey: any, programIdStr?: string): { pda: any; bump: number; pdaString: string };
export declare function createNodusClient(config?: NodusClientConfig): NodusClient;

export default NodusClient;
