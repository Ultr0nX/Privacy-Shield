# Identity Protocol — Project Documentation

> Zero-knowledge biometric identity on Ethereum. Prove you are human without revealing your face.

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [System Architecture](#2-system-architecture)
3. [How Identity Is Created](#3-how-identity-is-created)
4. [Zero-Knowledge Proof Flow](#4-zero-knowledge-proof-flow)
5. [Cross-Device Recovery](#5-cross-device-recovery)
6. [Smart Contract](#6-smart-contract)
7. [ZK Circuit](#7-zk-circuit)
8. [Relayer (Gas Abstraction)](#8-relayer-gas-abstraction)
9. [Frontend](#9-frontend)
10. [Security Properties](#10-security-properties)
11. [Tech Stack](#11-tech-stack)
12. [Setup & Local Dev](#12-setup--local-dev)
13. [Deployment (Sepolia Testnet)](#13-deployment-sepolia-testnet)
14. [Current State & Limitations](#14-current-state--limitations)

---

## 1. What This Project Does

Identity Protocol lets a user prove **"I am a real, unique human tied to this wallet"** on-chain — without storing any biometric data anywhere.

**The core guarantee:** the system links your face to your wallet cryptographically. A different person cannot use your wallet, and you cannot use someone else's wallet.

**What is NOT stored anywhere:**
- Your face image
- Your face embeddings
- The random secret derived from your face

**What IS stored on-chain (publicly visible but privacy-preserving):**
- `commitment` — a Poseidon hash of your identity (reveals nothing about face or secret)
- `helperData` — 96 bytes of BCH fuzzy-extractor data (reveals nothing about face by the fuzzy-extractor security proof)

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MODULE 1: Frontend (React)                                  │
│  Face scan → MediaPipe landmarks → BCH fuzzy extractor →    │
│  randomSecret → commitment → ZK proof generation            │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP (no biometric data sent)
┌──────────────────────▼──────────────────────────────────────┐
│  MODULE 2: Relayer (Rust / Axum)                            │
│  Receives commitment + helperData + ZK proof                │
│  Submits transactions to Ethereum (pays gas)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON-RPC
┌──────────────────────▼──────────────────────────────────────┐
│  MODULE 3: Smart Contract (Solidity / Foundry)              │
│  PrivacyShield.sol — stores commitments, verifies ZK proofs │
│  Verifier.sol — auto-generated Groth16 verifier             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  MODULE 4: ZK Circuit (Circom / snarkjs)                    │
│  Proves: Poseidon(secretId) == commitment                   │
│  Proves: Poseidon(secretId, app, wallet) == nullifier       │
│  Without revealing secretId                                  │
└─────────────────────────────────────────────────────────────┘
```

All biometric computation happens **locally in the browser**. Nothing biometric is ever sent to the relayer or stored on-chain.

---

## 3. How Identity Is Created

### Step 1 — Face Scan

MediaPipe FaceMesh extracts 468 3D facial landmarks from the camera. These are converted into a 128-dimensional embedding (normalized float vector) and then binarized into **511 bits** of face data.

```
face image → 468 landmarks → 128-dim embedding → 511 face bits
```

### Step 2 — BCH Fuzzy Extractor

A BCH(511, 259, t=30) error-correcting code is used. This allows up to 30 bit-flips between scans of the same face (lighting, angle, expression changes) while still recovering the exact same secret.

```
randomSecret  ──→  bchEncode(randomSecret)  →  511-bit codeword
face bits  XOR  codeword  ──→  helperData (64 bytes)
```

The `randomSecret` is a random 32-byte value generated at enrollment time. The `helperData` is the XOR of the face bits with the BCH codeword — it reveals nothing about either input (fuzzy-extractor security property).

A SHA-256 hash of the randomSecret is appended:
```
helperData = XOR_bits (64 bytes) || SHA256(randomSecret) (32 bytes) = 96 bytes total
```

### Step 3 — Identity Commitment

```
walletKey  = keccak256(walletAddress)
secretId   = Poseidon(walletKey, randomSecret)
commitment = Poseidon(secretId)
```

The commitment is a Poseidon hash (ZK-friendly). It permanently binds the face (via randomSecret) to the wallet (via walletKey). Neither can produce the correct commitment alone.

### Step 4 — Registration

The relayer submits `registerIdentity(userWallet, commitment, helperData)` to the contract. The contract stores the commitment and helperData on-chain, one per wallet.

---

## 4. Zero-Knowledge Proof Flow

### What the ZK proof proves (without revealing secretId)

The Groth16 circuit takes:

| Signal | Type | Description |
|--------|------|-------------|
| `secretId` | private | Poseidon(walletKey, randomSecret) |
| `identityCommitment` | public | Poseidon(secretId) |
| `app_address` | public | Address of PrivacyShield contract |
| `user_wallet` | public | User's Ethereum address |
| `nullifier` | public | Poseidon(secretId, app_address, user_wallet) |

The circuit proves:
1. `Poseidon(secretId) == identityCommitment` — you know the secret behind the commitment
2. `Poseidon(secretId, app_address, user_wallet) == nullifier` — the nullifier is correctly derived

### Why this is secure

- **secretId is never revealed** — only its Poseidon hash (the commitment) is public
- **app_address binding** — the proof only works for the specific contract it was generated for; cannot be replayed on a different contract
- **nullifier prevents replay** — each proof produces a unique nullifier that is marked as used on-chain
- **wallet binding** — the nullifier includes the wallet address, so the proof cannot be submitted for a different wallet

### Verification on-chain (verifyAndExecute)

```
1. registeredIdentities[commitment] == true       (must be registered)
2. appAddress == address(this)                    (designated-verifier binding)
3. usedNullifiers[nullifier] == false             (no replay)
4. verifier.verifyProof(a, b, c, publicSignals)   (Groth16 pairing check)
5. Mark nullifier as used, emit ActionVerified
```

---

## 5. Cross-Device Recovery

When a user switches devices or clears their browser storage, the `helperData` stored on-chain enables recovery:

```
1. Fetch helperData from contract: getProfile(walletAddress)
2. Scan face on new device → 511 face bits
3. XOR face bits with stored helperData → noisy codeword
4. BCH decode noisy codeword → recover randomSecret (if ≤30 bit errors)
5. Verify: SHA256(recovered) == stored SHA256 hint
6. Recompute secretId and commitment
```

If BCH decode fails (too many bit errors — wrong person or too different a scan), recovery fails and an error is shown. The threshold is t=30 bit errors.

---

## 6. Smart Contract

**File:** `contracts/privacy-shield/src/PrivacyShield.sol`

### Key Storage

```solidity
mapping(uint256 => bool) public registeredIdentities;  // commitment → registered
mapping(uint256 => bool) public usedNullifiers;         // nullifier → used
mapping(uint256 => bool) public verifiedIdentities;     // commitment → verified
mapping(address => IdentityProfile) public profiles;    // wallet → profile
```

### IdentityProfile struct

```solidity
struct IdentityProfile {
    uint256 commitment;
    bytes   helperData;   // 96 bytes: XOR bits (64) || SHA256(secret) (32)
    bool    exists;
}
```

### Functions

| Function | Description |
|----------|-------------|
| `registerIdentity(userWallet, commitment, helperData)` | Called by relayer to register a new identity |
| `verifyAndExecute(a, b, c, publicSignals)` | Verifies Groth16 proof, marks identity as verified |
| `getProfile(userWallet)` | Returns commitment, helperData, exists — used for cross-device recovery |
| `isRegistered(commitment)` | View helper |

### Security enforcements in contract

- One wallet = one identity: `require(!profiles[userWallet].exists)`
- One commitment = one registration: `require(!registeredIdentities[commitment])`
- No proof replay: `require(!usedNullifiers[nullifier])` (hard revert)
- Designated-verifier binding: `require(appAddress == uint256(uint160(address(this))))`

---

## 7. ZK Circuit

**File:** `circuits/privacy.circom`

```circom
pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";

template PrivacyIdentity() {
    signal input  secretId;
    signal output identityCommitment;
    signal output app_address;
    signal output user_wallet;
    signal output nullifier;

    // Constraint 1: commitment = Poseidon(secretId)
    component commitmentHash = Poseidon(1);
    commitmentHash.inputs[0] <== secretId;
    identityCommitment <== commitmentHash.out;

    // Constraint 2: nullifier = Poseidon(secretId, app_address, user_wallet)
    component nullifierHash = Poseidon(3);
    nullifierHash.inputs[0] <== secretId;
    nullifierHash.inputs[1] <== app_address;
    nullifierHash.inputs[2] <== user_wallet;
    nullifier <== nullifierHash.out;
}
component main {public [app_address, user_wallet]} = PrivacyIdentity();
```

**Proving system:** Groth16 on BN128 (alt_bn128) elliptic curve

**Artifacts:**
- `circuits/circuit_final.zkey` — proving key (trusted setup)
- `circuits/circuit_vk.json` — verification key
- `circuits/circuit.wasm` — compiled circuit for browser proof generation (auto-copied to `ui/public/` on `npm start`)

---

## 8. Relayer (Gas Abstraction)

**Directory:** `relayer/`
**Language:** Rust (Axum web framework, Alloy Ethereum library)

The relayer is a backend service that pays gas on behalf of users. Users never need ETH in their wallet to interact with the protocol.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/check-registration` | Check if a commitment is already registered |
| POST | `/register` | Submit registerIdentity transaction |
| POST | `/verify` | Submit verifyAndExecute transaction |

### /check-registration request

```json
{ "identityCommitment": "12345..." }
```

### /register request

```json
{
  "identityCommitment": "12345...",
  "helperData": "0xaabbcc...",
  "userWallet": "0xAbCd..."
}
```

### /verify request

```json
{
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] },
  "publicSignals": ["commitment", "appAddress", "wallet", "nullifier"]
}
```

### Configuration

Set in `relayer/.env`:
```env
PRIVATE_KEY=0x...          # Relayer's funded wallet
RPC_URL=https://...        # Ethereum RPC (Alchemy/Infura)
CONTRACT_ADDRESS=0x...     # PrivacyShield contract address
PORT=3001
```

---

## 9. Frontend

**Directory:** `ui/`
**Framework:** React (Create React App)

### Key Files

```
ui/src/
├── App.js                        # Main app, orchestrates flow
├── hooks/
│   ├── useBiometric.js           # Core: face scan, BCH, ZK proof
│   ├── useWallet.js              # MetaMask connection
│   └── useRegistration.js        # Registration flow state
├── services/
│   ├── fuzzyExtractor.js         # BCH encode/decode, SHA-256 check
│   ├── relayerService.js         # HTTP calls to relayer
│   └── embeddingService.js       # Face embedding → 511 bits
├── utils/
│   ├── contract.js               # ethers.js ABI + getProfile()
│   └── validators.js             # Input validation
└── components/
    └── FaceScanner.jsx           # Camera + MediaPipe UI component
```

### Registration Flow

```
1. Connect MetaMask wallet
2. FaceScanner: MediaPipe captures landmarks (30 frames averaged)
3. Liveness check: nose-tip movement detected (anti-spoof)
4. useBiometric: compute embedding → 511 bits → BCH → randomSecret
5. Compute secretId = Poseidon(walletKey, randomSecret)
6. Compute commitment = Poseidon(secretId)
7. Generate Groth16 proof in browser (snarkjs)
8. Send commitment + helperData to relayer /register
9. Emit IdentityRegistered event on-chain
```

### Verification Flow

```
1. Load existing profile (localStorage or on-chain via getProfile)
2. Scan face again → recover randomSecret via BCH
3. Verify SHA-256 matches stored hint
4. Recompute secretId and commitment
5. Generate Groth16 proof with nullifier
6. Send proof to relayer /verify
7. Contract emits ActionVerified
```

### Same-Person Check

Before BCH recovery is accepted, cosine similarity between the current face embedding and the stored `descriptorTemplate` is checked:

```javascript
const DIFFERENT_PERSON_THRESHOLD = 0.92;
// If cosine similarity < 0.92 → reject as different person
```

This prevents a different person from successfully recovering a registered wallet's secret even if their BCH bit errors happen to be under 30.

---

## 10. Security Properties

### Cryptographic Guarantees

| Property | Mechanism |
|----------|-----------|
| Face privacy | BCH fuzzy extractor — helperData is information-theoretically independent of face bits |
| Secret privacy | ZK proof — secretId never leaves the browser |
| Commitment binding | Poseidon hash is collision-resistant |
| Replay prevention | Nullifier = Poseidon(secretId, app, wallet) — unique per (identity, app, wallet) tuple |
| Cross-app isolation | app_address in nullifier — same identity produces different nullifier for each app |
| Cross-wallet isolation | user_wallet in commitment — face + wrong wallet cannot produce correct commitment |

### Access Control

| Attack | Defense |
|--------|---------|
| Different person using your wallet | Cosine similarity check (threshold 0.92) + BCH bit error limit (t=30) |
| Replay proof on same contract | usedNullifiers mapping — hard revert |
| Replay proof on different contract | app_address binding in Groth16 circuit |
| Register same commitment twice | `require(!registeredIdentities[commitment])` |
| Register two identities to one wallet | `require(!profiles[userWallet].exists)` |
| Front-run registration | No msg.sender check in registerIdentity (known limitation for mini-project scope) |

### Known Limitation (Mini-Project Scope)

`registerIdentity` does not verify `msg.sender == userWallet`. A malicious actor who observes a pending transaction in the mempool could front-run and register the commitment to their own wallet. Mitigation would require the user to sign the registration data (EIP-712 signature check in the contract).

---

## 11. Tech Stack

| Layer | Technology |
|-------|-----------|
| Face landmarks | MediaPipe FaceMesh (browser, WASM) |
| Face embedding | Custom 128-dim from 468 landmarks |
| Error correction | BCH(511, 259, t=30) |
| Hash function | Poseidon (ZK-friendly), SHA-256 (recovery hint), keccak256 (wallet key) |
| ZK proving system | Groth16 (snarkjs, browser) |
| ZK circuit language | Circom 2.0 |
| Smart contract | Solidity ^0.8.20 |
| Contract framework | Foundry (forge, cast) |
| Blockchain | Ethereum (Sepolia testnet) |
| Relayer | Rust, Axum, Alloy |
| Frontend | React, ethers.js |
| Elliptic curve | BN128 (alt_bn128) |

---

## 12. Setup & Local Dev

### Prerequisites

- Node.js ≥ 18
- Rust + Cargo
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- MetaMask browser extension

### 1. Clone and install

```bash
git clone <repo>
cd Identity-protocol
```

### 2. Frontend

```bash
cd ui
npm install
npm start
# Runs on http://localhost:3000
# Automatically copies circuit.wasm to ui/public/
```

### 3. Relayer

```bash
cd relayer
cp .env.example .env
# Fill in PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS
cargo run
# Runs on http://localhost:3001
```

### 4. Contracts (if redeploying)

```bash
cd contracts/privacy-shield
forge install
forge build
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### 5. Circuit (if rebuilding)

```bash
cd circuits
npm install
circom privacy.circom --r1cs --wasm --sym
snarkjs groth16 setup privacy.r1cs pot12_final.ptau circuit_0.zkey
snarkjs zkey contribute circuit_0.zkey circuit_final.zkey
snarkjs zkey export verificationkey circuit_final.zkey circuit_vk.json
snarkjs zkey export solidityverifier circuit_final.zkey Verifier.sol
```

---

## 13. Deployment (Sepolia Testnet)

| Component | Address / URL |
|-----------|--------------|
| PrivacyShield contract | `0x99C9aBccAF1aed42Db8eE5e07d313EF8A470c79B` |
| Network | Ethereum Sepolia (chainId 11155111) |
| Relayer | `http://localhost:3001` (local, run separately) |
| Frontend | `http://localhost:3000` (local dev) |

The Verifier.sol contract is deployed separately and its address is passed to the PrivacyShield constructor.

---

## 14. Current State & Limitations

### What works

- Full registration flow: face scan → BCH → ZK proof → on-chain commitment
- Full verification flow: face rescan → BCH recovery → ZK proof → on-chain nullifier
- Cross-device recovery via on-chain helperData
- Gas abstraction: users pay no ETH, relayer submits all transactions
- Different-person rejection: cosine similarity guard at the UI layer
- One wallet = one identity enforced at both contract level and UI level

### Known Limitations

| Issue | Impact | Status |
|-------|--------|--------|
| Front-run registration attack | Attacker can steal a commitment by front-running | Known, deferred |
| No msg.sender == userWallet check | Relayer could register wrong wallet | Deferred (trusted relayer assumed) |
| Liveness is movement-based | Not robust against video replay | Mini-project scope |
| Trusted setup (Groth16) | Requires ceremony for production | Mini-project, test zkey used |
| Single relayer | Central point of failure | Mini-project scope |
| helperData public | XOR of face bits — future work: encrypt with wallet key | Enhancement opportunity |

### Security Audit Summary (15 cases checked)

1. ✅ Double registration (same commitment) — blocked by contract
2. ✅ Double registration (same wallet) — blocked by contract
3. ✅ Proof replay (same nullifier) — hard revert in contract
4. ✅ Cross-app proof replay — app_address binding in circuit
5. ✅ Wrong person using registered wallet — cosine similarity + BCH error limit
6. ✅ Fake commitment (no ZK proof) — verifyProof pairing check
7. ✅ Wrong wallet in proof — wallet included in nullifier computation
8. ✅ Tampered public signals — Groth16 would fail
9. ✅ BCH collision (different face, same codeword) — SHA-256 commitment check
10. ✅ On-chain data reveals face — fuzzy-extractor security proof
11. ✅ Commitment reveals secret — Poseidon preimage resistance
12. ⚠️ Front-run registration — no msg.sender check (known limitation)
13. ✅ Nullifier linkage across apps — different nullifier per app_address
14. ✅ Recovery by wrong person — BCH t=30 + cosine 0.92 threshold
15. ✅ secretId extraction from proof — ZK guarantee (private input)

---

*This is a mini-project / proof-of-concept. Not audited for production use.*
