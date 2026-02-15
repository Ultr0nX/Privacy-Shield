# Quick Setup Guide

## Prerequisites
- Node.js, Rust, Foundry (forge/anvil) installed

## 1. Start Local Blockchain
```bash
anvil
```
Leave this running. It starts Ethereum node on `http://127.0.0.1:8545`

## 2. Deploy Smart Contracts
Open new terminal:
```bash
cd contracts/privacy-shield
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```
Note the deployed contract addresses from output.

## 3. Configure Relayer
Update `relayer/.env` with your PrivacyShield contract address:
```bash
CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

## 4. Start Relayer
```bash
cd relayer
cargo run --release
```
Runs on `http://localhost:3001`

## 5. Start UI
```bash
cd ui
npm install
npm start
```
Opens browser at `http://localhost:3000`

---

**Done!** Connect wallet, scan face, and verify identity.
