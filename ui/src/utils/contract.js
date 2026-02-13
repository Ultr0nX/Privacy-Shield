/* eslint-disable no-undef */
import { ethers } from "ethers";

const ABI = [
    {
        "type": "function",
        "name": "isRegistered",
        "inputs": [
            {
                "name": "_identityCommitment",
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
        "name": "registerUser",
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
        "name": "walletRegistered",
        "inputs": [
            {
                "name": "",
                "type": "address",
                "internalType": "address"
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
        "name": "UserRegistered",
        "inputs": [
            {
                "name": "user",
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
    }
];

const CONTRACT_ADDRESS = "0xf73001eea8d0056Ff129C75B5a806B35Dc1C843C";

export const registerOnChain = async (signer, commitment) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  try {
    const bigIntCommitment = window.BigInt(commitment);
    const tx = await contract.registerUser(bigIntCommitment);
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
    const isReg = await contract.isRegistered(window.BigInt(commitment));
    return isReg;
  } catch (error) {
    console.error("Contract query error:", error);
    throw error;
  }
};