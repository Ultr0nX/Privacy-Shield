# 🚀 Privacy Shield Relayer

The **Relayer** is a critical component of the Privacy Shield protocol that enables **gasless meta-transactions**. It receives zero-knowledge proofs from the UI and submits them to the blockchain, paying the gas fees on behalf of users.

## 🎯 Purpose

1. **Gas Abstraction**: New users can verify their identity without needing ETH/MATIC
2. **Privacy Enhancement**: The relayer's wallet appears as the transaction sender, not the user's biometric wallet
3. **Bridge Layer**: Connects the client-side proof generation with on-chain verification

## 🏗️ Architecture

```
UI (Port 3000) → Relayer (Port 3001) → Blockchain (RPC)
     ↓                  ↓                      ↓
  ZK Proof      Validation & Signing    Smart Contract
```

## 🛠️ Tech Stack

- **Web Framework**: Axum (async Rust web framework)
- **Blockchain Client**: Ethers-rs (Ethereum interaction)
- **Runtime**: Tokio (async runtime)
- **Serialization**: Serde (JSON handling)

## 📦 Installation

1. **Install Rust** (if not already installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Setup environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build the project**:
   ```bash
   cargo build --release
   ```

## 🚀 Running the Relayer

### Development Mode
```bash
cargo run
```

### Production Mode
```bash
cargo run --release
```

The relayer will start on `http://127.0.0.1:3001`

## 🔌 API Endpoints

### Health Check
```bash
GET /
```

**Response**:
```json
{
  "status": "ok",
  "service": "Privacy Shield Relayer",
  "version": "0.1.0"
}
```

### Relay Proof
```bash
POST /relay
Content-Type: application/json

{
  "proof": "this-is-a-dummy-proof",
  "nullifier": "123456"
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Proof successfully relayed to blockchain",
  "tx_hash": "0x1234..."
}
```

**Response** (Error):
```json
{
  "success": false,
  "message": "Failed to relay proof: <error details>",
  "tx_hash": null
}
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Blockchain RPC endpoint | `http://127.0.0.1:8545` |
| `PRIVATE_KEY` | Relayer wallet private key | Anvil test key |
| `CONTRACT_ADDRESS` | PrivacyShield contract address | `0x5FbDB...` |

### Local Development Setup

1. **Start a local blockchain** (e.g., Anvil):
   ```bash
   anvil
   ```

2. **Deploy contracts** (from contracts directory):
   ```bash
   cd ../contracts/privacy-shield
   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   ```

3. **Update `.env`** with the deployed contract address

4. **Start the relayer**:
   ```bash
   cargo run
   ```

5. **Start the UI** (from ui directory):
   ```bash
   cd ../../ui
   npm start
   ```

## 🧪 Testing

Test the relayer with curl:

```bash
# Health check
curl http://localhost:3001/

# Submit mock proof
curl -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d '{
    "proof": "mock-proof-data",
    "nullifier": "123456"
  }'
```

## 📊 Development Phases

### ✅ Phase 1 (Current)
- [x] Basic web server with CORS
- [x] Mock proof handling
- [x] Simulated blockchain interaction
- [x] Health check endpoint

### 🔜 Phase 2 (Next)
- [ ] Parse real ZK proof structure (a, b, c components)
- [ ] Actual transaction signing and submission
- [ ] Gas estimation and optimization
- [ ] Transaction receipt handling

### 🔜 Phase 3 (Integration)
- [ ] Rate limiting (prevent gas wallet drainage)
- [ ] Request validation (proof format checking)
- [ ] Error handling improvements
- [ ] Monitoring and logging

### 🔜 Phase 4 (Production)
- [ ] Testnet deployment
- [ ] Database for tracking submissions
- [ ] Admin dashboard
- [ ] Security hardening

## 🔒 Security Considerations

1. **Private Key Management**: 
   - Never commit `.env` to version control
   - Use hardware wallets or key management services in production
   - Rotate keys regularly

2. **Rate Limiting**: 
   - Prevent abuse and gas wallet drainage
   - Implement IP-based or proof-based throttling

3. **Validation**:
   - Verify proof format before submission
   - Check for duplicate submissions
   - Validate nullifier ranges

## 🐛 Troubleshooting

### Connection Refused
- Ensure the blockchain node is running
- Check `RPC_URL` in `.env`

### Invalid Private Key
- Verify the format (should start with `0x`)
- Ensure it's a valid 64-character hex string

### Contract Not Found
- Verify the contract is deployed
- Check `CONTRACT_ADDRESS` matches deployment

## 📝 Logs

The relayer uses structured logging:
- `🚀` Startup messages
- `✅` Successful operations
- `📨` Incoming requests
- `🔗` Blockchain interactions
- `❌` Errors

## 🤝 Integration with Other Modules

- **M1 (UI)**: Receives proofs via POST to `/relay`
- **M2 (ZK)**: Will parse real proof format in Phase 2+
- **M4 (Contracts)**: Calls `verify()` function on PrivacyShield

## 📚 Resources

- [Axum Documentation](https://docs.rs/axum/)
- [Ethers-rs Book](https://gakonst.com/ethers-rs/)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
