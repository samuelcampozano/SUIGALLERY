#!/usr/bin/env node
/**
 * scripts/create-demo-wallets.mjs
 * 
 * Generates and funds demo Solana Devnet wallets (Owner and Member) for the Nodus demo.
 * Outputs Devnet Explorer links, PDA derivations, and the exact provisioning command.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import {
  deriveOrganizationPda,
  deriveMemberPda,
  deriveCapabilityPda
} from "./provision-devnet-rbac.mjs";

const DEFAULT_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || "NodUS11111111111111111111111111111111111111";
const DEVNET_RPC = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const OUTPUT_DIR = path.resolve(process.cwd(), ".demo-wallets");

function getOrCreateKeypair(filename) {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { keypair: Keypair.fromSecretKey(Uint8Array.from(raw)), filePath, isNew: false };
  }
  const keypair = Keypair.generate();
  fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)), "utf8");
  return { keypair, filePath, isNew: true };
}

async function main() {
  console.log("==================================================");
  console.log("☀️  NODUS — SOLANA DEVNET DEMO WALLET GENERATOR");
  console.log("==================================================");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const { keypair: owner, filePath: ownerPath, isNew: isOwnerNew } = getOrCreateKeypair("owner.json");
  const { keypair: member, filePath: memberPath, isNew: isMemberNew } = getOrCreateKeypair("member.json");

  const ownerPubkey = owner.publicKey.toBase58();
  const memberPubkey = member.publicKey.toBase58();
  const orgName = "demo-org";

  console.log(`\n🔑 [1] OWNER WALLET (${isOwnerNew ? "Newly Created" : "Loaded Existing"}):`);
  console.log(`   Address:  ${ownerPubkey}`);
  console.log(`   Keyfile:  ${ownerPath}`);
  console.log(`   Explorer: https://explorer.solana.com/address/${ownerPubkey}?cluster=devnet`);

  console.log(`\n👥 [2] MEMBER (COLLABORATOR) WALLET (${isMemberNew ? "Newly Created" : "Loaded Existing"}):`);
  console.log(`   Address:  ${memberPubkey}`);
  console.log(`   Keyfile:  ${memberPath}`);
  console.log(`   Explorer: https://explorer.solana.com/address/${memberPubkey}?cluster=devnet`);

  // Connect to Devnet and check balance
  const connection = new Connection(DEVNET_RPC, "confirmed");
  let ownerBalance = 0;
  let memberBalance = 0;

  try {
    ownerBalance = await connection.getBalance(owner.publicKey);
    memberBalance = await connection.getBalance(member.publicKey);
  } catch (err) {
    console.warn(`\n⚠️  Could not reach Solana Devnet RPC (${DEVNET_RPC}): ${err.message}`);
  }

  console.log(`\n💰 [3] DEVNET BALANCES:`);
  console.log(`   Owner:  ${(ownerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`   Member: ${(memberBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (ownerBalance < 0.05 * LAMPORTS_PER_SOL) {
    console.log(`\n⚡ [4] ATTEMPTING DEVNET AIRDROP FOR OWNER...`);
    try {
      const sig = await connection.requestAirdrop(owner.publicKey, 1 * LAMPORTS_PER_SOL);
      console.log(`   Airdrop requested! Signature: ${sig}`);
      console.log(`   Confirming transaction...`);
      await connection.confirmTransaction(sig, "confirmed");
      ownerBalance = await connection.getBalance(owner.publicKey);
      console.log(`   ✅ New Owner Balance: ${(ownerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (airdropErr) {
      console.log(`   ℹ️  Public Devnet airdrop rate-limited: ${airdropErr.message}`);
      console.log(`   👉 Use manual faucet: https://faucet.solana.com (Address: ${ownerPubkey})`);
    }
  }

  // Derive PDAs
  console.log(`\n🔐 [5] ANCHOR ON-CHAIN PDAs (Target Program: ${DEFAULT_PROGRAM_ID}):`);
  try {
    const orgPda = deriveOrganizationPda(orgName, DEFAULT_PROGRAM_ID);
    const memberPda = deriveMemberPda(orgPda, member.publicKey, DEFAULT_PROGRAM_ID);
    const capPda = deriveCapabilityPda(memberPda, DEFAULT_PROGRAM_ID);

    console.log(`   Organization PDA: ${orgPda.toBase58()}`);
    console.log(`   Member PDA:       ${memberPda.toBase58()}`);
    console.log(`   Capability PDA:   ${capPda.toBase58()}`);
  } catch (pdaErr) {
    console.warn(`   (Using placeholder program ID: ${DEFAULT_PROGRAM_ID})`);
  }

  console.log(`\n🚀 [6] READY-TO-RUN PROVISIONING COMMAND:`);
  console.log(`   npm run solana:devnet:provision -- \\`);
  console.log(`     --organization ${orgName} \\`);
  console.log(`     --member ${memberPubkey} \\`);
  console.log(`     --role viewer \\`);
  console.log(`     --program-id ${DEFAULT_PROGRAM_ID} \\`);
  console.log(`     --wallet ${ownerPath}\n`);
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
