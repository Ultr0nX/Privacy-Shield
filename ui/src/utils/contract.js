/* eslint-disable no-undef */
import { ethers } from "ethers";

const ABI = [
  // ── registration ────────────────────────────────────────────────────────────
  {
    "type": "function",
    "name": "registerIdentity",
    "inputs": [
      { "name": "userWallet",  "type": "address", "internalType": "address"  },
      { "name": "commitment",  "type": "uint256", "internalType": "uint256"  },
      { "name": "helperData",  "type": "bytes",   "internalType": "bytes"    }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  // ── cross-device recovery ────────────────────────────────────────────────────
  {
    "type": "function",
    "name": "getProfile",
    "inputs": [
      { "name": "userWallet", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "commitment",  "type": "uint256", "internalType": "uint256" },
      { "name": "helperData",  "type": "bytes",   "internalType": "bytes"   },
      { "name": "exists",      "type": "bool",    "internalType": "bool"    }
    ],
    "stateMutability": "view"
  },
  // ── status checks ────────────────────────────────────────────────────────────
  {
    "type": "function",
    "name": "registeredIdentities",
    "inputs":  [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "bool",    "internalType": "bool"    }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isRegistered",
    "inputs":  [{ "name": "_commitment", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "",            "type": "bool",    "internalType": "bool"    }],
    "stateMutability": "view"
  },
  // ── events ───────────────────────────────────────────────────────────────────
  {
    "type": "event",
    "name": "IdentityRegistered",
    "inputs": [
      { "name": "registrant",  "type": "address", "indexed": true,  "internalType": "address" },
      { "name": "commitment",  "type": "uint256", "indexed": true,  "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ActionVerified",
    "inputs": [
      { "name": "nullifier", "type": "uint256", "indexed": true,  "internalType": "uint256" },
      { "name": "user",      "type": "address", "indexed": true,  "internalType": "address" }
    ],
    "anonymous": false
  }
];

export const CONTRACT_ADDRESS = "0x99C9aBccAF1aed42Db8eE5e07d313EF8A470c79B";

// ── write helpers (go through relayer — user pays no gas) ────────────────────

export const checkRegistrationStatus = async (signer, commitment) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  try {
    return await contract.registeredIdentities(window.BigInt(commitment));
  } catch (error) {
    console.error("Contract query error:", error);
    throw error;
  }
};

// ── read helpers (direct RPC — no gas, no relayer needed) ───────────────────

/**
 * Fetch the on-chain identity profile for cross-device recovery.
 * Uses the MetaMask provider (read-only, no gas, no transaction).
 *
 * @param  {string} walletAddress  User's Ethereum address (checksummed or lowercase).
 * @returns {{ commitment: string, helperDataHex: string } | null}
 */
export const getProfileFromChain = async (walletAddress) => {
  if (!window.ethereum) {
    throw new Error("No Web3 provider available");
  }
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const [commitment, helperData, exists] = await contract.getProfile(walletAddress);
    if (!exists) return null;
    // ethers v5 returns Solidity `bytes` as a hex string (e.g. "0x1234...")
    return {
      commitment:    commitment.toString(),
      helperDataHex: helperData,   // already 0x-prefixed hex
    };
  } catch (error) {
    console.error("getProfile chain query failed:", error);
    throw error;
  }
};
