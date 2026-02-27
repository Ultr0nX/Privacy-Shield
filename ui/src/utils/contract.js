/* eslint-disable no-undef */
import { ethers } from "ethers";

const ABI = [
    {
        "type": "function",
        "name": "registerIdentity",
        "inputs": [
            {
                "name": "_identityCommitment",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [],
        "stateMutability": "nonpayable"
    },
    {
        "type": "function",
        "name": "registeredIdentities",
        "inputs": [
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "function",
        "name": "usedNullifiers",
        "inputs": [
            {
                "name": "",
                "type": "uint256",
                "internalType": "uint256"
            }
        ],
        "outputs": [
            {
                "name": "",
                "type": "bool",
                "internalType": "bool"
            }
        ],
        "stateMutability": "view"
    },
    {
        "type": "event",
        "name": "IdentityRegistered",
        "inputs": [
            {
                "name": "wallet",
                "type": "address",
                "indexed": true,
                "internalType": "address"
            },
            {
                "name": "identityCommitment",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    },
    {
        "type": "event",
        "name": "ActionVerified",
        "inputs": [
            {
                "name": "nullifier",
                "type": "uint256",
                "indexed": true,
                "internalType": "uint256"
            },
            {
                "name": "timestamp",
                "type": "uint256",
                "indexed": false,
                "internalType": "uint256"
            }
        ],
        "anonymous": false
    }
];

const CONTRACT_ADDRESS = "0x54961E44f92b9CB64c5B8506163245ca76BefFCF";

export const registerOnChain = async (signer, commitment) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  try {
    const bigIntCommitment = window.BigInt(commitment);
    const tx = await contract.registerIdentity(bigIntCommitment);
    console.log("Transaction Sent:", tx.hash);
    await tx.wait();
    return tx.hash;
  } catch (error) {
    console.error("Blockchain registration failed:", error);
    throw error;
  }
};

export const checkRegistrationStatus = async (signer, commitment) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  try {
    // Explicit BigInt conversion for the query
    const isReg = await contract.registeredIdentities(window.BigInt(commitment));
    return isReg;
  } catch (error) {
    console.error("Contract query error:", error);
    throw error;
  }
};