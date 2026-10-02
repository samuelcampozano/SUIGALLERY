import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { buildProvisionInstructions, deriveOrganizationPda } from "../scripts/provision-devnet-rbac.mjs";
import { deriveOrgPDA } from "../server/solana.js";

const programId = Keypair.generate().publicKey.toBase58();
const owner = Keypair.generate().publicKey.toBase58();
const member = Keypair.generate().publicKey.toBase58();
const organizationId = "demo-org";

const backendPda = deriveOrgPDA(organizationId, new PublicKey(programId)).pdaString;
const provisionerPda = deriveOrganizationPda(organizationId, programId).toBase58();
assert.equal(backendPda, provisionerPda, "Backend and provisioner derive the same SHA-256 organization PDA");

const plan = buildProvisionInstructions({
  organizationId,
  memberAddress: member,
  role: "contributor",
  programId,
  authorityAddress: owner,
  organizationExists: false
});
assert.equal(plan.instructions.length, 5, "New organization provisions organization, owner and member capabilities");
assert.equal(plan.role, "contributor", "Requested member role is preserved");
assert.equal(plan.organization.toBase58(), backendPda, "Provisioning plan uses the backend verification PDA");
assert.throws(() => buildProvisionInstructions({ organizationId, memberAddress: member, role: "superadmin", programId, authorityAddress: owner, organizationExists: false }), /--role/, "Unknown on-chain roles are rejected");
assert.throws(() => deriveOrganizationPda("invalid org id!", programId), /organization/, "Unsafe organization IDs are rejected");

console.log("PASS Solana Devnet provisioner constructs private-metadata-free, compatible transaction plans.");
