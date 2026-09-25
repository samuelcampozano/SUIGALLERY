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

export declare class NodusSearchIndex {
  documents: Map<string, any>;
  indexDocument(doc: any): void;
  indexAll(docs: any[]): void;
  search(query?: string, options?: SearchOptions): any[];
}

export declare class NodusClient {
  gatewayUrl: string;
  apiKey: string | null;
  searchIndex: NodusSearchIndex;

  constructor(config?: NodusClientConfig);
  getStatus(): Promise<any>;
  put(data: Uint8Array | ArrayBuffer | string | Blob, options: PutOptions): Promise<PutResult>;
  get(fileId: string, options?: GetOptions): Promise<GetResult>;
  list(filters?: { tag?: string }): Promise<any[]>;
  search(query: string, options?: SearchOptions): Promise<any[]>;
  delete(fileId: string): Promise<{ success: boolean; deleted: boolean }>;
}

export declare function createNodusClient(config?: NodusClientConfig): NodusClient;

export default NodusClient;
