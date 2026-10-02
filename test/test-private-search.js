import assert from "node:assert/strict";
import { NodusSearchIndex, createNodusClient } from "../sdk/index.js";

const index = new NodusSearchIndex();
index.indexDocument({ id: "a", name: "roadmap.docx", content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", tags: ["team"], folderId: "plans", ownerAddress: "alice", size: 1200, createdAt: "2026-09-01T00:00:00Z" });
index.indexContent("a", "Quarterly finance invoice and collaboration plan");
index.indexDocument({ id: "b", name: "holiday.jpg", content_type: "image/jpeg", tags: ["photo"], folderId: "media", ownerAddress: "bob", size: 400, createdAt: "2026-08-01T00:00:00Z" });

assert.deepEqual(index.search("invoice").map((asset) => asset.id), ["a"]);
assert.deepEqual(index.search("fatura", { semantic: true }).map((asset) => asset.id), ["a"]);
assert.deepEqual(index.search("", { folderId: "plans", owner: "alice", minSize: 1000 }).map((asset) => asset.id), ["a"]);
assert.deepEqual(index.search("", { type: "image", createdAfter: "2026-08-15" }), []);
assert.match(NodusSearchIndex.extractText("client-only text", "text/plain"), /client-only/);

const pages = [
  { photos: [{ id: "p1", name: "one.txt", content_type: "text/plain", tags: [] }], nextCursor: "next" },
  { photos: [{ id: "p2", name: "two.txt", content_type: "text/plain", tags: [] }], nextCursor: null }
];
let calls = 0;
const client = createNodusClient({ gatewayUrl: "https://sandbox.invalid", fetch: async () => ({ ok: true, json: async () => pages[calls++] }) });
const rebuilt = await client.rebuildPrivateSearchIndex();
assert.deepEqual(rebuilt, { indexed: 2, includeContent: false });
assert.equal(client.searchIndex.documents.size, 2);
console.log("Private client-side search checks passed.");
