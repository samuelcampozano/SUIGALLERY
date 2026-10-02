#!/usr/bin/env node
/**
 * Creates the minimum public RBAC proof for the Nodus Devnet demo.
 *
 * It submits only organization/member/capability hashes, public keys, roles and
 * timestamps to the Anchor program. It never reads asset metadata, file keys or
 * plaintext. This script is intentionally Devnet-only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";

const PLACEHOLDER_PROGRAM_ID = "NodUS11111111111111111111111111111111111111";
const CAPABILITY_LABEL = "nodus:tenant-access:v1";
const ROLES = ["viewer", "contributor", "admin", "owner"];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function anchorDiscriminator(name) {
  return sha256(`global:${name}`).subarray(0, 8);
}

function normalizeOrganizationId(value) {
  const organizationId = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(organizationId)) {
    throw new Error("--organization must contain 2-64 letters, digits, underscores or hyphens");
  }
  return organizationId;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function required(args, key) {
  if (!args[key]) throw new Error(`Missing required --${key}`);
  return args[key];
}

export function deriveOrganizationPda(organizationId, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nodus_org"), sha256(normalizeOrganizationId(organizationId))],
    new PublicKey(programId)
  )[0];
}

export function deriveMemberPda(organization, wallet, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nodus_member"), new PublicKey(organization).toBuffer(), new PublicKey(wallet).toBuffer()],
    new PublicKey(programId)
  )[0];
}

export function deriveCapabilityPda(member, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nodus_capability"), new PublicKey(member).toBuffer(), sha256(CAPABILITY_LABEL)],
    new PublicKey(programId)
  )[0];
}

function instruction(programId, name, keys, payload = Buffer.alloc(0)) {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat([anchorDiscriminator(name), payload])
  });
}

function organizationKeys(authority, organization) {
  return [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: organization, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];
}

function memberKeys(authority, organization, wallet, member) {
  return [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: organization, isSigner: false, isWritable: false },
    { pubkey: wallet, isSigner: false, isWritable: false },
    { pubkey: member, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];
}

function capabilityKeys(authority, organization, member, capability) {
  return [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: organization, isSigner: false, isWritable: false },
    { pubkey: member, isSigner: false, isWritable: false },
    { pubkey: capability, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];
}

export function buildProvisionInstructions({ organizationId, memberAddress, role, programId, authorityAddress, organizationExists }) {
  const normalizedOrganizationId = normalizeOrganizationId(organizationId);
  const normalizedRole = String(role || "viewer").toLowerCase();
  if (!ROLES.includes(normalizedRole)) throw new Error(`--role must be one of: ${ROLES.join(", ")}`);
  const authority = new PublicKey(authorityAddress);
  const memberWallet = new PublicKey(memberAddress);
  const program = new PublicKey(programId);
  const organization = deriveOrganizationPda(normalizedOrganizationId, program);
  const ownerMember = deriveMemberPda(organization, authority, program);
  const ownerCapability = deriveCapabilityPda(ownerMember, program);
  const member = deriveMemberPda(organization, memberWallet, program);
  const capability = deriveCapabilityPda(member, program);
  const capabilityHash = sha256(CAPABILITY_LABEL);
  const instructions = [];

  if (!organizationExists) {
    instructions.push(instruction(program, "initialize_organization", organizationKeys(authority, organization), sha256(normalizedOrganizationId)));
  }
  instructions.push(instruction(program, "upsert_member", memberKeys(authority, organization, authority, ownerMember), Buffer.from([ROLES.indexOf("owner")])));
  instructions.push(instruction(program, "set_capability", capabilityKeys(authority, organization, ownerMember, ownerCapability), capabilityHash));
  if (!memberWallet.equals(authority)) {
    instructions.push(instruction(program, "upsert_member", memberKeys(authority, organization, memberWallet, member), Buffer.from([ROLES.indexOf(normalizedRole)])));
    instructions.push(instruction(program, "set_capability", capabilityKeys(authority, organization, member, capability), capabilityHash));
  }

  return {
    instructions,
    organization,
    ownerMember,
    ownerCapability,
    member,
    capability,
    role: normalizedRole
  };
}

function loadKeypair(path) {
  const secret = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export async function provisionDevnet({ organizationId, memberAddress, role, programId, walletPath, rpcUrl }) {
  if (!rpcUrl.startsWith("https://api.devnet.solana.com") && !rpcUrl.includes("devnet")) {
    throw new Error("This provisioner is Devnet-only; --rpc must target a Devnet endpoint");
  }
  if (programId === PLACEHOLDER_PROGRAM_ID) {
    throw new Error("--program-id must be the deployed Devnet Program ID, not the repository placeholder");
  }
  const authority = loadKeypair(walletPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const organization = deriveOrganizationPda(organizationId, programId);
  const existingOrganization = await connection.getAccountInfo(organization, "confirmed");
  if (existingOrganization && !existingOrganization.owner.equals(new PublicKey(programId))) {
    throw new Error("Organization PDA already exists but is not owned by the configured Nodus program");
  }
  const plan = buildProvisionInstructions({
    organizationId,
    memberAddress,
    role,
    programId,
    authorityAddress: authority.publicKey,
    organizationExists: Boolean(existingOrganization)
  });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(...plan.instructions), [authority], { commitment: "confirmed" });
  return { signature, authority: authority.publicKey.toBase58(), ...Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "instructions").map(([key, value]) => [key, value?.toBase58?.() || value])) };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await provisionDevnet({
      organizationId: required(args, "organization"),
      memberAddress: required(args, "member"),
      role: args.role || "viewer",
      programId: required(args, "program-id"),
      walletPath: required(args, "wallet"),
      rpcUrl: args.rpc || "https://api.devnet.solana.com"
    });
    console.log(JSON.stringify({
      ...result,
      explorer: `https://explorer.solana.com/tx/${result.signature}?cluster=devnet`
    }, null, 2));
  } catch (error) {
    console.error(`Devnet provisioning failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
