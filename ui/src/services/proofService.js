/**
 * Proof Service
 * Handles ZK proof generation and formatting
 */

/**
 * Convert proof values to hex strings (fixes ethers.js encoding issue)
 */
const toHex = (val) => '0x' + window.BigInt(val).toString(16).padStart(64, '0');

/**
 * Format proof for on-chain verification
 * IMPORTANT: pi_b sub-arrays must be reversed for Solidity (G2 point encoding)
 */
export const formatProofForChain = (proof, publicSignals) => {
  const proofHex = {
    pi_a: proof.pi_a.slice(0, 2).map(toHex),
    pi_b: proof.pi_b.slice(0, 2).map(row => row.slice(0, 2).reverse().map(toHex)),
    pi_c: proof.pi_c.slice(0, 2).map(toHex),
    protocol: proof.protocol,
    curve: proof.curve
  };
  
  const publicSignalsHex = publicSignals.map(toHex);
  
  return { proof: proofHex, publicSignals: publicSignalsHex };
};

/**
 * Generate ZK proof for identity verification
 * @param {Object} inputs - Circuit inputs
 * @param {string} inputs.identityCommitment
 * @param {string} inputs.app_address
 * @param {string} inputs.user_wallet
 * @param {string} inputs.nullifier
 * @param {string} inputs.secretId
 * @returns {Object} { proof, publicSignals }
 */
export const generateProof = async (inputs) => {
  try {
    console.log("🔐 Generating ZK proof with inputs:", inputs);
    
    // Generate proof using SnarkJS
    const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
      inputs,
      "/circuit.wasm",
      "/circuit_final.zkey"
    );
    
    console.log("✅ Proof generated:", proof);
    console.log("📊 Public signals:", publicSignals);
    
    return { proof, publicSignals };
  } catch (error) {
    console.error("Proof generation error:", error);
    throw new Error(`Failed to generate proof: ${error.message}`);
  }
};

/**
 * Calculate nullifier for verification
 * @param {string} secretId - Private biometric secret
 * @param {string} appAddress - Application contract address
 * @param {string} userWallet - User wallet address
 * @returns {string} - Nullifier value
 */
export const calculateNullifier = (secretId, appAddress, userWallet) => {
  try {
    const poseidon = window.poseidonInstance;
    if (!poseidon) {
      throw new Error("Poseidon not initialized");
    }
    
    const userAddrBigInt = window.BigInt(userWallet).toString();
    const appAddrBigInt = window.BigInt(appAddress).toString();
    
    // Nullifier = Poseidon(secretId, app, wallet)
    const nHash = poseidon([
      window.BigInt(secretId),
      window.BigInt(appAddrBigInt),
      window.BigInt(userAddrBigInt)
    ]);
    
    return poseidon.F.toString(nHash);
  } catch (error) {
    console.error("Nullifier calculation error:", error);
    throw new Error(`Failed to calculate nullifier: ${error.message}`);
  }
};

/**
 * Prepare circuit inputs for proof generation
 */
export const prepareCircuitInputs = (commitment, appAddress, userWallet, nullifier, secretId) => {
  return {
    identityCommitment: commitment.toString(),
    app_address: window.BigInt(appAddress).toString(),
    user_wallet: window.BigInt(userWallet).toString(),
    nullifier: nullifier.toString(),
    secretId: secretId.toString()
  };
};
