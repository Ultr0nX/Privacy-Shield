const { buildPoseidon } = require("circomlibjs");

async function test() {
  const poseidon = await buildPoseidon();
  
  const secretId = BigInt("9836353273738142390798906836247130550469795530903785606030981481577673921887");
  const app_address = BigInt("12296296352543114541258143884573379005655133212");
  const user_wallet = BigInt("130528924698884339217112059707891836375701051574");
  
  // Calculate correct nullifier
  const nullifier = poseidon([secretId, app_address, user_wallet]);
  const nullifierStr = poseidon.F.toString(nullifier);
  
  console.log("Correct nullifier:", nullifierStr);
}

test();
