# Solana Devnet RBAC proof

This is the minimum on-chain proof for the Nodus demo. It is not a billing or asset registry. The program stores only:

- SHA-256 of a normalized organization ID;
- authority and member public keys;
- role (`viewer`, `contributor`, `admin`, `owner`);
- SHA-256 of the fixed `nodus:tenant-access:v1` capability label;
- active/revoked state and timestamps.

It never stores asset IDs, file names, tags, plaintext, encryption keys, emails, or other personal metadata.

## Prerequisites

Install Rust, Solana CLI, Anchor 0.30.1, and use a fresh Devnet-only deploy wallet. Never use a production wallet or commit the keypair.

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2
anchor keys list
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

After deployment, copy the resulting program ID to both locations and rebuild if `anchor keys sync` changed it:

```bash
# Anchor.toml: [programs.devnet].nodus_access
# programs/nodus_access/src/lib.rs: declare_id!("...")
SOLANA_PROGRAM_ID=YOUR_DEPLOYED_PROGRAM_ID
SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com
NODUS_SOLANA_RBAC_MODE=devnet
```

## Demo sequence

1. Owner wallet initializes `Organization` from the SHA-256 organization ID.
2. Owner assigns the second wallet a `Member` role and creates its tenant-access `Capability`.
3. Capture the transaction signatures and open the program, organization, member and capability PDAs in Solana Explorer on Devnet.
4. The second wallet completes SIWS. `POST /api/auth/solana/verify` returns `solanaProof` only after the API reads active Devnet accounts.
5. Share an encrypted asset to that member, then revoke its member/capability. A later SIWS verification and envelope read must fail.

## Verification endpoint

With Devnet mode enabled, inspect the public proof without exposing private metadata:

```bash
curl "http://localhost:3000/api/solana/devnet/proof?organizationId=demo-org&address=MEMBER_WALLET"
```

The result includes only PDA addresses, effective role, program ID and RPC URL. A missing, foreign or revoked account returns `403`.

## Limits

The program intentionally does not replace PostgreSQL tenant context or client-side encryption. During the demo the backend requires the PostgreSQL role not to exceed the Devnet role. A recipient who already decrypted an asset may retain a local copy; revocation prevents later Nodus envelope recovery and must be paired with re-encryption for strong revocation.
