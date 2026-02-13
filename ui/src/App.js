import React, { useState, useRef, useEffect } from "react";
import FaceScanner from "./components/FaceScanner";
import { initPoseidon, quantize, getRatios } from "./utils/crypto";
import { connectWallet } from "./utils/wallet";
import { registerOnChain, checkRegistrationStatus } from "./utils/contract";

export default function App() {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [started, setStarted] = useState(false);
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [progress, setProgress] = useState(0);
  const [commitment, setCommitment] = useState("");
  const [secretId, setSecretId] = useState(null); // This will be the single hashed value
  const [appAddress, setAppAddress] = useState("");
  const [proof, setProof] = useState(null);

  const poseidonRef = useRef(null);
  const bufferRef = useRef([]); 
  const SCAN_THRESHOLD = 20;

  // Pre-load Poseidon to avoid delays during scanning
  useEffect(() => {
    const loadPoseidon = async () => {
      if (!poseidonRef.current) poseidonRef.current = await initPoseidon();
    };
    loadPoseidon();
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
    if (!signer || !commitment) return;
    setStatus("Waiting for Transaction...");
    try {
      const txHash = await registerOnChain(signer, commitment);
      setStatus("Successfully Registered!");
      alert(`Success! Tx: ${txHash}`);
    } catch (e) {
      setStatus("Registration failed");
      console.error(e);
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
        const secondHash = poseidonRef.current([privateSecret]);
        const publicCommitment = poseidonRef.current.F.toString(secondHash);

        setSecretId(privateSecret);
        setCommitment(publicCommitment);
        setVerified(true);
        setStatus("Identity Ready");
      }
    } catch (err) {
      console.warn("Frame skipped:", err.message);
    }
  };

  /**
   * FIX: Proof generation using the single secretId
   */
  const handleFullVerification = async () => {
    if (!commitment || !appAddress || !secretId) {
      alert("Scan face and enter App Address first.");
      return;
    }

    setStatus("🧠 Generating ZK Proof...");
    try {
      const isReg = await checkRegistrationStatus(signer, commitment);
      if (!isReg) {
        setStatus("❌ Identity not registered on Sepolia.");
        return;
      }

      const userAddrBigInt = window.BigInt(account).toString();
      const appAddrBigInt = window.BigInt(appAddress).toString();

      // Nullifier = Poseidon(secretId, app, wallet)
      const nHash = poseidonRef.current([secretId, appAddrBigInt, userAddrBigInt]);
      const nullifierStr = poseidonRef.current.F.toString(nHash);

      const zkInputs = {
        identityCommitment: commitment.toString(),
        app_address: appAddrBigInt,
        user_wallet: userAddrBigInt,
        nullifier: nullifierStr,
        secretId: secretId.toString()
      };

      console.log("Inputs for SnarkJS:", zkInputs);

      const { proof: zkProof, publicSignals } = await window.snarkjs.groth16.fullProve(
        zkInputs, 
        "/circuit.wasm", 
        "/circuit_final.zkey"
      );

      setProof(zkProof);
      console.log("Proof:", zkProof);
      console.log("Public Signals:", publicSignals);
      
      // Send proof to relayer
      setStatus("📡 Sending proof to relayer...");
      
      const relayerResponse = await fetch('http://localhost:3001/relay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proof: zkProof,
          publicSignals: publicSignals
        })
      });

      const relayerResult = await relayerResponse.json();
      console.log("Relayer Response:", relayerResult);

      if (relayerResult.success) {
        setStatus(`✅ Verified on Blockchain! Tx: ${relayerResult.tx_hash.substring(0, 10)}...`);
        alert(`Success! Proof verified on blockchain!\n\nTransaction: ${relayerResult.tx_hash}`);
      } else {
        setStatus(`❌ Relayer failed: ${relayerResult.message}`);
      }
      
    } catch (error) {
      console.error("ZK Error:", error);
      setStatus("❌ Proof Failed (Check Console)");
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
            <button style={styles.regButton} onClick={handleRegister}>Register Identity on Sepolia</button>
            <div style={styles.divider} />
            <h3>App Verification</h3>
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
              Verify & Generate Proof
            </button>
            {proof && <div style={styles.resultBox}>✨ Proof Ready in Console</div>}
          </div>
        )}
      </div>
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
  resultBox: { marginTop: "15px", padding: "10px", background: "#064e3b", borderRadius: "8px", border: "1px solid #22c55e", textAlign: 'center', color: '#fff' }
};