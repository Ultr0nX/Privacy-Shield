const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
const fs = require("fs");

async function test() {
  const poseidon = await buildPoseidon();
  
  // Simple test values
  const secretId = 12345n;
  const app_address = 67890n;
  const user_wallet = 111213n;
  
  // Compute expected values
  const identityCommitment = poseidon([secretId]);
  const identityCommitmentStr = poseidon.F.toString(identityCommitment);
  
  const nullifier = poseidon([secretId, app_address, user_wallet]);
  const nullifierStr = poseidon.F.toString(nullifier);
  
  console.log("Test inputs:");
  console.log("  secretId:", secretId.toString());
  console.log("  identityCommitment:", identityCommitmentStr);
  console.log("  nullifier:", nullifierStr);
  
  const input = {
    identityCommitment: identityCommitmentStr,
    app_address: app_address.toString(),
    user_wallet: user_wallet.toString(),
    nullifier: nullifierStr,
    secretId: secretId.toString()
  };
  
  console.log("\nGenerating proof...");
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      "./public/circuit.wasm",
      "./public/circuit_final.zkey"
    );
    
    console.log("✅ Proof generated successfully!");
    console.log("Public signals:", publicSignals);
    
    // Verify locally
    const vKey = JSON.parse(fs.readFileSync("../circuits/vkey_check.json"));
    const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    console.log("Local verification:", res ? "✅ PASS" : "❌ FAIL");
    
  } catch (err) {
    console.error("❌ Proof generation failed:", err.message);
  }
}

test();
