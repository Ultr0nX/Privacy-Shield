import { ethers } from "ethers";

// Sepolia Testnet Hex Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7"; 

export const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install it to continue.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  
  // Request account access
  await window.ethereum.request({ method: "eth_requestAccounts" });
  
  const network = await provider.getNetwork();
  
  // Check if current chain is NOT Sepolia (11155111)
  if (network.chainId.toString() !== "11155111") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (err) {
      // If Sepolia is not added to MetaMask, add it automatically
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: SEPOLIA_CHAIN_ID,
            chainName: "Sepolia Test Network",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          }],
        });
      } else {
        throw new Error("Please switch to the Sepolia Test Network.");
      }
    }
  }

  const signer = await provider.getSigner();
  return { address: await signer.getAddress(), signer };
};