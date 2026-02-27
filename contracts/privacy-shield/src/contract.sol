// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface Groth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external view returns (bool);
}

contract PrivacyShield {

    Groth16Verifier public verifier;

    // Replay protection
    mapping(uint256 => bool) public nullifierUsed;

    // Registration mapping (commitment -> registered)
    mapping(uint256 => bool) public isRegistered;

    event Registered(uint256 commitment);
    event IdentityVerified(
        address indexed user,
        uint256 indexed nullifier,
        uint256 commitment
    );

    constructor(address _verifierAddress) {
        verifier = Groth16Verifier(_verifierAddress);
    }

    // 🟢 Step 1: Register commitment
    function register(uint256 _commitment) external {
        require(!isRegistered[_commitment], "Already registered");
        isRegistered[_commitment] = true;

        emit Registered(_commitment);
    }

    function verifyIdentity(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external returns (bool) {

        // publicSignals structure:
        // [0] commitment
        // [1] app_address
        // [2] user_wallet
        // [3] nullifier

        uint256 commitment = _pubSignals[0];
        uint256 appAddress = _pubSignals[1];
        uint256 userWallet = _pubSignals[2];
        uint256 nullifier  = _pubSignals[3];

        // 🔐 BDVP Binding
        require(
            appAddress == uint256(uint160(address(this))),
            "Wrong designated verifier"
        );

        // 🔐 Wallet Binding:address checking only 
        require(
            userWallet == uint256(uint160(msg.sender)),
            "Wallet mismatch"
        );

        // 🔐 Must be registered first
        require(
            isRegistered[commitment],
            "Identity not registered"
        );

        // 🔐 Replay Protection
        require(
            !nullifierUsed[nullifier],
            "Nullifier already used"
        );

        // 🔎 Verify ZK proof (elliptic curve pairing happens here)
        bool isValid = verifier.verifyProof(
            _pA,
            _pB,
            _pC,
            _pubSignals
        );

        require(isValid, "Invalid proof");

        nullifierUsed[nullifier] = true;

        emit IdentityVerified(
            msg.sender,
            nullifier,
            commitment
        );

        return true;
    }
}