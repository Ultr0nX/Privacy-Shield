# 🛡️ Privacy Shield: ZK-Biometric Identity Protocol

**Privacy-Preserving Sybil Resistance for the Next Generation of DeFi.**

---

## 📖 1. Executive Summary

### What is Privacy Shield?
Privacy Shield is a decentralized identity bridge that allows users to prove they are a unique human ("Personhood") to specific blockchain applications without revealing their real identity or creating a publicly trackable history.

### The Problem: The "Universal ID" Flaw
Current solutions (like Worldcoin or standard Soulbound Tokens) create a single, universal ID. If you verify your identity on **Uniswap**, and then use that same identity on **Aave**, those two apps (and the whole world) can link your activity. This creates a massive privacy hole and allows for cross-app surveillance.

### Our Solution: Contextual Unlinkability
Privacy Shield uses **Designated Verifier Proofs (DVP)**. Instead of one ID for everything, a user generates a mathematically unique ID for *each* specific app.
* To **Uniswap**, you are `User_0xAlpha`.
* To **Aave**, you are `User_0xBeta`.
* **The Result:** Apps know you are a verified human, but they cannot talk to each other to track you.

---

## 🏗️ 2. How It Works (The 4-Pillar System)



The architecture is split into four distinct modules to ensure security and decentralization:

1.  **Module A: Identity Engine (Edge-AI)**
    * **What:** Converts a physical face into a stable cryptographic secret via liveness detection, 512-dim ArcFace embeddings, and a Fuzzy Commitment Scheme.
    * **Tech:** MediaPipe (liveness) + face-api.js (detection) + TF.js ArcFace (512-dim embedding) + BCH Error Correction (fuzzy extractor) + Poseidon Hash.
    * **Privacy:** Raw video is purged instantly. Only public `helperData` (cryptographically safe) and a Poseidon-hashed `Secret_ID` remain on the user's device.

2.  **Module B: ZK Engine (The Prover)**
    * **What:** Generates a Zero-Knowledge Proof (ZKP) that says: *"I know a Secret_ID that corresponds to this App, but I won't show you the secret."*
    * **Tech:** Circom + SnarkJS.

3.  **Module C: The Relayer (The Bridge)**
    * **What:** A backend that submits the proof to the blockchain.
    * **Why:** This allows "Gasless" onboarding. The user doesn't need ETH to sign up; the Relayer pays the fee to keep the user's wallet anonymous.

4.  **Module D: The Verifier (Smart Contract)**
    * **What:** An on-chain anchor that verifies the ZK Proof and marks the user as "Verified" for that specific dApp.
    * **Tech:** Solidity (EVM).

---

## 🛠️ 3. The Tech Stack: What & Why?

| Component | Technology | Why This Tech? |
| :--- | :--- | :--- |
| **ZK Logic** | **Circom 2.1** | The industry standard for writing R1CS constraints. It’s highly optimized for EVM. |
| **Hashing** | **Poseidon Hash** | Unlike SHA-256, Poseidon is "SNARK-friendly." It reduces proof generation time by 90% in a browser. |
| **AI Vision** | **MediaPipe + face-api.js + ArcFace (TF.js)** | MediaPipe handles liveness detection in-browser. face-api.js detects+aligns faces. ArcFace produces 512-dim embeddings for robust identity. |
| **Fuzzy Extractor** | **BCH(511,259,t=30) + SHA-256** | Fuzzy Commitment Scheme converts noisy biometric embeddings into stable cryptographic keys, tolerating up to ~6% bit error rate. |
| **Proof System** | **Groth16** | Offers the smallest proof size (only ~200 bytes) and the cheapest on-chain verification gas costs. |
| **Blockchain** | **Polygon Amoy** | Fast finality and near-zero fees, making identity verification accessible. |

---

## 🚀 4. What Makes It Special?

1.  **Plausible Deniability:** Our ZK circuit includes a "trapdoor" property. If a user is coerced into showing their ID, they can mathematically argue that the Verifier could have forged the proof.
2.  **Wallet Binding:** Proofs are tied to a specific `userWallet`. If a hacker intercepts your proof, they cannot "replay" it for their own account.
3.  **Zero Raw Data:** We do not store biometric templates. We store only public `helperData` (XOR of quantized embedding bits with an ECC codeword) and a Poseidon hash commitment. It is mathematically impossible to reconstruct a face from this data, even if the database is leaked.

---

## 💻 5. Getting Started

### Prerequisites
* Node.js (v18+)
* Circom Compiler
* Hardhat

### Installation & Setup
1.  **Clone the Repo:**
    ```bash
    git clone [https://github.com/your-org/privacy-shield.git](https://github.com/your-org/privacy-shield.git)
    cd privacy-shield
    ```
2.  **Install All Dependencies:**
    ```bash
    npm install-all # Custom script to install frontend, relayer, and contracts
    ```
3.  **Run Local Blockchain:**
    ```bash
    cd contracts && npx hardhat node
    ```
4.  **Launch Relayer:**
    ```bash
    cd relayer && npm run dev
    ```
5.  **Start Frontend:**
    ```bash
    cd frontend && npm start
    ```

---

## 🗺️ 6. Roadmap
* **Phase 1:** Infrastructure Skeleton (Mock Data). ✅
* **Phase 2:** Biometric Pipeline (Liveness + 512-dim Embeddings + Fuzzy Extractor) & ZK Circuit Logic. ⏳
* **Phase 3:** On-chain Verifier Handshake. ⏳
* **Phase 4:** Polygon Amoy Testnet Deployment. ⏳

---

## 🛡️ 7. Security & Ethics
This project is built for a college mini-project with a focus on **User Sovereignty**. We believe identity should be a tool for the user, not a tracker for the corporation.

**Developed by Team Privacy Shield.**