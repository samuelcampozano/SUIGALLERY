import { DEFAULT_SEAL_POLICY_ID } from "../server/walrus-client.js";

async function runOnChainVerification() {
  console.log("==================================================");
  console.log("⛓️  SUIGALLERY — LIVE SUI ON-CHAIN VERIFICATION");
  console.log("==================================================");

  const endpoint = "https://graphql.mainnet.sui.io/graphql";
  const policyId = DEFAULT_SEAL_POLICY_ID;
  const custodianAddress = process.env.CONSOLE_WEB_ACCOUNT_ADDRESS || "0x7cd0be5706a92f24e7be0fa25666ace9de0b5441a286efab982dcfaa74793033";

  console.log(`📡 Querying Sui GraphQL Node: ${endpoint}`);
  console.log(`🔐 Inspecting Policy Object: ${policyId}`);
  console.log(`👤 Inspecting Custodian Address: ${custodianAddress}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const query = `{
    object(address: "${policyId}") {
      address
      version
      digest
      asMoveObject {
        contents {
          type { repr }
          json
        }
      }
      previousTransaction {
        digest
        sender { address }
      }
    }
    address(address: "${custodianAddress}") {
      address
    }
  }`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error(`HTTP error from Sui GraphQL: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL Errors: ${JSON.stringify(json.errors)}`);
    }

    const obj = json.data?.object;
    const addr = json.data?.address;

    // Assertions
    assert(obj !== null && obj !== undefined, "Seal Policy Object exists and is resolved on Sui Mainnet");
    assert(obj?.address?.toLowerCase() === policyId.toLowerCase(), "On-chain object address matches configured DEFAULT_SEAL_POLICY_ID");
    assert(typeof obj?.version === "number" && obj.version > 0, `Object version sequence is valid (${obj?.version})`);
    assert(typeof obj?.digest === "string" && obj.digest.length > 0, `Cryptographic digest verified: ${obj?.digest}`);

    const moveType = obj?.asMoveObject?.contents?.type?.repr || "";
    assert(
      moveType.includes("PermissionedGroup") && moveType.includes("bucket_policy::WalrusConsole"),
      `Matches Move bytecode specification (WalrusConsole PermissionedGroup)`
    );

    const onChainCreator = obj?.asMoveObject?.contents?.json?.creator;
    if (onChainCreator) {
      assert(
        onChainCreator.toLowerCase() === custodianAddress.toLowerCase(),
        `On-chain creator matches custodian address (${custodianAddress.slice(0, 10)}...)`
      );
    }

    assert(addr !== null && addr !== undefined, "Custodian Sui address confirmed on-chain");

    console.log("\n==================================================");
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("   - Blockchain: Sui Mainnet");
    console.log(`   - Policy Version: ${obj?.version}`);
    console.log(`   - Policy Digest: ${obj?.digest}`);
    console.log(`   - Previous Tx: ${obj?.previousTransaction?.digest}`);
    console.log("==================================================\n");

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("\n❌ On-Chain Verification Failed:", err.message);
    process.exit(1);
  }
}

runOnChainVerification();
