const { buildPoseidon } = require("circomlibjs");

async function test() {
  const poseidon = await buildPoseidon();
  
  // Test: secretId = 12345
  const secretId = 12345n;
  
  // Compute commitment = Poseidon(secretId)
  const commitment = poseidon([secretId]);
  const commitmentStr = poseidon.F.toString(commitment);
  
  console.log("secretId:", secretId.toString());
  console.log("commitment:", commitmentStr);
  
  // Now test what happens if we convert secretId to string and back
  const secretIdStr = secretId.toString();
  const secretIdBigInt = BigInt(secretIdStr);
  const commitment2 = poseidon([secretIdBigInt]);
  const commitment2Str = poseidon.F.toString(commitment2);
  
  console.log("\nAfter string conversion:");
  console.log("secretId (from string):", secretIdBigInt.toString());
  console.log("commitment (from string):", commitment2Str);
  console.log("Match:", commitmentStr === commitment2Str);
}

test();
