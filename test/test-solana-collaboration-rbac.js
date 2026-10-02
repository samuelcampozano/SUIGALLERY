import assert from "node:assert/strict";
import fs from "node:fs";
import { hasSufficientRole } from "../server/solana.js";

assert.equal(hasSufficientRole("owner", "contributor"), true, "Owner may share encrypted access");
assert.equal(hasSufficientRole("admin", "viewer"), true, "Admin may read a shared envelope");
assert.equal(hasSufficientRole("viewer", "contributor"), false, "Viewer cannot create a share");
assert.equal(hasSufficientRole("viewer", "admin"), false, "Recipient cannot receive access above their Devnet role");
assert.equal(hasSufficientRole("unknown", "viewer"), false, "Unknown on-chain roles fail closed");
const routes = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
assert.match(routes, /requireDevnetRecipientRole\(req, req\.body\?\.recipientAddress/, "Asset/folder sharing validates recipient membership on Devnet");
assert.match(routes, /solanaProof: \{ issuer: issuerProof, recipient: recipientProof \}/, "Share API returns public Devnet evidence for the demo");
console.log("PASS Solana collaboration RBAC applies least privilege and fails closed.");
