# 🦭 Walrus Console Beta Bug Report & Verification

> **Date:** September 2026  
> **Environment:** Walrus Console Production API (`https://api.console.walrus.xyz`)  
> **Package:** `@mysten-incubation/walrus-console-mcp@beta` (`0.1.0-beta.0`)  
> **OS/Runtime:** Windows 11 / Node.js v24.14.0  

---

## 1. Bug #1: Unhandled HTTP 500 (`UnknownError`) on Non-UUID Path Parameters

### Summary
Passing a non-UUID string in the URL for bucket endpoints causes an unhandled database exception that crashes the backend with **HTTP 500 `UnknownError`**, rather than returning a clean **400 Bad Request**.

### Live Console Capture (Redacted)
```bash
# Test 1: Malformed UUID in bucket path
$ curl -i -s -X GET "https://api.console.walrus.xyz/api/v1/buckets/not-a-uuid" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>"

HTTP/2 500
content-type: application/json; charset=utf-8

{"error":"An unexpected error occurred.","code":"UnknownError"}
```

```bash
# Test 2: Malformed UUID in bucket files path
$ curl -i -s -X GET "https://api.console.walrus.xyz/api/v1/buckets/not-a-uuid/files" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>"

HTTP/2 500
content-type: application/json; charset=utf-8

{"error":"An unexpected error occurred.","code":"UnknownError"}
```

### Control Comparisons (Expected Behavior)
```bash
# Control A: Valid UUID format that doesn't exist returns clean 404:
$ curl -i -s -X GET "https://api.console.walrus.xyz/api/v1/buckets/00000000-0000-0000-0000-000000000000" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>"

HTTP/2 404
{"error":"Bucket 00000000-0000-0000-0000-000000000000 not found."}

# Control B: Validated route parameter on file endpoints returns clean 400:
$ curl -i -s -X GET "https://api.console.walrus.xyz/api/v1/buckets/<VALID_BUCKET_ID>/files/invalid-id/status" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>"

HTTP/2 400
{"error":"Bad request.","code":"bad_request"}
```

### Root Cause
In `GET /api/v1/buckets/:id`, the route parameter `:id` is passed directly into the SQL query without prior UUID format validation. PostgreSQL throws `invalid input syntax for type uuid: "not-a-uuid"`, which unhandled bubbles up as an HTTP 500 `UnknownError`.

---

## 2. Bug #2: Null Byte (`%00`) Injection Triggers Unhandled HTTP 500 Server Crash

### Summary
Supplying a null byte character (`%00` or `\0`) in the search query parameter `q` or in metadata tags crashes the server with **HTTP 500**.

### Live Console Capture (Redacted)
```bash
# Test 1: Null byte in search query
$ curl -i -s -X GET "https://api.console.walrus.xyz/api/v1/buckets/<VALID_BUCKET_ID>/files?q=%00" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>"

HTTP/2 500
content-type: application/json; charset=utf-8

{"error":"An unexpected error occurred."}
```

```bash
# Test 2: Null byte inside metadata tag
$ curl -i -s -X PATCH "https://api.console.walrus.xyz/api/v1/buckets/<VALID_BUCKET_ID>/metadata" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>" \
    -H "Content-Type: application/json" \
    -d '{"tags": ["test\u0000tag"]}'

HTTP/2 500
content-type: application/json; charset=utf-8

{"error":"An unexpected error occurred."}
```

### Control Comparison
```bash
# Normal invalid tag correctly returns Zod 400:
$ curl -i -s -X PATCH "https://api.console.walrus.xyz/api/v1/buckets/<VALID_BUCKET_ID>/metadata" \
    -H "Authorization: Bearer <CONSOLE_API_KEY>" \
    -H "Content-Type: application/json" \
    -d '{"tags": [""]}'

HTTP/2 400
{"success":false,"error":{"issues":[{"code":"too_small","minimum":1,"message":"String must contain at least 1 character(s)","path":["tags",0]}],"name":"ZodError"}}
```

### Root Cause
PostgreSQL and C-based DB drivers treat `0x00` as an invalid string terminator. Because the input string is not sanitized for null bytes before database execution, it raises an unhandled database exception.

---

## 3. Bug #3: MCP Tool `list_buckets` Missing `cursor` (Pagination) and `visibility` Filtering

### Summary
In `@mysten-incubation/walrus-console-mcp@beta`, the underlying `ConsoleApiClient.listBuckets` implementation accepts `cursor` and `visibility`, but the registered MCP tool schema for agents omits both.

### Code Evidence in `dist/console-mcp.js`:

#### Underlying API Client (`lines 770-776`):
```typescript
const listBuckets = Effect.fn("ConsoleApiClient.listBuckets")(function* (args) {
    const params = new URLSearchParams();
    if (args.limit !== void 0) params.set("limit", String(args.limit));
    if (args.cursor) params.set("cursor", args.cursor);          // <-- Supports cursor!
    if (args.q) params.set("q", args.q);
    if (args.visibility) params.set("visibility", args.visibility); // <-- Supports visibility!
    const res = yield* authed.get(`/api/v1/spaces/${args.spaceId}/buckets?${params.toString()}`);
```

#### Registered MCP Tool Schema (`lines 3847-3851`):
```typescript
server.registerTool("list_buckets", {
    title: "List Buckets",
    description: "List buckets in a space.",
    inputSchema: {
        spaceId: z.string(),
        limit: z.number().optional(),
        q: z.string().optional()
        // MISSING: cursor and visibility!
    },
```

### Impact
AI agents (Claude, Cursor, Antigravity, Codex) cannot paginate through spaces with more than 20 buckets or filter by visibility (`private` vs `public`).
