import React, { useState, useEffect } from "react";
import FaceScanner from "./components/FaceScanner";
import { useBiometric } from "./hooks/useBiometric";
import { useWallet } from "./hooks/useWallet";
import { useRegistration } from "./hooks/useRegistration";
import { generateProof, calculateNullifier, prepareCircuitInputs, formatProofForChain } from "./services/proofService";
import { submitProof } from "./services/relayerService";

export default function App() {
  // Custom hooks for separated concerns
  const wallet = useWallet();
  const biometric = useBiometric(20); // 20 frames threshold
  const registration = useRegistration(biometric.commitment);
  
  // Local UI state
  const [started, setStarted] = useState(false);
  const [appAddress, setAppAddress] = useState("");
  const [proof, setProof] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("Idle");
  
  // Initialize biometric processor on mount
  useEffect(() => {
    biometric.initializePoseidon();
  }, []);

  const handleConnect = async () => {
    try {
      const { address, signer: userSigner } = await connectWallet();
      setAccount(address);
      setSigner(userSigner);
      setStatus("Wallet Connected");
    } catch (err) {
      alert(err.message);
    }
  };

  const formatForVerifier = (proof, publicSignals) => {
    const p = proof;
    const s = publicSignals;
    
    // This format is what most Solidity verifiers expect: [a, b, c, signals]
    const formatted = [
      p.pi_a[0], p.pi_a[1],
      p.pi_b[0][1], p.pi_b[0][0], p.pi_b[1][1], p.pi_b[1][0],
      p.pi_c[0], p.pi_c[1],
      ...s
    ];
    
    console.log("📋 COPY THIS TO VERIFIER:", JSON.stringify(formatted));
    return formatted;
  };

  const handleRegister = async () => {
    if (!commitment) {
      alert("⚠️ No identity commitment found. Please scan your face first.");
      return;
    }
    
    setStatus("📝 Registering Identity on Blockchain...");
    
    try {
      const response = await fetch('http://localhost:3001/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityCommitment: commitment })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setStatus("✅ Successfully Registered!");
        setIsRegistered(true);
        setTxHash(result.tx_hash);
        alert(`✅ Identity Registered!\n\nTransaction: ${result.tx_hash}`);
      } else {
        setStatus(`❌ Registration Failed: ${result.message}`);
        alert(`Registration Failed\n\n${result.message}`);
      }
    } catch (err) {
      setStatus("❌ Registration Failed");
      console.error("Registration error:", err);
      alert(`Registration Error\n\n${err.message}`);
    }
  };

  /**
   * FIX: handleLandmarks now performs double-hashing
   * secretId = Poseidon(biometric_ratios)
   * commitment = Poseidon(secretId)
   */
  const handleLandmarks = async (landmarks) => {
    if (verified || !account || !landmarks) return;
    
    // Safety check to prevent the 'width' of null error
    try {
      const ratios = getRatios(landmarks);
      bufferRef.current.push(ratios);
      setProgress(Math.min(100, Math.floor((bufferRef.current.length / SCAN_THRESHOLD) * 100)));

      if (bufferRef.current.length >= SCAN_THRESHOLD) {
        setStatus("Finalizing Identity...");
        if (!poseidonRef.current) poseidonRef.current = await initPoseidon();

        const avgRatios = bufferRef.current[0].map((_, i) => 
          bufferRef.current.reduce((sum, row) => sum + row[i], 0) / bufferRef.current.length
        );

        const quantizedRatios = quantize(avgRatios);
        
        // 1. First Hash: Condensed Biometrics into one Private Secret
        const firstHash = poseidonRef.current(quantizedRatios);
        const privateSecret = poseidonRef.current.F.toString(firstHash);
        
        // 2. Second Hash: Secret into Public Commitment (matches circuit logic)
        // IMPORTANT: Keep as BigInt field element, not string
        const secondHash = poseidonRef.current([firstHash]);
        const publicCommitment = poseidonRef.current.F.toString(secondHash);

        setSecretId(privateSecret);
        setCommitment(publicCommitment);
        setVerified(true);
        setStatus("✅ Biometric Identity Captured");
        
        // Check registration status after capturing identity
        checkRegistration(publicCommitment);
      }
    } catch (err) {
      console.warn("Frame skipped:", err.message);
    }
  };

  /**
   * Check if identity is already registered on-chain
   */
  const checkRegistration = async (commitmentValue) => {
    setCheckingRegistration(true);
    setStatus("🔍 Checking Registration Status...");
    
    try {
      const response = await fetch('http://localhost:3001/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityCommitment: commitmentValue })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setIsRegistered(result.registered);
        setStatus(result.registered 
          ? "✅ Identity Already Registered" 
          : "📝 Please Register Your Identity"
        );
      } else {
        console.error("Registration check failed:", result.error);
        setStatus("⚠️ Could not verify registration status");
      }
    } catch (err) {
      console.error("Failed to check registration:", err);
      setStatus("⚠️ Could not verify registration status");
    } finally {
      setCheckingRegistration(false);
    }
  };

  /**
   * FIX: Proof generation using the single secretId
   */
  const handleFullVerification = async () => {
    if (!commitment || !appAddress || !secretId) {
      alert("⚠️ Please complete face scan and enter App Address first.");
      return;
    }

    setStatus("🔐 Initiating Security Verification...");
    try {
      // Skip registration check for local testing
      // const isReg = await checkRegistrationStatus(signer, commitment);
      // if (!isReg) {
      //   setStatus("❌ Identity not registered on Sepolia.");
      //   return;
      // }

      const userAddrBigInt = window.BigInt(account).toString();
      const appAddrBigInt = window.BigInt(appAddress).toString();

      // Nullifier = Poseidon(secretId, app, wallet)
      // IMPORTANT: Pass as BigInt field elements, not strings
      const nHash = poseidonRef.current([
        window.BigInt(secretId),
        window.BigInt(appAddrBigInt),
        window.BigInt(userAddrBigInt)
      ]);
      const nullifierStr = poseidonRef.current.F.toString(nHash);

      const zkInputs = {
        identityCommitment: commitment.toString(),
        app_address: appAddrBigInt,
        user_wallet: userAddrBigInt,
        nullifier: nullifierStr,
        secretId: secretId.toString()
      };

      console.log("Inputs for SnarkJS:", zkInputs);

      setStatus("🧮 Generating Zero-Knowledge Proof...");
      const { proof: zkProof, publicSignals } = await window.snarkjs.groth16.fullProve(
        zkInputs, 
        "/circuit.wasm", 
        "/circuit_final.zkey"
      );

      setProof(zkProof);
      console.log("Proof:", zkProof);
      console.log("Public Signals:", publicSignals);
      
      // Convert proof values to hex strings (fixes ethers.js encoding issue)
      // IMPORTANT: pi_b sub-arrays must be reversed for Solidity (G2 point encoding)
      const toHex = (val) => '0x' + window.BigInt(val).toString(16).padStart(64, '0');
      const proofHex = {
        pi_a: zkProof.pi_a.slice(0, 2).map(toHex),
        pi_b: zkProof.pi_b.slice(0, 2).map(row => row.slice(0, 2).reverse().map(toHex)),
        pi_c: zkProof.pi_c.slice(0, 2).map(toHex),
        protocol: zkProof.protocol,
        curve: zkProof.curve
      };
      const publicSignalsHex = publicSignals.map(toHex);
      
      console.log("Proof (hex):", proofHex);
      console.log("Public Signals (hex):", publicSignalsHex);
      
      // Send proof to relayer
      setStatus("📡 Transmitting to Blockchain Relayer...");
      
      const relayerResponse = await fetch('http://localhost:3001/relay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proof: proofHex,
          publicSignals: publicSignalsHex
        })
      });

      const relayerResult = await relayerResponse.json();
      console.log("Relayer Response:", relayerResult);

      if (relayerResult.success) {
        setStatus("✅ Verification Complete!");
        setTxHash(relayerResult.tx_hash);
        setShowModal(true);
      } else {
        setStatus(`❌ Verification Failed: ${relayerResult.message}`);
        alert(`Security Verification Failed\n\n${relayerResult.message}`);
      }
      
    } catch (err) {
      setStatus("❌ Security Verification Failed");
      console.error(err);
      alert(`Verification Error\n\n${err.message}`);
    }
  };

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <div style={styles.logo}>PrivacyShield ZK</div>
        <button style={styles.connectBtn} onClick={handleConnect}>
          {account ? `${account.substring(0,6)}...` : "Connect Wallet"}
        </button>
      </nav>

      <div style={styles.card}>
        <h1>Biometric ZK-ID</h1>
        
        {!account ? (
           <button style={styles.button} onClick={handleConnect}>Connect Wallet</button>
        ) : !started ? (
           <button style={styles.button} onClick={() => setStarted(true)}>Start Face Scan</button>
        ) : !verified ? (
          <>
            <FaceScanner onLandmarksDetected={handleLandmarks} setStatus={setStatus} />
            <div style={styles.status}> {status} ({progress}%) </div>
          </>
        ) : (
          <div style={styles.successBox}>
            <p style={styles.smallText}><strong>ID Commitment:</strong> {commitment.substring(0, 40)}...</p>
            
            {checkingRegistration ? (
              <div style={styles.status}>🔍 Checking Registration Status...</div>
            ) : !isRegistered ? (
              // Show Register button if not registered
              <>
                <div style={{...styles.infoBox, marginBottom: '15px'}}>
                  <div style={styles.infoIcon}>ℹ️</div>
                  <div>
                    <strong>First Time Setup Required</strong>
                    <p style={{margin: '5px 0 0 0', fontSize: '12px', color: '#94a3b8'}}>Register your biometric identity on-chain before verification.</p>
                  </div>
                </div>
                <button style={styles.regButton} onClick={handleRegister}>
                  📝 Register Identity on Blockchain
                </button>
              </>
            ) : (
              // Show Verify section if already registered
              <>
                <div style={{...styles.infoBox, marginBottom: '15px', background: '#064e3b', borderColor: '#22c55e'}}>
                  <div style={styles.infoIcon}>✅</div>
                  <div>
                    <strong>Identity Registered</strong>
                    <p style={{margin: '5px 0 0 0', fontSize: '12px', color: '#6ee7b7'}}>You can now verify this identity for any application.</p>
                  </div>
                </div>
                <div style={styles.divider} />
                <h3>🔐 Security Verification</h3>
                <input 
                  style={styles.input}
                  placeholder="App Address (0x...)"
                  value={appAddress}
                  onChange={(e) => setAppAddress(e.target.value)}
                />
                <button 
                  style={{...styles.button, background: '#8b5cf6', color: '#fff'}} 
                  onClick={handleFullVerification}
                >
                  🛡️ Verify Identity
                </button>
                {proof && <div style={styles.resultBox}>✅ Proof Generated Successfully</div>}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Verification Success Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalIcon}>🎉</div>
            <h2 style={styles.modalTitle}>Verification Complete!</h2>
            <p style={styles.modalText}>Your identity has been successfully verified on the blockchain.</p>
            
            <div style={styles.txBox}>
              <div style={styles.txLabel}>Transaction Hash:</div>
              <div style={styles.txHash}>{txHash.substring(0, 20)}...{txHash.substring(txHash.length - 10)}</div>
            </div>
            
            <div style={styles.checkmarks}>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Biometric Data Verified</span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Zero-Knowledge Proof Generated</span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Blockchain Transaction Confirmed</span>
              </div>
            </div>
            
            <button style={styles.modalButton} onClick={() => setShowModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#020617", display: "flex", flexDirection: "column", alignItems: "center", color: "#e5e7eb", fontFamily: "sans-serif" },
  nav: { width: '100%', display: "flex", justifyContent: "space-between", padding: "20px 40px", boxSizing: 'border-box', borderBottom: "1px solid #1e293b" },
  logo: { fontSize: "20px", fontWeight: "bold", color: "#8b5cf6" },
  connectBtn: { padding: "8px 16px", borderRadius: "8px", background: "#1e293b", color: "#fff", border: "1px solid #334155", cursor: "pointer" },
  card: { marginTop: '40px', width: 450, padding: 32, borderRadius: 16, background: "#0f172a", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" },
  button: { width: "100%", padding: 14, borderRadius: 10, background: "#22c55e", cursor: "pointer", border: "none", fontWeight: "bold", fontSize: "16px" },
  regButton: { width: "100%", padding: 12, borderRadius: 8, background: "#3b82f6", color: "#fff", cursor: "pointer", border: "none", fontWeight: "bold", marginBottom: "8px" },
  input: { width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #334155", background: "#1e293b", color: "#fff", marginBottom: "10px", boxSizing: "border-box" },
  status: { marginTop: 16, fontSize: 14, color: "#facc15" },
  successBox: { marginTop: 10, textAlign: "left" },
  smallText: { fontSize: "10px", color: "#94a3b8", wordBreak: "break-all", marginBottom: "10px" },
  divider: { height: "1px", background: "#1e293b", margin: "20px 0" },
  resultBox: { marginTop: "15px", padding: "10px", background: "#064e3b", borderRadius: "8px", border: "1px solid #22c55e", textAlign: 'center', color: '#fff' },
  
  // Modal styles
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#0f172a", borderRadius: "16px", padding: "40px", maxWidth: "500px", width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.7)", border: "1px solid #1e293b" },
  modalIcon: { fontSize: "64px", marginBottom: "20px", textAlign: "center" },
  modalTitle: { fontSize: "28px", fontWeight: "bold", color: "#22c55e", marginBottom: "15px", textAlign: "center" },
  modalText: { fontSize: "16px", color: "#94a3b8", marginBottom: "25px", textAlign: "center", lineHeight: "1.6" },
  txBox: { background: "#1e293b", padding: "15px", borderRadius: "8px", marginBottom: "25px", border: "1px solid #334155" },
  txLabel: { fontSize: "12px", color: "#64748b", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" },
  txHash: { fontSize: "14px", color: "#8b5cf6", fontFamily: "monospace", wordBreak: "break-all" },
  checkmarks: { marginBottom: "25px" },
  checkItem: { display: "flex", alignItems: "center", padding: "10px 0", fontSize: "14px", color: "#e5e7eb" },
  checkIcon: { width: "24px", height: "24px", borderRadius: "50%", background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginRight: "12px", fontSize: "16px", fontWeight: "bold" },
  modalButton: { width: "100%", padding: "14px", borderRadius: "10px", background: "#8b5cf6", color: "#fff", border: "none", fontWeight: "bold", fontSize: "16px", cursor: "pointer" },
  infoBox: { display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", background: "#1e3a8a", borderRadius: "8px", border: "1px solid #3b82f6", textAlign: "left" },
  infoIcon: { fontSize: "20px", flexShrink: 0 }
};