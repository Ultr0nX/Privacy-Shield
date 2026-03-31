// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Verifier.sol";

/**
 * @title PrivacyShield
 * @notice Zero-knowledge biometric identity registry.
 *
 * Each wallet registers exactly ONE identity commitment.  The on-chain profile
 * also stores the fuzzy-extractor helperData (BCH XOR bits ++ SHA-256 of the
 * random secret, 96 bytes total) so any device can recover the same secret via
 * a fresh face scan — without storing any biometric data on-chain.
 *
 * Security properties of the stored data:
 *  - commitment   : Poseidon hash — reveals nothing about the secret.
 *  - helperData   : XOR of face bits with a BCH codeword — reveals nothing
 *                   about the face or the secret (fuzzy-extractor guarantee).
 *  - recoveryHint : SHA-256 of the random secret embedded in helperData —
 *                   one-way hash, cannot reconstruct the secret.
 */
contract PrivacyShield {
    IVerifier public immutable verifier;

    // ── per-commitment state ─────────────────────────────────────────────────
    mapping(uint256 => bool) public registeredIdentities;
    mapping(uint256 => bool) public usedNullifiers;
    mapping(uint256 => bool) public verifiedIdentities;

    // ── per-wallet profile (for cross-device recovery) ───────────────────────
    struct IdentityProfile {
        uint256 commitment;
        // 96 bytes: bytes[0..63]  = BCH XOR bits (face ⊕ bchEncode(randomSecret))
        //           bytes[64..95] = SHA-256(randomSecret)  — recovery commitment
        bytes   helperData;
        bool    exists;
    }
    mapping(address => IdentityProfile) public profiles;

    // ── events ───────────────────────────────────────────────────────────────
    event IdentityRegistered(address indexed registrant, uint256 indexed commitment);
    event ActionVerified(uint256 indexed nullifier, address indexed user);

    constructor(address _verifierAddress) {
        verifier = IVerifier(_verifierAddress);
    }

    // ── registration ─────────────────────────────────────────────────────────

    /**
     * @notice Register a biometric identity on-chain.
     * @dev Called by the relayer on behalf of the user (relayer pays gas).
     * @param userWallet   The user's Ethereum address — profile is keyed by this.
     * @param commitment   Poseidon(Poseidon(walletKey, randomSecret)) — the public
     *                     identity fingerprint.
     * @param helperData   96 bytes: BCH XOR bits (64 B) ++ SHA-256(randomSecret) (32 B).
     *                     Both fields are public by the fuzzy-extractor security proof.
     */
    function registerIdentity(
        address userWallet,
        uint256 commitment,
        bytes calldata helperData
    ) external {
        require(helperData.length == 96,         "PrivacyShield: helperData must be 96 bytes");
        require(!registeredIdentities[commitment],"PrivacyShield: commitment already registered");
        require(!profiles[userWallet].exists,     "PrivacyShield: wallet already registered");

        registeredIdentities[commitment] = true;
        profiles[userWallet] = IdentityProfile({
            commitment : commitment,
            helperData : helperData,
            exists     : true
        });

        emit IdentityRegistered(userWallet, commitment);
    }

    // ── cross-device recovery helper ─────────────────────────────────────────

    /**
     * @notice Fetch the identity profile for cross-device recovery.
     * @param userWallet  The user's Ethereum address.
     * @return commitment  The registered identity commitment.
     * @return helperData  96-byte packed helper data for BCH recovery.
     * @return exists      False if the wallet has no registered identity.
     */
    function getProfile(address userWallet)
        external view
        returns (uint256 commitment, bytes memory helperData, bool exists)
    {
        IdentityProfile storage p = profiles[userWallet];
        return (p.commitment, p.helperData, p.exists);
    }

    // ── verification ─────────────────────────────────────────────────────────

    /**
     * @notice Verify a Groth16 ZK proof and mark the identity as verified.
     * Public signal order must match the Circom circuit:
     *   [0] identityCommitment
     *   [1] app_address
     *   [2] user_wallet
     *   [3] nullifier
     */
    function verifyAndExecute(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[4]    calldata publicSignals
    ) external {
        uint256 identityCommitment = publicSignals[0];
        uint256 appAddress         = publicSignals[1];
        uint256 nullifier          = publicSignals[3];

        // 1. Must be a registered identity.
        require(
            registeredIdentities[identityCommitment],
            "PrivacyShield: identity not registered"
        );

        // 2. Designated-verifier binding: proof must target THIS contract.
        require(
            appAddress == uint256(uint160(address(this))),
            "PrivacyShield: wrong designated verifier"
        );

        // 3. Reject duplicate nullifiers — no replay allowed.
        require(!usedNullifiers[nullifier], "PrivacyShield: nullifier already used");

        // 4. Groth16 pairing check.
        require(
            verifier.verifyProof(a, b, c, publicSignals),
            "PrivacyShield: invalid ZK proof"
        );

        // 5. Mark verified.
        usedNullifiers[nullifier]          = true;
        verifiedIdentities[identityCommitment] = true;
        emit ActionVerified(nullifier, msg.sender);
    }

    // ── view helpers ─────────────────────────────────────────────────────────

    function isRegistered(uint256 _commitment) external view returns (bool) {
        return registeredIdentities[_commitment];
    }
}

interface IVerifier {
    function verifyProof(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[4]    calldata input
    ) external view returns (bool);
}
