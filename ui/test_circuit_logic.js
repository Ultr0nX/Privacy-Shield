const { buildPoseidon } = require("circomlibjs");

async function test() {
  const poseidon = await buildPoseidon();
  
  // Simulate what UI does
  const ratios = [123n, 456n, 789n];  // Simulated quantized ratios
  
  // Step 1: firstHash (field element object)
  const firstHash = poseidon(ratios);
  const firstHashStr = poseidon.F.toString(firstHash);
  console.log("1. firstHash (from ratios):", firstHashStr);
  
  // Step 2: secondHash using field element object
  const secondHash = poseidon([firstHash]);
  const secondHashStr = poseidon.F.toString(secondHash);
  console.log("2. secondHash using field element object:", secondHashStr);
  
  // Step 3: What if we convert to BigInt?
  const firstHashBigInt = BigInt(firstHashStr);
  const secondHash2 = poseidon([firstHashBigInt]);
  const secondHash2Str = poseidon.F.toString(secondHash2);
  console.log("3. secondHash using BigInt:", secondHash2Str);
  console.log("   Match:", secondHashStr === secondHash2Str);
  
  // Step 4: Now verify circuit logic
  console.log("\nCircuit expects:");
  console.log("   secretId:", firstHashStr);
  console.log("   identityCommitment:", secondHashStr);
  console.log("   Circuit will compute: Poseidon(secretId)");
  
  const circuitComputes = poseidon([firstHashBigInt]);
  const circuitComputesStr = poseidon.F.toString(circuitComputes);
  console.log("   Circuit computes:", circuitComputesStr);
  console.log("   Matches identityCommitment:", circuitComputesStr === secondHashStr);
}

test();
