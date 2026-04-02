//@info: axum is used for building the http server and handling requests
use axum::{
    extract::{Path, State},
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
//@info: ethers-rs is used for interacting with the ethereum blockchain,sending transactions,and calling contract functions
use ethers::{
    contract::abigen,
    middleware::SignerMiddleware,
    prelude::*,
    providers::{Http, Provider},
    signers::{LocalWallet, Signer},
    types::{Address, U256},
};
//@info: serde is used for serializing and deserializing json data in request and response payloads
use serde::{Deserialize, Serialize};
//@info: dotenv is used loading environment variables from a .env file for configuration
use std::{net::SocketAddr, str::FromStr, sync::Arc, time::{SystemTime, UNIX_EPOCH}};
use tokio::sync::Mutex;
//@info: tower-http is used for handling cors(cross-origin resource sharing) to allow requests from the fronned ui
use tower_http::cors::{Any, CorsLayer};
//@info: tracing is used for logging important events and errors in the  relayer for better visiibility and debugging
use tracing::{error, info};

//@info: Request payload from the UI (matches data.jsonc format)
#[derive(Debug, Deserialize, Serialize)]
struct ProofRequest {
    proof: Groth16Proof,
    #[serde(rename = "publicSignals")]
    public_signals: Vec<String>,
}

//@info: Registration request payload
#[derive(Debug, Deserialize, Serialize)]
struct RegistrationRequest {
    #[serde(rename = "identityCommitment")]
    identity_commitment: String,
    /// 96-byte packed helper data: 64 B XOR bits + 32 B SHA-256(randomSecret).
    /// Required for /register, absent for /check-registration.
    #[serde(rename = "helperData", default)]
    helper_data: Option<String>,
    /// The user's Ethereum address (checksummed or lowercase).
    /// Required for /register, absent for /check-registration.
    #[serde(rename = "userWallet", default)]
    user_wallet: Option<String>,
}

//@info: Groth16 proof structure from Circom
#[derive(Debug, Deserialize, Serialize)]
struct Groth16Proof {
    pi_a: Vec<String>,      // ["0x123...", "0x456...", "1"]
    pi_b: Vec<Vec<String>>, // [["0xa", "0xb"], ["0xc", "0xd"], ["1", "0"]]
    pi_c: Vec<String>,      // ["0x789...", "0x012...", "1"]
}

//@info: Response payload to display result of relay or registration attempts back to the UI
#[derive(Debug, Serialize)]
struct RelayResponse {
    success: bool,
    message: String,
    tx_hash: Option<String>,
}

//@info: A single logged replay attack attempt (reverted verify transaction)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReplayAttempt {
    wallet: String,
    nullifier: String,
    tx_hash: String,
    timestamp_ms: u64,
    block: u64,
    reason: String,
}

const REPLAY_LOG_FILE: &str = "replay_attempts.json";

fn load_replay_log() -> Vec<ReplayAttempt> {
    std::fs::read_to_string(REPLAY_LOG_FILE)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

async fn save_replay_log(log: &[ReplayAttempt]) {
    if let Ok(json) = serde_json::to_string_pretty(log) {
        let _ = tokio::fs::write(REPLAY_LOG_FILE, json).await;
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Application state
#[derive(Clone)]
struct AppState {
    //@info: ethers client is used for sending transactions and calling contract functions on the blockchain,it is wrapped in an arc for shared ownership across async handlers
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    contract_address: Address,
    replay_log: Arc<Mutex<Vec<ReplayAttempt>>>,
}

// Define the contract ABI for PrivacyShield
//@audit u can take directly from the compiled contract's ABI...
abigen!(
    PrivacyShield,
    r#"[
        function verifyAndExecute(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[4] calldata publicSignals) external
        function registerIdentity(address userWallet, uint256 commitment, bytes helperData) external
        function isRegistered(uint256 _identityCommitment) external view returns (bool)
        event IdentityRegistered(address indexed registrant, uint256 indexed commitment)
        event ActionVerified(uint256 indexed nullifier, address indexed user)
    ]
    "#,
);

//@info: what is the use of #[tokio::main] is a macro that sets up the asynchronous runtime for the application,allowing use to write async code in the main function and thoughout the application without needing to manually manage the runtime ...
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    // Load environment variables
    dotenv::dotenv().ok();

    info!("🚀 Starting Privacy Shield Relayer...");

    // Get configuration from environment
    //@audit i think we are using the sepolia tesnet 
    let rpc_url = std::env::var("RPC_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8545".to_string());
    let private_key = std::env::var("PRIVATE_KEY")
        .unwrap_or_else(|_| "0xYOUR_SEPOLIA_PRIVATE_KEY".to_string());
    if private_key == "0xYOUR_SEPOLIA_PRIVATE_KEY" {
        return Err(anyhow::anyhow!(
            "PRIVATE_KEY is not configured. Set a funded Sepolia wallet key in relayer/.env"
        ));
    }
    let contract_address_str = std::env::var("CONTRACT_ADDRESS")
        .unwrap_or_else(|_| "0x5FbDB2315678afecb367f032d93F642f64180aa3".to_string()); // Default first deployment

    // Setup provider
    let provider = Provider::<Http>::try_from(rpc_url.clone())?;
    info!("⏳ Connecting to RPC: {}", rpc_url);

    // Setup wallet
    let wallet = private_key.parse::<LocalWallet>()?;

    // Resolve chain_id safely.
    // Priority:
    // 1) RPC-reported chain id (authoritative)
    // 2) CHAIN_ID env var fallback (only when RPC query fails)
    let configured_chain_id = std::env::var("CHAIN_ID")
        .ok()
        .and_then(|value| value.parse::<u64>().ok());

    let chain_id = match provider.get_chainid().await {
        Ok(id) => {
            info!("✅ Connected to blockchain - Chain ID: {}", id);
            id.as_u64()
        }
        Err(e) => {
            if let Some(id) = configured_chain_id {
                info!("⚠️  Could not query chain id from RPC: {}", e);
                info!("⚠️  Falling back to CHAIN_ID from env: {}", id);
                id
            } else {
                return Err(anyhow::anyhow!(
                    "Failed to read chain id from RPC ({}) and CHAIN_ID is not set. Set CHAIN_ID in relayer/.env (e.g., 11155111 for Sepolia).",
                    e
                ));
            }
        }
    };
    
    let wallet = wallet.with_chain_id(chain_id);
    info!("✅ Wallet loaded: {:?}", wallet.address());

    // Create client
    let client = Arc::new(SignerMiddleware::new(provider, wallet));

    // Parse contract address
    let contract_address = Address::from_str(&contract_address_str)?;
    info!("✅ Contract address: {:?}", contract_address);

    // Load persisted replay log
    let replay_log = Arc::new(Mutex::new(load_replay_log()));
    info!("📋 Loaded {} replay attempt(s) from disk", replay_log.lock().await.len());

    // Create application state
    let app_state = AppState {
        client,
        contract_address,
        replay_log,
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
        .route("/register", post(register_identity))
        .route("/check-registration", post(check_registration))
        .route("/replay-attempts/:wallet", get(get_replay_attempts))
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
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("🔐 RELAY (VERIFY) REQUEST received");
    info!("   public signals count: {}", payload.public_signals.len());
    if payload.public_signals.len() >= 4 {
        info!("   [0] identityCommitment: {}...", &payload.public_signals[0].chars().take(18).collect::<String>());
        info!("   [1] app_address:        {}", payload.public_signals[1]);
        info!("   [2] user_wallet:        {}", payload.public_signals[2]);
        info!("   [3] nullifier:          {}...", &payload.public_signals[3].chars().take(18).collect::<String>());
    }
    info!("   pi_a[0] prefix: {}...", payload.proof.pi_a.first().map(|s| &s[..s.len().min(16)]).unwrap_or("?"));
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Extract wallet + nullifier before moving payload into submit fn
    let wallet_signal  = payload.public_signals.get(2).cloned().unwrap_or_default();
    let nullifier_signal = payload.public_signals.get(3).cloned().unwrap_or_default();

    match submit_to_blockchain(state.clone(), payload).await {
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
            let err_str = format!("{}", e);

            // Detect on-chain revert (nullifier already used → replay attack)
            if let Some(tx_hash) = err_str.strip_prefix("REVERTED:") {
                let tx_hash = tx_hash.to_string();
                let block   = err_str
                    .split(':').nth(2)
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);

                // Convert U256 wallet decimal → 0x-prefixed address string
                let wallet_addr = parse_hex_to_u256(&wallet_signal)
                    .map(|w| format!("0x{:040x}", w))
                    .unwrap_or(wallet_signal.clone());

                let attempt = ReplayAttempt {
                    wallet:       wallet_addr,
                    nullifier:    nullifier_signal,
                    tx_hash:      tx_hash.clone(),
                    timestamp_ms: now_ms(),
                    block,
                    reason:       "nullifier_already_used".to_string(),
                };

                info!("🚨 REPLAY ATTACK BLOCKED — wallet: {}, tx: {}", attempt.wallet, tx_hash);

                let mut log = state.replay_log.lock().await;
                log.push(attempt);
                save_replay_log(&log).await;
                drop(log);

                return (
                    StatusCode::OK,
                    Json(RelayResponse {
                        success: false,
                        message: "Proof rejected: nullifier already used — replay attack blocked".to_string(),
                        tx_hash: Some(tx_hash),
                    }),
                );
            }

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

// Register identity endpoint
async fn register_identity(
    State(state): State<AppState>,
    Json(payload): Json<RegistrationRequest>,
) -> impl IntoResponse {
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("📝 REGISTER REQUEST received");
    info!("   userWallet:    {}", payload.user_wallet.as_deref().unwrap_or("<missing>"));
    info!("   commitment:    {}", payload.identity_commitment);
    info!("   helperData:    {} chars, prefix: {}...",
        payload.helper_data.as_deref().map(|s| s.len()).unwrap_or(0),
        payload.helper_data.as_deref().unwrap_or("").chars().take(18).collect::<String>());
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    match submit_registration(state, payload).await {
        Ok(tx_hash) => {
            info!("✅ Registration successful: {}", tx_hash);
            (
                StatusCode::OK,
                Json(RelayResponse {
                    success: true,
                    message: "Identity successfully registered on blockchain".to_string(),
                    tx_hash: Some(tx_hash),
                }),
            )
        }
        Err(e) => {
            error!("❌ Failed to register identity: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(RelayResponse {
                    success: false,
                    message: format!("Failed to register identity: {}", e),
                    tx_hash: None,
                }),
            )
        }
    }
}

// Check registration status endpoint
async fn check_registration(
    State(state): State<AppState>,
    Json(payload): Json<RegistrationRequest>,
) -> impl IntoResponse {
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("🔍 CHECK-REGISTRATION REQUEST received");
    info!("   commitment: {}...", &payload.identity_commitment.chars().take(20).collect::<String>());
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    match check_registration_status(state, payload).await {
        Ok(is_registered) => {
            info!("   result: registered={}", is_registered);
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "registered": is_registered,
                    "message": if is_registered { "Identity is registered" } else { "Identity not registered" }
                })),
            )
        }
        Err(e) => {
            error!("Failed to check registration: {:?}", e);
            let error_message = format!("{}", e).to_lowercase();
            let rpc_unavailable = error_message.contains("connection refused")
                || error_message.contains("tcp connect error")
                || error_message.contains("error sending request");

            if rpc_unavailable {
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "success": true,
                        "registered": false,
                        "message": "Blockchain RPC unavailable; treating identity as not registered"
                    })),
                )
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "success": false,
                        "error": format!("{}", e)
                    })),
                )
            }
        }
    }
}

// Submit registration to blockchain
async fn submit_registration(
    state: AppState,
    registration: RegistrationRequest,
) -> anyhow::Result<String> {
    info!("🔗 Submitting registration to blockchain...");

    let commitment = parse_hex_to_u256(&registration.identity_commitment)?;
    info!("📝 Identity commitment: {}", commitment);

    // Parse user wallet address
    let user_wallet_str = registration.user_wallet
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("userWallet is required for registration"))?;
    let user_wallet = Address::from_str(user_wallet_str)
        .map_err(|e| anyhow::anyhow!("Invalid user wallet address '{}': {}", user_wallet_str, e))?;
    info!("👤 User wallet: {:?}", user_wallet);

    // Decode helperData from hex string → raw bytes
    let helper_data_str = registration.helper_data
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("helperData is required for registration"))?;
    let helper_hex = helper_data_str.trim_start_matches("0x");
    let helper_bytes = decode_hex(helper_hex)
        .map_err(|e| anyhow::anyhow!("Invalid helperData hex: {}", e))?;
    if helper_bytes.len() != 96 {
        return Err(anyhow::anyhow!(
            "helperData must be 96 bytes, got {}",
            helper_bytes.len()
        ));
    }
    let helper_data = ethers::types::Bytes::from(helper_bytes);
    info!("📦 helperData: {} bytes", helper_data.len());

    // Create contract instance and call registerIdentity(userWallet, commitment, helperData)
    let contract = PrivacyShield::new(state.contract_address, state.client.clone());
    info!("📝 Calling registerIdentity on contract...");

    let tx_call   = contract.register_identity(user_wallet, commitment, helper_data)
        .gas(500_000u64);
    let pending_tx = tx_call.send().await?;

    info!("⏳ Transaction sent, waiting for confirmation...");
    let receipt = pending_tx.await?.ok_or_else(|| anyhow::anyhow!("Transaction dropped from mempool"))?;

    let tx_hash = format!("0x{:x}", receipt.transaction_hash);
    info!("✅ Registration confirmed on-chain!");
    info!("   tx_hash:  {}", tx_hash);
    info!("   gas used: {}", receipt.gas_used.unwrap_or_default());
    info!("   block:    {}", receipt.block_number.unwrap_or_default());

    Ok(tx_hash)
}

/// Decode a hex string (with or without 0x prefix) into bytes.
fn decode_hex(s: &str) -> anyhow::Result<Vec<u8>> {
    let s = s.trim_start_matches("0x");
    if s.len() % 2 != 0 {
        return Err(anyhow::anyhow!("Odd-length hex string"));
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|e| anyhow::anyhow!("Invalid hex byte at {}: {}", i, e))
        })
        .collect()
}

// Check registration status on blockchain
async fn check_registration_status(
    state: AppState,
    registration: RegistrationRequest,
) -> anyhow::Result<bool> {
    let commitment = parse_hex_to_u256(&registration.identity_commitment)?;
    
    // Create contract instance
    let contract = PrivacyShield::new(state.contract_address, state.client.clone());

    info!("🔍 Checking registration for commitment: {}", commitment);
    
    // Call the isRegistered view function on the contract
    let is_registered = contract.is_registered(commitment).call().await?;
    
    info!("✅ Registration status: {}", is_registered);
    
    Ok(is_registered)
}

// 

// Submit proof to blockchain
async fn submit_to_blockchain(
    state: AppState,
    proof_request: ProofRequest,
) -> anyhow::Result<String> {
    info!("🔗 Submitting to blockchain...");
    info!("📦 Received proof with {} public signals", proof_request.public_signals.len());

    // Parse the Groth16 proof components
    let (a, b, c) = parse_groth16_proof(&proof_request.proof)?;
    
    // Extract all 4 public signals: commitment, app_address, user_wallet, nullifier
    let commitment = parse_public_signal(&proof_request.public_signals, 0)?;
    let app_address = parse_public_signal(&proof_request.public_signals, 1)?;
    let user_wallet = parse_public_signal(&proof_request.public_signals, 2)?;
    let nullifier = parse_public_signal(&proof_request.public_signals, 3)?;
    let public_signals: [U256; 4] = [commitment, app_address, user_wallet, nullifier];

    info!("✅ Parsed proof — calling verifyAndExecute:");
    info!("   commitment:  {}", commitment);
    info!("   app_address: {}", app_address);
    info!("   user_wallet: {}", user_wallet);
    info!("   nullifier:   {}", nullifier);
    info!("   a[0]: {}...", format!("{}", a[0]).chars().take(20).collect::<String>());
    info!("   c[0]: {}...", format!("{}", c[0]).chars().take(20).collect::<String>());

    // Create contract instance
    let contract = PrivacyShield::new(state.contract_address, state.client.clone());

    info!("📝 Sending transaction to verifyAndExecute function on contract...");
    
    // Create the contract call
    let tx_call = contract.verify_and_execute(a, b, c, public_signals)
        .gas(800_000u64);

    // Send actual transaction with real proof data
    let pending_tx = tx_call.send().await?;
    
    info!("⏳ Transaction sent, waiting for confirmation...");
    
    // Wait for transaction receipt
    let receipt = pending_tx.await?.ok_or_else(|| anyhow::anyhow!("Transaction dropped from mempool"))?;
    
    let tx_hash   = format!("0x{:x}", receipt.transaction_hash);
    let block_num = receipt.block_number.unwrap_or_default().as_u64();
    let gas_used  = receipt.gas_used.unwrap_or_default();
    let status    = receipt.status.unwrap_or_default().as_u64();

    info!("📊 Gas used: {}", gas_used);
    info!("📦 Block number: {}", block_num);

    // status == 0 means the transaction was included but REVERTED on-chain
    if status == 0 {
        info!("🚨 Transaction REVERTED on-chain: {}", tx_hash);
        info!("   This is likely a replay attack — nullifier already used.");
        // Encode tx_hash and block into the error so relay_proof can log it
        return Err(anyhow::anyhow!("REVERTED:{}:{}", tx_hash, block_num));
    }

    info!("✅ Transaction confirmed: {}", tx_hash);

    // Log events emitted
    if !receipt.logs.is_empty() {
        info!("📢 Events emitted: {} logs", receipt.logs.len());
        for (i, log) in receipt.logs.iter().enumerate() {
            info!("   Log {}: {} topics", i, log.topics.len());
        }
    }

    Ok(tx_hash)
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

// GET /replay-attempts/:wallet — returns all logged replay attempts for a given wallet
async fn get_replay_attempts(
    State(state): State<AppState>,
    Path(wallet): Path<String>,
) -> impl IntoResponse {
    let wallet_lower = wallet.to_lowercase();
    let log = state.replay_log.lock().await;
    let attempts: Vec<&ReplayAttempt> = log
        .iter()
        .filter(|a| a.wallet.to_lowercase() == wallet_lower)
        .collect();
    info!("🔍 Replay attempts query for {} → {} result(s)", wallet_lower, attempts.len());
    Json(serde_json::json!({ "attempts": attempts }))
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
