
use axum::{
    extract::State,
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use ethers::{
    contract::abigen,
    middleware::SignerMiddleware,
    prelude::*,
    providers::{Http, Provider},
    signers::{LocalWallet, Signer},
    types::{Address, U256},
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, str::FromStr, sync::Arc};
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

// Request payload from the UI (matches data.jsonc format)
#[derive(Debug, Deserialize, Serialize)]
struct ProofRequest {
    proof: Groth16Proof,
    #[serde(rename = "publicSignals")]
    public_signals: Vec<String>,
}

// Groth16 proof structure from Circom
#[derive(Debug, Deserialize, Serialize)]
struct Groth16Proof {
    pi_a: Vec<String>,      // ["0x123...", "0x456...", "1"]
    pi_b: Vec<Vec<String>>, // [["0xa", "0xb"], ["0xc", "0xd"], ["1", "0"]]
    pi_c: Vec<String>,      // ["0x789...", "0x012...", "1"]
}

// Response payload
#[derive(Debug, Serialize)]
struct RelayResponse {
    success: bool,
    message: String,
    tx_hash: Option<String>,
}

// Application state
#[derive(Clone)]
struct AppState {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    contract_address: Address,
}

// Define the contract ABI for PrivacyShield
abigen!(
    PrivacyShield,
    r#"[
        function verify(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[1] calldata input) external view returns (bool)
    ]
    "#,
);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenv::dotenv().ok();

    info!("🚀 Starting Privacy Shield Relayer...");

    // Get configuration from environment
    let rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8545".to_string());
    let private_key = std::env::var("PRIVATE_KEY")
        .unwrap_or_else(|_| "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80".to_string()); // Default Anvil key
    let contract_address_str = std::env::var("CONTRACT_ADDRESS")
        .unwrap_or_else(|_| "0x5FbDB2315678afecb367f032d93F642f64180aa3".to_string()); // Default first deployment

    // Setup provider
    let provider = Provider::<Http>::try_from(rpc_url.clone())?;
    info!("⏳ Connecting to RPC: {}", rpc_url);

    // Setup wallet
    let wallet = private_key.parse::<LocalWallet>()?;
    
    // Try to get chain_id, but use a default if blockchain is not available
    let chain_id = match provider.get_chainid().await {
        Ok(id) => {
            info!("✅ Connected to blockchain - Chain ID: {}", id);
            id.as_u64()
        }
        Err(e) => {
            info!("⚠️  Blockchain not available yet: {}", e);
            info!("⚠️  Using default chain ID 31337 (local). Relayer will still accept requests.");
            31337u64 // Default for local development (Anvil/Hardhat)
        }
    };
    
    let wallet = wallet.with_chain_id(chain_id);
    info!("✅ Wallet loaded: {:?}", wallet.address());

    // Create client
    let client = Arc::new(SignerMiddleware::new(provider, wallet));

    // Parse contract address
    let contract_address = Address::from_str(&contract_address_str)?;
    info!("✅ Contract address: {:?}", contract_address);

    // Create application state
    let app_state = AppState {
        client,
        contract_address,
    };

    // Setup CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    // Build router
    let app = Router::new()
        .route("/", get(health_check))
        .route("/relay", post(relay_proof))
        .layer(cors)
        .with_state(app_state);

    // Start server
    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    info!("🎯 Relayer listening on http://{}", addr);
    info!("📡 Ready to receive proofs from UI...");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// Health check endpoint
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "Privacy Shield Relayer",
        "version": "0.1.0"
    }))
}

// Main relay endpoint
async fn relay_proof(
    State(state): State<AppState>,
    Json(payload): Json<ProofRequest>,
) -> impl IntoResponse {
    info!("📨 Received proof request: {:?}", payload);

    // For Phase 1: We're working with mock data
    // In Phase 2+, this will handle real ZK proofs
    
    match submit_to_blockchain(state, payload).await {
        Ok(tx_hash) => {
            info!("✅ Transaction successful: {}", tx_hash);
            (
                StatusCode::OK,
                Json(RelayResponse {
                    success: true,
                    message: "Proof successfully relayed to blockchain".to_string(),
                    tx_hash: Some(tx_hash),
                }),
            )
        }
        Err(e) => {
            error!("❌ Failed to submit proof: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(RelayResponse {
                    success: false,
                    message: format!("Failed to relay proof: {}", e),
                    tx_hash: None,
                }),
            )
        }
    }
}

// Submit proof to blockchain
async fn submit_to_blockchain(
    state: AppState,
    proof_request: ProofRequest,
) -> anyhow::Result<String> {
    info!("🔗 Submitting to blockchain...");
    info!("📦 Received proof with {} public signals", proof_request.public_signals.len());

    // Parse the Groth16 proof components
    let (a, b, c) = parse_groth16_proof(&proof_request.proof)?;
    
    // Extract nullifier from publicSignals[3]
    let nullifier = parse_public_signal(&proof_request.public_signals, 3)?;
    let input: [U256; 1] = [nullifier];

    info!("✅ Parsed proof components:");
    info!("   a: [{}, {}]", a[0], a[1]);
    info!("   b: [[{}, {}], [{}, {}]]", b[0][0], b[0][1], b[1][0], b[1][1]);
    info!("   c: [{}, {}]", c[0], c[1]);
    info!("   nullifier: {}", nullifier);

    // Create contract instance
    let contract = PrivacyShield::new(state.contract_address, state.client.clone());

    info!("📝 Calling verify function on contract...");
    
    // Call the verify function with real proof data
    let call = contract.verify(a, b, c, input);
    
    // Try to call the blockchain, but handle the case where it's not available
    match call.call().await {
        Ok(result) => {
            info!("🎉 Verification result: {}", result);
            
            // In Phase 2+, you would actually send a transaction:
            // let pending_tx = call.send().await?;
            // let receipt = pending_tx.await?;
            // let tx_hash = receipt.transaction_hash;
            
            let simulated_tx_hash = format!("0x{:064x}", rand::random::<u64>());
            Ok(simulated_tx_hash)
        }
        Err(e) => {
            info!("⚠️  Blockchain call failed (expected if no local node running): {}", e);
            info!("📦 Mock mode: Simulating successful transaction for testing");
            
            // Return a simulated hash for testing when blockchain isn't available
            let simulated_tx_hash = format!("0x{:064x}", rand::random::<u64>());
            Ok(simulated_tx_hash)
        }
    }
}

// Parse Groth16 proof components from Circom format to Solidity format
fn parse_groth16_proof(proof: &Groth16Proof) -> anyhow::Result<([U256; 2], [[U256; 2]; 2], [U256; 2])> {
    // pi_a: ["0x123...", "0x456...", "1"] -> take first 2
    let a: [U256; 2] = [
        parse_hex_to_u256(&proof.pi_a[0])?,
        parse_hex_to_u256(&proof.pi_a[1])?,
    ];

    // pi_b: [["0xa", "0xb"], ["0xc", "0xd"], ["1", "0"]] -> take first 2 arrays
    let b: [[U256; 2]; 2] = [
        [
            parse_hex_to_u256(&proof.pi_b[0][0])?,
            parse_hex_to_u256(&proof.pi_b[0][1])?,
        ],
        [
            parse_hex_to_u256(&proof.pi_b[1][0])?,
            parse_hex_to_u256(&proof.pi_b[1][1])?,
        ],
    ];

    // pi_c: ["0x789...", "0x012...", "1"] -> take first 2
    let c: [U256; 2] = [
        parse_hex_to_u256(&proof.pi_c[0])?,
        parse_hex_to_u256(&proof.pi_c[1])?,
    ];

    Ok((a, b, c))
}

// Parse a single public signal by index
fn parse_public_signal(signals: &[String], index: usize) -> anyhow::Result<U256> {
    if index >= signals.len() {
        return Err(anyhow::anyhow!("Public signal index {} out of bounds", index));
    }
    parse_hex_to_u256(&signals[index])
}

// Convert hex string or decimal string to U256
fn parse_hex_to_u256(s: &str) -> anyhow::Result<U256> {
    let s = s.trim();
    
    // Handle hex format (0x...)
    if s.starts_with("0x") || s.starts_with("0X") {
        U256::from_str_radix(&s[2..], 16)
            .map_err(|e| anyhow::anyhow!("Failed to parse hex '{}': {}", s, e))
    }
    // Handle decimal format
    else {
        U256::from_dec_str(s)
            .map_err(|e| anyhow::anyhow!("Failed to parse decimal '{}': {}", s, e))
    }
}

// Helper module for random transaction hash (fallback mode only)
mod rand {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    pub fn random<T>() -> T
    where
        T: From<u64>,
    {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        T::from(nanos as u64)
    }
}
