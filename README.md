# 🌊 Walrus Console Guide & Integration

Welcome to your **Walrus Console** workspace! You have been selected as a beta tester for **Walrus Console** (powered by Mysten Labs, the creators of Sui).

This guide covers what Walrus Console is, how its cryptographic architecture works, how AI agents connect to it, and how to configure your credentials.

---

## 1. What is Walrus Console?

**Walrus Console** ([console.walrus.xyz](https://console.walrus.xyz)) is the control center for decentralized storage on the **Walrus Protocol** and the **Sui blockchain**.

Think of it as a decentralized, privacy-first **Google Drive / S3** for humans and autonomous AI agents:
- **Decentralized Blob Storage**: Every file gets a unique Blob ID and lives on the Walrus network using 2D Reed-Solomon erasure coding.
- **Client-Side Encryption (Seal)**: Files are encrypted and decrypted locally on your machine using **Seal** (`@mysten/seal`). The remote servers and Console API **never** see your plaintext files or private decryption keys.
- **AI Agent Native**: Built specifically to allow AI assistants (Claude, Cursor, Codex, Gemini / Antigravity) to read and write files directly to decentralized storage using the **Model Context Protocol (MCP)**.
- **Granular Access Control**: Uses Sui on-chain transactions to grant and revoke access to private buckets.

---

## 2. Understanding Your Keys & Credentials

When creating an API key under **Integrations → New API key**, Walrus Console presents two key types and distinct cryptographic roles:

### Key Types
1. **API Key (Working Key)**:
   - Prefix: `hbr_...`
   - Purpose: Data-plane access. Allows listing spaces, creating buckets, uploading and downloading files.
2. **Service Private Key**:
   - Prefix: `suiprivkey1...`
   - Purpose: Client-side signing seed. Used on your machine for Seal decryption/encryption and Sui PTB transaction signing. **Never leaves your computer**.
3. **Owner & Admin Address Pins**:
   - Format: `0x...` (Sui addresses)
   - Purpose: Cryptographic pinning so bucket creations strictly bind to your verified Sui account, preventing spoofing.
4. **Credential Bundle (Best)**:
   - JSON blob: `{"v":1,"apiKey":"hbr_...","serviceSecret":"suiprivkey1...","ownerAddress":"0x...","keyAdminAddress":...}`
   - Carries everything in a single paste!

---

## 3. How to Connect

### Step 1: Add your credentials to `.env`
Open the `.env` file in this folder and paste your keys:
- If you copied the **CONSOLE_CREDENTIAL_BUNDLE** JSON: paste it on the `CONSOLE_CREDENTIAL_BUNDLE=` line.
- Or paste `CONSOLE_API_KEY`, `CONSOLE_SERVICE_PRIVATE_KEY`, and `CONSOLE_WEB_ACCOUNT_ADDRESS` individually.

### Step 2: Test the Connection
Run the connection check:
```bash
node test-connection.js
```
This script will authenticate against `https://console.walrus.xyz/api/v1/spaces` and report your quota and spaces.

---

## 4. Connecting to AI Agents via MCP

Walrus Console provides an official MCP server:
`@mysten-incubation/walrus-console-mcp@beta`

### Available Tools for AI Agents:
| Tool | Description |
| :--- | :--- |
| `ping_console` | Verify keys and connectivity |
| `list_spaces` | List Personal and Team spaces |
| `get_storage_usage` | Show storage quota and usage (e.g. 0 / 5 GB) |
| `list_buckets` | List buckets in a space |
| `create_bucket` | Create an encrypted, private bucket |
| `upload_file` | Client-side encrypt and upload a local file |
| `download_file` | Download and client-side decrypt a file |
| `list_files` | List/search files within a bucket |
| `get_file_status` | Check upload/indexing progress |
| `delete_file` / `delete_bucket` | Clean up stored assets |

---

## 5. Project Structure

```
├── .env                  # Your private credentials (git-ignored)
├── .env.example          # Safe template for credentials
├── .gitignore            # Protects secrets and build artifacts
├── package.json          # Node project config with dependencies
├── test-connection.js    # Direct connection test script
└── README.md             # This guide
```
