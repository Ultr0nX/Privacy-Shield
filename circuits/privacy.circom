pragma circom 2.1.6;

// Standard include for the Poseidon hash function
include "circomlib/circuits/poseidon.circom";

/*
    Circuit: PrivacyIdentity
    
    This circuit proves:
    1. Identity: The prover knows a 'secretId' that corresponds to a public 'identityCommitment'.
    2. Context: The prover is performing an action for a specific 'app_address' and 'user_wallet'.
    3. Nullifier: The 'nullifier' is correctly derived from the secret and the context.
*/
template PrivacyIdentity() {

    // --- PUBLIC INPUTS ---
    // The hash of your face/ID stored on the blockchain during registration
    signal input identityCommitment; 
    
    // Address of the application (Designates the proof for a specific use)
    signal input app_address;

    // User wallet address (Binds the proof to a specific transaction sender)
    signal input user_wallet;

    // The public hash we verify on-chain to prevent double-spending
    signal input nullifier;


    // --- PRIVATE INPUT ---
    // Your actual biometric/secret data (never revealed)
    signal input secretId;


    // --- 1. IDENTITY VERIFICATION ---
    // We check: Poseidon(secretId) == identityCommitment
    component identityCheck = Poseidon(1);
    identityCheck.inputs[0] <== secretId;
    
    // This '===' forces the math to fail if the secret doesn't match the registered ID
    identityCommitment === identityCheck.out;


    // --- 2. NULLIFIER GENERATION ---
    // We check: Poseidon(secretId, app_address, user_wallet) == nullifier
    component poseidonHasher = Poseidon(3);
    poseidonHasher.inputs[0] <== secretId;
    poseidonHasher.inputs[1] <== app_address;
    poseidonHasher.inputs[2] <== user_wallet;

    // This ensures the nullifier being sent to the relayer is mathematically correct
    nullifier === poseidonHasher.out;
}

// In the main component, we must declare which inputs are PUBLIC
// Note: secretId is NOT in this list, so it remains PRIVATE.
component main {public [identityCommitment, app_address, user_wallet, nullifier]} = PrivacyIdentity();