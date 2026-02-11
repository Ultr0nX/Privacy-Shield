pragma circom 2.1.6;

/*
    We use Poseidon because it is efficient inside ZK circuits.
    This file comes from circomlib.
*/

//  Standard include (best for portability)
include "circomlib/circuits/poseidon.circom";

/*
    Circuit: Privacy

    This circuit proves:
    - The prover knows a secretId (private)
    - Such that:
        Poseidon(secretId, app_address, user_wallet) == nullifier
*/
template Privacy() {


    // Public Inputs

    // Address of the application 
    signal input app_address;

    // User wallet address
    signal input user_wallet;

    // Public nullifier (claimed hash)
    signal input nullifier;

    // Private Input

    // Secret identity 
    signal input secretId;

    // Poseidon Hash Computation

    /*
        Poseidon with 3 inputs:
        (secretId, app_address, user_wallet)
    */
    component poseidonHasher = Poseidon(3);

    poseidonHasher.inputs[0] <== secretId;
    poseidonHasher.inputs[1] <== app_address;
    poseidonHasher.inputs[2] <== user_wallet;


    /*
        Enforce that the computed Poseidon hash
        equals the public nullifier.
    */
    nullifier === poseidonHasher.out;
}

/*
    Main entry point
*/
component main = Privacy();
