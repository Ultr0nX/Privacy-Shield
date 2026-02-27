const { buildPoseidon } = require("circomlibjs");

async function verify() {
  const poseidon = await buildPoseidon();
  
  // Actual values from browser console
  const secretId = BigInt("19696058408764505542759865004303570718777779780489982313008410317899385115167");
  const identityCommitment = BigInt("11236294246076951485143829297759852983504190311329368380129692601850954775489");
  const app_address = BigInt("338931984369753699445437582114818918071622068604");
  const user_wallet = BigInt("130528924698884339217112059707891836375701051574");
  const nullifier = BigInt("12645694283768400934780613055747851638946023257387294384844637596303065377031");
  
  // Verify constraint 1: identityCommitment === Poseidon(secretId)
  const computedCommitment = poseidon([secretId]);
  const computedCommitmentStr = poseidon.F.toString(computedCommitment);
  
  console.log("Constraint 1: identityCommitment === Poseidon(secretId)");
  console.log("  Expected:", identityCommitment.toString());
  console.log("  Computed:", computedCommitmentStr);
  console.log("  Match:", identityCommitment.toString() === computedCommitmentStr ? "✅" : "❌");
  
  // Verify constraint 2: nullifier === Poseidon(secretId, app_address, user_wallet)
  const computedNullifier = poseidon([secretId, app_address, user_wallet]);
  const computedNullifierStr = poseidon.F.toString(computedNullifier);
  
  console.log("\nConstraint 2: nullifier === Poseidon(secretId, app_address, user_wallet)");
  console.log("  Expected:", nullifier.toString());
  console.log("  Computed:", computedNullifierStr);
  console.log("  Match:", nullifier.toString() === computedNullifierStr ? "✅" : "❌");
  
  if (identityCommitment.toString() === computedCommitmentStr && 
      nullifier.toString() === computedNullifierStr) {
    console.log("\n✅ All circuit constraints are satisfied!");
    console.log("The proof should be VALID. Issue must be in verification key mismatch.");
  } else {
    console.log("\n❌ Circuit constraints NOT satisfied!");
    console.log("The UI is computing values incorrectly.");
  }
}

verify();
