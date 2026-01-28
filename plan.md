# 🛡️ Privacy Shield: Master Plan of Action

This document serves as the roadmap for the development of the Privacy Shield Protocol. We use a **"Parallel Development"** strategy—everyone builds their piece of the pipe simultaneously, starting with mock data (Phase 1) and moving to high-fidelity logic (Phase 4).

---

## 👥 Team Roles & Workstreams
* **Member 1 (UI/AI Architect):** Face capture, landmark normalization, and Frontend state.
* **Member 2 (Cryptographer):** ZK-SNARK Circuits (Circom), proving keys, and math logic.
* **Member 3 (Relay Engineer):** Node.js API, Gas abstraction, and transaction simulation.
* **Member 4 (Blockchain Lead):** Solidity contracts, Hardhat environment, and on-chain verification.

---

### Before the plan , let's know the user journey / data flow  in the application
# 🛡️ Privacy Shield: End-to-End Logic (The User Journey)

This document explains how the Privacy Shield protocol works by following a single user, **Alice**, as she verifies her identity without compromising her privacy.

The core innovation of this system is that Alice uses her **Face** to prove she is a human, but the **Blockchain** never sees her face—it only sees a mathematical receipt (the Proof).

---

## 🟢 Step 1: The Face Scan (AI Module)
Alice opens the website. The AI Module starts her webcam locally.

* **The Action:** The AI (MediaPipe) identifies 468 specific 3D points on her face (eyes, nose, jawline).
* **The Conversion:** The system calculates the **ratios** between these points. This ensures that even if she moves closer or further from the camera, her unique identity remains consistent.
* **The Secret:** These ratios are hashed using the **Poseidon Hash** into a single 32-byte number called the `Secret_ID`.
* **Privacy Check:** The raw video and images are deleted immediately. The `Secret_ID` remains exclusively in Alice’s browser memory.



---

## 🟡 Step 2: Generating the Proof (ZK Module)
Alice now needs to prove she is a unique human for an application (e.g., Uniswap) without revealing her `Secret_ID`.

* **The Inputs:** The ZK Module (Circom) takes two inputs:
    1.  **Private (Hidden):** Alice's `Secret_ID`.
    2.  **Public (Visible):** Uniswap's Contract Address.
* **The Computation:** The circuit runs the function:  
    $$Nullifier = Poseidon(Secret\_ID, Uniswap\_Address)$$
* **The Output:** It produces a **Groth16 Proof**. This is a tiny cryptographic file that proves Alice knows a `Secret_ID` that generates the `Nullifier` for that specific App Address, without revealing the ID itself.

---

## 🔵 Step 3: Gasless Submission (Relayer Module)
Alice has her proof, but since her biometric wallet is brand new, it has **0 ETH**. She cannot pay for the transaction fees (Gas).

* **The Handover:** Alice's browser sends the **Proof** and the **Nullifier** to the Relayer API.
* **The Sponsorship:** The Relayer checks if the proof is formatted correctly. If valid, the Relayer uses its own wallet to pay the MATIC/ETH gas fee.
* **The Push:** The Relayer calls the `register()` function on the Smart Contract, passing Alice's proof as an argument.

---

## 🔴 Step 4: On-Chain Verification (Blockchain Module)
The Smart Contract receives the data from the Relayer.

* **The Math Test:** The contract calls `Verifier.sol`. If Alice changed even one pixel of her face data or tried to use a fake proof, the mathematical verification will fail.
* **The Sybil Check:** The contract checks its internal registry: *"Has this Nullifier already been used for this specific app?"*
    * **If No:** It saves the Nullifier and emits a `UserVerified` event.
    * **If Yes:** It rejects the transaction (preventing Alice from making a second "fake" account).
* **The Result:** Alice is now a verified "Human" on-chain, but her biometric data never left her computer.

---

## 🏗️ Summary of Data Flow

| Module | Input | Result |
| :--- | :--- | :--- |
| **AI (M1)** | Physical Face | `Secret_ID` (Private) |
| **ZK (M2)** | `Secret_ID` + App Address | `ZK Proof` + `Nullifier` |
| **Relayer (M3)** | `ZK Proof` | Signed Transaction (Gas Paid) |
| **Blockchain (M4)** | `ZK Proof` | On-chain "Verified" Status |

---

## 💡 Lead-Level Design Insights

1.  **Unlinkability:** If Alice verifies on a different app (e.g., Aave), the `Nullifier` will be different because the App Address is part of the hash. **Aave and Uniswap cannot coordinate to track Alice.**
2.  **Zero Friction:** Because of the Relayer, Alice never has to visit an exchange to buy crypto just to verify her identity. This is a "Web2 experience" with "Web3 security."
---


##  Phase 1: The "Walking Skeleton" (Week 1)
**Goal:** Prove the "Connection Pipe" works. No AI or ZK math yet. 



| Member | Task | Action |
| :--- | :--- | :--- |
| **M1** | **UI Skeleton** | Create a React button `[Generate Mock Proof]`. When clicked, it sends a hardcoded JSON string to the Relayer. |
| **M2** | **ZK Skeleton** | Install `circom`. Build a dummy circuit `add.circom` that checks if $x + y = z$. Generate a `verifier.sol`. |
| **M3** | **Relay Bridge** | Build an Express server with a `POST /relay` route. It receives the JSON and logs it. |
| **M4** | **Mock Contract** | Deploy `MockShield.sol` on Localhost. It should have a function `register(string memory dummy)` that emits a Success event. |

---

##  Phase 2: The Core Engines (Week 2)
**Goal:** Implement the "Internal Logic" of each module.



| Member | Task | Action |
| :--- | :--- | :--- |
| **M1** | **Face landmarks** | Integrate MediaPipe. Extract 468 landmarks. Write a function to hash these landmarks into a `Secret_ID`. |
| **M2** | **Poseidon Circuit** | Write the real `privacy.circom`. Logic: $Nullifier = Poseidon(Secret, AppAddress)$. Ensure it compiles. |
| **M3** | **Tx Signer** | Connect the Relayer to a Hardhat wallet. Ensure the Relayer can successfully sign and pay gas for a transaction. |
| **M4** | **Main Contract** | Write `PrivacyShield.sol`. Implement the `mapping(uint256 => bool)` for nullifiers to prevent double-spending. |

---

##  Phase 3: The Integration "Handshake" (Week 3)
**Goal:** The moment of truth—connecting real ZK math to the blockchain.



| Member | Task | Action |
| :--- | :--- | :--- |
| **M1 + M2** | **Client Prover** | Member 1 imports Member 2's compiled `.zkey` and `.wasm`. The UI now generates a *real* proof locally. |
| **M2 + M4** | **Verifier Link** | Member 4 replaces the Mock Contract with the real `verifier.sol` generated by Member 2. |
| **M3 + M4** | **On-chain Call** | Relayer is updated to call the contract's `verifyAndRegister` function instead of the mock function. |

---

##  Phase 4: Production & Deployment (Week 4)
**Goal:** Move from Localhost to the Testnet.

| Member | Task | Action |
| :--- | :--- | :--- |
| **M1** | **UX/UI Polish** | Add loading states (ZK proofs take time). Add a "Success" dashboard showing the Nullifier hash. |
| **M2** | **Security Audit** | Test the circuit against "Replay Attacks." Ensure the $userWallet$ is bound to the proof. |
| **M3** | **Rate Limiting** | Add protection to the Relayer so one IP cannot drain the gas wallet. |
| **M4** | **Testnet Launch** | Deploy to **Polygon Amoy Testnet**. Verify the source code on Polygonscan. |

---

----
# Handshakes ( more clearly )

## 🤝 The M1 + M2 Handshake: Connecting AI & Cryptography

This document explains how the **AI/Frontend (Member 1)** and the **Cryptography/ZK (Member 2)** modules merge to create a secure, private biometric proof.

---

## 🎭 The Analogy
* **Member 2 (The Factory Designer):** Builds the high-tech machinery (the ZK Circuit) that knows how to process secrets safely.
* **Member 1 (The Operator):** Takes that machinery and puts it into the user's hands (the Browser) to run it.

---

## 🧩 The "Black Boxes" (The Files)
After Member 2 finishes writing the `circuit.circom` file, they compile it into two specific files that must be handed over to Member 1:

1.  **The `.wasm` File (The Logic):** * **What it is:** The "Brain" of the circuit.
    * **Job:** It runs in the user's browser to calculate every intermediate mathematical value (the "witness") required for the proof.
2.  **The `.zkey` File (The Proving Key):** * **What it is:** A cryptographic key file.
    * **Job:** It contains the specific mathematical "ingredients" needed to wrap that logic into a secure, zero-knowledge proof that the blockchain can trust.

---

## 🤝 How it Works (Step-by-Step)



1.  **Biometric Capture:** Member 1's code scans the user's face and generates a `Secret_ID` (e.g., `550e8400-e29b...`).
2.  **Local Environment:** Member 1 loads a library called `snarkjs` in the browser.
3.  **The Proving Process:** Member 1 feeds three specific items into `snarkjs`:
    * **The Input:** The user's `Secret_ID`.
    * **The Brain:** Member 2's `.wasm` file.
    * **The Key:** Member 2's `.zkey` file.
4.  **The Result:** `snarkjs` processes these *locally* on the user's computer to output a `proof.json`.

> **⚠️ Crucial Point:** Alice's `Secret_ID` never leaves her browser. Because Member 1 runs Member 2's files locally, the secret is used to make the proof, and then the secret is discarded. Only the finished **Proof** is sent to the internet.

---

## 💻 Implementation (For Member 1)

Member 1 places the files in the `public/` folder of the React/Next.js app. The code for the handshake looks like this:

```javascript
import * as snarkjs from "snarkjs";

async function generateProof(secretID) {
    // Member 1 calls Member 2's logic here
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { secret: secretID },          // Private data from AI
        "/circuits/privacy.wasm",      // Brain from Member 2
        "/circuits/privacy_final.zkey" // Key from Member 2
    );

    console.log("Proof generated locally!");
    return { proof, publicSignals };
```

# 🤝 Handshake 1: M2 + M4 (The "Verification Link")

This document details the critical integration between the **Cryptographer (Member 2)** and the **Blockchain Lead (Member 4)**. This link is what allows the blockchain to trust off-chain biometric data without ever seeing the raw data itself.

---

## 🧐 The Concept
In this handshake, we connect high-level mathematics to a Smart Contract. **Member 2** builds the "Lie Detector" (The Circuit), and **Member 4** installs that detector into the "Vault" (The Blockchain).

---

## 🛠️ The Process: From Math to Code

### 1. The Export (Action by Member 2)
Once the ZK-SNARK circuit is finalized and the "Trusted Setup" is complete, Member 2 runs a specialized command to translate their math into a language the blockchain understands (Solidity):

```bash
snarkjs zkey export solidityverifier privacy_final.zkey Verifier.sol
```

### 2. The Delivery (Action by Member 2)

Member 2 provides the generated Verifier.sol file to Member 4. This file contains a complex function called verifyProof which uses elliptic curve pairings to check if the ZK proof is valid.

### 3. The Integration (Action by Member 4)

Member 4 imports this file into the main protocol contract. They do not need to understand the 500+ lines of math inside Verifier.sol; they only need to call the interface.

### 💻 The Implementation

Member 4 writes the main logic in PrivacyShield.sol:

```Solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// M4 imports the file provided by M2
import "./Verifier.sol";

contract PrivacyShield is Verifier {
    mapping(address => bool) public isVerified;
    mapping(uint256 => bool) public usedNullifiers;

    /**
     * @dev Handshake function to register a user via ZK Proof
     * @param a, b, c The three components of the Groth16 ZK-Proof
     * @param input The public signals (like the Nullifier)
     */
    function registerUser(
        uint[2] calldata a, 
        uint[2][2] calldata b, 
        uint[2] calldata c, 
        uint[1] calldata input
    ) public {
        // 1. THE HANDSHAKE: Call the logic Member 2 provided
        // This function returns true only if the math is perfect
        require(verifyProof(a, b, c, input), "PrivacyShield: Invalid ZK Proof");

        // 2. Double-Registration Check
        uint256 nullifier = input[0];
        require(!usedNullifiers[nullifier], "PrivacyShield: Identity already used");

        // 3. Finalize
        isVerified[msg.sender] = true;
        usedNullifiers[nullifier] = true;
    }
}
```
Role -> Responsibility

Member 2 (Cryptographer) -> Ensure the Verifier.sol is exported correctly and matches the .zkey used by Member 1.

Member 4 (Blockchain Lead)-> Ensure the registerUser function correctly maps inputs and handles the logic after verification.

## ⭐ Key Insight:
 Member 4 acts as the "Secure Enforcer." They don't care how the math works, only that verifyProof returns true. This separation of concerns allows the team to work in parallel without being experts in each other's fields.

 # 🤝 Handshake 2: M3 + M4 (The "Gasless Delivery")

This document details the integration between the **Relay Engineer (Member 3)** and the **Blockchain Lead (Member 4)**. This handshake is the "User Experience" bridge that allows users to interact with the blockchain for free.

---

## ⛽ The Problem: The "Gas" Barrier
Normally, a user like Alice would need to pay transaction fees (Gas) to register her identity on-chain. However, a new user with a fresh biometric ID likely has **0 ETH** in their wallet. Without this handshake, the project would be impossible for new users to use.

---

## 🛠️ The Process: Sponsorship & Execution

### 1. The Manual (Action by Member 4)
Member 4 provides two critical pieces of information to Member 3:
* **Contract Address:** Where the logic lives on the network.
* **ABI (Application Binary Interface):** The "Instruction Manual" that tells the Relayer exactly how to format the data so the contract understands it.

### 2. The Sponsorship (Action by Member 3)
Member 3 builds a Node.js server (The Relayer). This server holds a private key for a "Gas Wallet" that has been pre-funded with ETH/MATIC. 

### 3. The Handshake (Logic Flow)
When Member 1 (Frontend) sends a proof, the following sequence occurs:
1.  **Member 3** receives the proof via a POST request.
2.  **Member 3** uses the **ABI** and **Address** from Member 4 to create a contract instance.
3.  **Member 3** signs the transaction and pays the gas.

---

## 💻 The Implementation



**Member 3** writes the following logic in the Relayer backend using `ethers.js`:

```javascript
const { ethers } = require("ethers");

// Information provided by Member 4
const CONTRACT_ADDRESS = "0x..."; 
const CONTRACT_ABI = [...]; // The ABI from Member 4

// Relayer's private wallet (Funded with Gas)
const relayerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// The Handshake Connection
const shieldContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, relayerWallet);

async function handleRelayRequest(zkProof) {
    try {
        console.log("Relaying proof to blockchain...");

        // THE HANDSHAKE: Calling the function M4 designed
        const tx = await shieldContract.registerUser(
            zkProof.a, 
            zkProof.b, 
            zkProof.c, 
            zkProof.inputs
        );

        // Waiting for the blockchain to confirm
        const receipt = await tx.wait();
        console.log("Handshake Successful! Transaction Hash:", receipt.transactionHash);
        
        return { success: true, hash: receipt.transactionHash };
    } catch (error) {
        console.error("Handshake Failed:", error);
        return { success: false, error: error.message };
    }
}
```

# 🤝 Handshake: M1 ↔ M3 (The "Meta-Transaction")

This document details the interaction between the **UI/AI Architect (Member 1)** and the **Relay Engineer (Member 3)**. This is officially known as a **Meta-Transaction** or **Gasless Transaction** flow.

---

## 🧐 The Concept: The "Courier" Model
In a standard app, the user sends data directly to the blockchain. In Privacy Shield, the user (M1) gives their proof to a "Courier" (M3), who then delivers it to the blockchain. This allows the user to stay anonymous and avoid paying gas fees.

---

## 🛠️ The Process: Local Proof to API Request

### 1. Preparation (Action by Member 1)
Alice’s browser generates the ZK Proof using the biometric data. Member 1 now has a JSON object containing:
* **The Proof:** (The `a`, `b`, and `c` components).
* **Public Signals:** (The `Nullifier` and any other public data).

### 2. The Request (M1 → M3)
Alice does **not** interact with the blockchain. Instead, Member 1 sends a standard HTTPS POST request to Member 3’s server.

**Handshake Payload Example:**
```json
{ 
  "proof": { "a": [...], "b": [...], "c": [...] }, 
  "nullifier": "0x123abc...", 
  "userAddress": "0xAliceWalletAddress..." 
}
```
### 3. The Reception & Gatekeeping (Action by Member 3)
Member 3’s Relayer receives this data. Before spending any money on gas, the Relayer performs two checks:

- Validation: It ensures the proof is formatted correctly and isn't empty.

- Rate Limiting: It ensures one user isn't spamming the API to drain the Relayer’s gas wallet.

### ❓ Why do we need this Handshake?
1. The "Empty Wallet" Problem: Most new users won't have MATIC or ETH. This handshake allows them to use the app immediately without going to an exchange.

2. Privacy Leak Prevention: If Alice paid for her own transaction, her wallet would be linked to her biometric ID on-chain. By using a Relayer, the Relayer's wallet shows up as the "Payer," providing Alice with a layer of anonymity.


### 💻 The Implementation

### Member 1 (Frontend) writes the sender:

 ```javascript
 const response = await axios.post("[https://relayer.privacy-shield.com/relay](https://relayer.privacy-shield.com/relay)", {
    proof: zkProof,
    nullifier: publicSignals[0],
    userAddress: userAccount
});
console.log("Transaction Hash:", response.data.txHash);
```

### Member 3 (Relayer) writes the receiver:
```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/relay', async (req, res) => {
    const { proof, nullifier, userAddress } = req.body;
    
    // M3 then executes the M3+M4 handshake to push to blockchain
    const tx = await sendToBlockchain(proof, nullifier, userAddress);
    res.send({ success: true, txHash: tx.hash });
});
```

### ⭐ Big Picture: This handshake turns a complex blockchain interaction into a simple "Submit" button for the user.
----

## 🛠️ How to Connect 

1.  **Frontend -> Relayer:** Use `axios.post('URL', { proof, publicSignals })`.
2.  **Relayer -> Contract:** Use `ethers.Contract(address, abi, wallet).register(a, b, c, input)`.
3.  **Circuit -> Contract:** The `verifier.sol` generated by Circom is a library. The main contract calls it using `verifier.verifyProof(...)`.

---

### A phase is complete when:
1.  **Code is merged** into the main branch.
2.  **A live demo** of that phase's goal is shown to the Team Lead.
3.  **No hardcoded private keys** are found in the files (use `.env`).
