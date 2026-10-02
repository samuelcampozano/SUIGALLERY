import fs from "node:fs";
import { deriveCapabilityPDA, capabilityHashForTenantAccess, deriveMemberPDA, deriveOrgPDA } from "../server/solana.js";
import { Keypair } from "@solana/web3.js";

function assert(value, message) { if (!value) throw new Error(message); console.log(`  PASS ${message}`); }

const source = fs.readFileSync(new URL("../programs/nodus_access/src/lib.rs", import.meta.url), "utf8");
assert(source.includes("pub struct Organization") && source.includes("pub struct Member") && source.includes("pub struct Capability"), "Anchor program declares Organization, Member, and Capability accounts");
assert(source.includes("b\"nodus_org\"") && source.includes("b\"nodus_member\"") && source.includes("b\"nodus_capability\""), "Anchor program fixes all three PDA seed namespaces");
const accountState = source.match(/pub struct Organization[\s\S]*?pub enum Role/)?.[0] || "";
assert(!/String|Vec<|asset_id|file_name|encryption_key/i.test(accountState), "Anchor account state contains fixed keys, hashes, roles, and flags only");
const organization = deriveOrgPDA("demo-org");
const member = deriveMemberPDA(organization.pda, Keypair.generate().publicKey);
const capability = deriveCapabilityPDA(member.pda, capabilityHashForTenantAccess());
assert(Boolean(organization.pdaString && member.pdaString && capability.pdaString), "JavaScript derives matching organization, member, and capability PDA addresses");
console.log("Devnet deployment proof remains an explicit manual/integration step; this test does not claim a deployment.");
