import React, { useState, useEffect } from "react";
import FaceScanner from "./components/FaceScanner";
import { useBiometric } from "./hooks/useBiometric";
import { useWallet } from "./hooks/useWallet";
import { useRegistration } from "./hooks/useRegistration";
import { generateProof, calculateNullifier, prepareCircuitInputs, formatProofForChain } from "./services/proofService";
import { submitProof } from "./services/relayerService";
import { CONTRACT_ADDRESS } from "./utils/contract";

// Use the deployed contract address — not user-editable
const APP_ADDRESS = CONTRACT_ADDRESS;

export default function App() {
  // Custom hooks for separated concerns
  const wallet = useWallet();
  const biometric = useBiometric(20); // 20 frames threshold
  const registration = useRegistration(biometric.commitment);
  
  // Local UI state
  const [started, setStarted] = useState(false);
  const [proof, setProof] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("SYSTEM READY");
  const [txHash, setTxHash] = useState("");
  
  // Initialize biometric processor on mount
  useEffect(() => {
    biometric.initializePoseidon();
  }, []);
  
  // Check registration status when commitment is available
  useEffect(() => {
    if (biometric.commitment && biometric.verified) {
      registration.checkStatus();
    }
  }, [biometric.commitment, biometric.verified]);
  
  // Wallet connection handler
  const handleConnect = async () => {
    try {
      await wallet.connect();
      setVerificationStatus("Wallet Connected");
    } catch (err) {
      alert(err.message);
    }
  };
  
  // Registration handler
  const handleRegister = async () => {
    try {
      setVerificationStatus("REGISTERING IDENTITY ON-CHAIN...");
      const result = await registration.register();
      setTxHash(result.tx_hash);
      setVerificationStatus("IDENTITY REGISTERED");
      alert(`Identity Registered!\n\nTransaction: ${result.tx_hash}`);
    } catch (err) {
      setVerificationStatus("REGISTRATION FAILED");
      alert(`Registration Failed\n\n${err.message}`);
    }
  };
  
  // Full verification handler
  const handleFullVerification = async () => {
    if (!biometric.commitment || !biometric.secretId) {
      alert("⚠️ Please complete face scan first.");
      return;
    }

    setVerificationStatus("INITIATING SECURE VERIFICATION...");
    
    try {
      // Get Poseidon instance for nullifier calculation
      await biometric.initializePoseidon();
      
      // Calculate nullifier
      const nullifier = calculateNullifier(
        biometric.secretId,
        APP_ADDRESS,
        wallet.account
      );
      
      // Prepare circuit inputs
      const zkInputs = prepareCircuitInputs(
        biometric.commitment,
        APP_ADDRESS,
        wallet.account,
        nullifier,
        biometric.secretId
      );
      
      console.log("Circuit inputs:", zkInputs);
      
      // Generate proof
      setVerificationStatus("GENERATING ZERO-KNOWLEDGE PROOF...");
      const { proof: zkProof, publicSignals } = await generateProof(zkInputs);
      setProof(zkProof);
      
      // Format proof for blockchain
      const { proof: proofHex, publicSignals: publicSignalsHex } = formatProofForChain(zkProof, publicSignals);
      
      console.log("Formatted proof:", proofHex);
      console.log("Formatted signals:", publicSignalsHex);
      
      // Submit to relayer
      setVerificationStatus("TRANSMITTING TO BLOCKCHAIN...");
      const result = await submitProof(proofHex, publicSignalsHex);
      
      if (result.success) {
        setTxHash(result.tx_hash);
        setVerificationStatus("ACCESS GRANTED");
        setShowModal(true);
      } else {
        throw new Error(result.message);
      }
      
    } catch (err) {
      setVerificationStatus("VERIFICATION FAILED");
      console.error("Verification error:", err);
      alert(`Verification Error\n\n${err.message}`);
    }
  };

  // Derive current step index for the step tracker
  const currentStep = !wallet.isConnected ? 0 : !started ? 1 : !biometric.verified ? 2 : !registration.isRegistered ? 3 : 4;
  const steps = ["CONNECT", "ACTIVATE", "SCAN", "REGISTER", "VERIFY"];

  return (
    <div style={styles.page}>
      {/* Top nav */}
      <nav style={styles.nav}>
        <div style={styles.logoWrap}>
          <span style={styles.shieldIcon}>⬡</span>
          <span style={styles.logo}>PRIVACY<span style={styles.logoAccent}>SHIELD</span></span>
        </div>
        <div style={styles.navRight}>
          <span style={styles.networkBadge}>SEPOLIA TESTNET</span>
          <button style={styles.connectBtn} onClick={handleConnect}>
            {wallet.account ? (
              <><span style={styles.dot}/>{wallet.account.substring(0,6)}...{wallet.account.slice(-4)}</>
            ) : "CONNECT WALLET"}
          </button>
        </div>
      </nav>

      {/* Step tracker */}
      <div style={styles.stepBar}>
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div style={styles.stepWrap}>
              <div style={i < currentStep ? styles.stepDone : i === currentStep ? styles.stepActive : styles.stepInactive}>
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span style={i === currentStep ? styles.stepLabelActive : styles.stepLabel}>{s}</span>
            </div>
            {i < steps.length - 1 && <div style={i < currentStep ? styles.connectorDone : styles.connector}/>}
          </React.Fragment>
        ))}
      </div>

      {/* Main card */}
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.cardHeader}>
          <div style={styles.headerIcon}>🔐</div>
          <div>
            <div style={styles.cardTitle}>BIOMETRIC ZK-ID</div>
            <div style={styles.cardSub}>Zero-Knowledge Identity Protocol</div>
          </div>
        </div>

        {/* Contract badge */}
        <div style={styles.contractBadge}>
          <span style={styles.contractLabel}>CONTRACT</span>
          <span style={styles.contractAddr}>{APP_ADDRESS.substring(0,10)}...{APP_ADDRESS.slice(-8)}</span>
          <span style={styles.verifiedTag}>VERIFIED</span>
        </div>

        <div style={styles.divider}/>
        
        {!wallet.isConnected ? (
          <div style={styles.section}>
            <p style={styles.hint}>Connect your Ethereum wallet to begin authentication.</p>
            <button style={styles.btnPrimary} onClick={handleConnect}>CONNECT WALLET</button>
          </div>
        ) : !started ? (
          <div style={styles.section}>
            <div style={styles.alertBox}>
              <span style={styles.alertIcon}>●</span>
              <span>Wallet: <code style={styles.mono}>{wallet.account.substring(0,10)}...{wallet.account.slice(-6)}</code></span>
            </div>
            <p style={styles.hint}>Activate the biometric scanner to capture your facial geometry.</p>
            <button style={styles.btnGreen} onClick={() => setStarted(true)}>ACTIVATE SCANNER</button>
          </div>
        ) : !biometric.verified ? (
          <div style={styles.section}>
            <div style={styles.scanLabel}>FACIAL GEOMETRY CAPTURE</div>
            <FaceScanner onLandmarksDetected={biometric.processLandmarks} setStatus={() => {}} />
            <div style={styles.progressBar}>
              <div style={{...styles.progressFill, width: `${biometric.progress}%`}}/>
            </div>
            <div style={styles.scanStatus}>{biometric.status} — {biometric.progress}%</div>
            <div style={styles.frameCount}>Valid frames: {biometric.validFrames} / 20</div>
          </div>
        ) : (
          <div style={styles.section}>
            <div style={styles.commitBox}>
              <span style={styles.commitLabel}>BIOMETRIC HASH</span>
              <span style={styles.commitVal}>{biometric.commitment.substring(0, 18)}...{biometric.commitment.slice(-8)}</span>
            </div>

            {registration.checking ? (
              <div style={styles.loadingRow}><span style={styles.spinner}/> CHECKING REGISTRATION...</div>
            ) : !registration.isRegistered ? (
              <>
                <div style={styles.infoBox}>
                  <div style={styles.infoIcon}>!</div>
                  <div>
                    <div style={styles.infoTitle}>FIRST-TIME SETUP REQUIRED</div>
                    <div style={styles.infoText}>Register your biometric identity on-chain before verification.</div>
                  </div>
                </div>
                <button 
                  style={registration.registering ? styles.btnDisabled : styles.btnBlue}
                  onClick={handleRegister}
                  disabled={registration.registering}
                >
                  {registration.registering ? "REGISTERING..." : "REGISTER IDENTITY ON-CHAIN"}
                </button>
              </>
            ) : (
              <>
                <div style={{...styles.infoBox, borderColor: '#00ff88', background: 'rgba(0,255,136,0.06)'}}>
                  <div style={{...styles.infoIcon, background: '#00ff88', color: '#0a0a0a'}}>✓</div>
                  <div>
                    <div style={{...styles.infoTitle, color: '#00ff88'}}>IDENTITY REGISTERED</div>
                    <div style={styles.infoText}>Biometric hash anchored on Sepolia. Ready for ZK proof.</div>
                  </div>
                </div>
                <div style={styles.divider}/>
                <div style={styles.terminalBox}>
                  <div style={styles.termLine}><span style={styles.termKey}>PROTOCOL</span><span style={styles.termVal}>Groth16 ZK-SNARK</span></div>
                  <div style={styles.termLine}><span style={styles.termKey}>HASH FN</span><span style={styles.termVal}>Poseidon</span></div>
                  <div style={styles.termLine}><span style={styles.termKey}>NETWORK</span><span style={styles.termVal}>Sepolia (11155111)</span></div>
                  <div style={styles.termLine}><span style={styles.termKey}>NULLIFIER</span><span style={styles.termVal}>DERIVED</span></div>
                </div>
                <div style={styles.statusLine}>> {verificationStatus}</div>
                <button style={styles.btnPurple} onClick={handleFullVerification}>
                  VERIFY IDENTITY
                </button>
                {proof && (
                  <div style={styles.proofBox}>ZK PROOF GENERATED SUCCESSFULLY</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Success Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalShield}>⬡</div>
            <div style={styles.modalTitle}>ACCESS GRANTED</div>
            <div style={styles.modalSub}>Identity verified on-chain via zero-knowledge proof.</div>
            <div style={styles.txBox}>
              <div style={styles.txLabel}>TRANSACTION HASH</div>
              <div style={styles.txHash}>{txHash.substring(0, 20)}...{txHash.substring(txHash.length - 10)}</div>
            </div>
            <div style={styles.checkList}>
              {["Biometric Challenge Passed","ZK Proof Verified On-Chain","Nullifier Recorded (Replay-Proof)"].map(txt => (
                <div key={txt} style={styles.checkRow}>
                  <span style={styles.checkMark}>✓</span>{txt}
                </div>
              ))}
            </div>
            <button style={styles.btnPurple} onClick={() => setShowModal(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  // Layout
  page: { minHeight:"100vh", background:"#050810", display:"flex", flexDirection:"column", alignItems:"center", color:"#c8d6e5", fontFamily:"'Courier New', monospace", backgroundImage:"radial-gradient(ellipse at 50% 0%, rgba(0,255,136,0.04) 0%, transparent 60%)" },

  // Nav
  nav: { width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 40px", boxSizing:"border-box", borderBottom:"1px solid rgba(0,255,136,0.12)", background:"rgba(5,8,16,0.95)", backdropFilter:"blur(10px)", position:"sticky", top:0, zIndex:99 },
  logoWrap: { display:"flex", alignItems:"center", gap:10 },
  shieldIcon: { fontSize:28, color:"#00ff88", lineHeight:1 },
  logo: { fontSize:18, fontWeight:"bold", letterSpacing:4, color:"#e0e8f0" },
  logoAccent: { color:"#00ff88" },
  navRight: { display:"flex", alignItems:"center", gap:12 },
  networkBadge: { fontSize:10, padding:"4px 8px", borderRadius:4, border:"1px solid rgba(0,255,136,0.3)", color:"#00ff88", letterSpacing:1.5 },
  connectBtn: { padding:"8px 16px", borderRadius:6, background:"transparent", color:"#c8d6e5", border:"1px solid rgba(200,214,229,0.25)", cursor:"pointer", fontSize:11, letterSpacing:1.5, display:"flex", alignItems:"center", gap:6 },
  dot: { width:8, height:8, borderRadius:"50%", background:"#00ff88", display:"inline-block" },

  // Step tracker
  stepBar: { display:"flex", alignItems:"flex-start", marginTop:28, marginBottom:16, gap:0 },
  stepWrap: { display:"flex", flexDirection:"column", alignItems:"center", gap:6, minWidth:56 },
  stepActive: { width:28, height:28, borderRadius:"50%", background:"#00ff88", color:"#0a0a0a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:"bold", boxShadow:"0 0 12px rgba(0,255,136,0.6)", flexShrink:0 },
  stepDone: { width:28, height:28, borderRadius:"50%", background:"rgba(0,255,136,0.2)", color:"#00ff88", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, border:"1px solid #00ff88", flexShrink:0 },
  stepInactive: { width:28, height:28, borderRadius:"50%", background:"rgba(255,255,255,0.05)", color:"#4a5568", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, border:"1px solid rgba(255,255,255,0.1)", flexShrink:0 },
  stepLabel: { fontSize:8, color:"#4a5568", letterSpacing:1.5, textAlign:"center" },
  stepLabelActive: { fontSize:8, color:"#00ff88", letterSpacing:1.5, textAlign:"center" },
  connector: { width:36, height:1, background:"rgba(255,255,255,0.08)", margin:"14px 2px 0" },
  connectorDone: { width:36, height:1, background:"rgba(0,255,136,0.4)", margin:"14px 2px 0" },

  // Card
  card: { marginTop:40, width:480, padding:"28px 32px", borderRadius:12, background:"#0b0f1a", boxShadow:"0 0 0 1px rgba(0,255,136,0.12), 0 20px 60px rgba(0,0,0,0.7)", marginBottom:40 },
  cardHeader: { display:"flex", alignItems:"center", gap:14, marginBottom:18 },
  headerIcon: { fontSize:32, lineHeight:1 },
  cardTitle: { fontSize:18, fontWeight:"bold", letterSpacing:3, color:"#e0e8f0" },
  cardSub: { fontSize:11, color:"#4a6080", letterSpacing:1.5, marginTop:3 },

  contractBadge: { display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:6, background:"rgba(0,255,136,0.04)", border:"1px solid rgba(0,255,136,0.12)", marginBottom:18 },
  contractLabel: { fontSize:9, color:"#4a6080", letterSpacing:2 },
  contractAddr: { fontSize:11, color:"#7a9abf", fontFamily:"monospace", flex:1 },
  verifiedTag: { fontSize:8, padding:"2px 6px", borderRadius:3, background:"rgba(0,255,136,0.12)", color:"#00ff88", letterSpacing:1.5 },

  divider: { height:1, background:"rgba(255,255,255,0.06)", margin:"16px 0" },
  section: { marginTop:8 },
  hint: { fontSize:12, color:"#4a6080", lineHeight:1.7, marginBottom:18, letterSpacing:0.3 },

  // Buttons
  btnPrimary: { width:"100%", padding:"13px 0", borderRadius:6, background:"linear-gradient(135deg,#0070ff,#0040aa)", color:"#fff", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:13, letterSpacing:2.5, fontFamily:"'Courier New',monospace", boxShadow:"0 4px 20px rgba(0,112,255,0.3)" },
  btnGreen: { width:"100%", padding:"13px 0", borderRadius:6, background:"linear-gradient(135deg,#00c868,#007a40)", color:"#fff", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:13, letterSpacing:2.5, fontFamily:"'Courier New',monospace", boxShadow:"0 4px 20px rgba(0,200,104,0.3)" },
  btnBlue: { width:"100%", padding:"13px 0", borderRadius:6, background:"linear-gradient(135deg,#3b82f6,#1d4ed8)", color:"#fff", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:13, letterSpacing:2, fontFamily:"'Courier New',monospace", boxShadow:"0 4px 20px rgba(59,130,246,0.3)" },
  btnPurple: { width:"100%", padding:"13px 0", borderRadius:6, background:"linear-gradient(135deg,#8b5cf6,#5b21b6)", color:"#fff", border:"none", cursor:"pointer", fontWeight:"bold", fontSize:13, letterSpacing:2, fontFamily:"'Courier New',monospace", boxShadow:"0 4px 20px rgba(139,92,246,0.3)" },
  btnDisabled: { width:"100%", padding:"13px 0", borderRadius:6, background:"#1e293b", color:"#4a5568", border:"none", cursor:"not-allowed", fontWeight:"bold", fontSize:13, letterSpacing:2, fontFamily:"'Courier New',monospace" },

  // Wallet alert
  alertBox: { padding:"10px 14px", borderRadius:6, background:"rgba(0,255,136,0.06)", border:"1px solid rgba(0,255,136,0.2)", fontSize:12, marginBottom:16, display:"flex", alignItems:"center", gap:8 },
  alertIcon: { color:"#00ff88", fontSize:10 },
  mono: { color:"#00ff88", fontFamily:"'Courier New',monospace", fontSize:11 },

  // Scanner
  scanLabel: { fontSize:10, letterSpacing:3, color:"#4a6080", marginBottom:10 },
  progressBar: { height:4, borderRadius:2, background:"rgba(255,255,255,0.08)", marginTop:12 },
  progressFill: { height:"100%", borderRadius:2, background:"linear-gradient(90deg,#00ff88,#00c8ff)", transition:"width 0.3s ease" },
  scanStatus: { marginTop:10, fontSize:12, color:"#facc15", letterSpacing:0.5 },
  frameCount: { marginTop:4, fontSize:11, color:"#4a6080" },

  // Commitment
  commitBox: { padding:"10px 14px", borderRadius:6, background:"#0a0f1c", border:"1px solid rgba(0,255,136,0.15)", marginBottom:14, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" },
  commitLabel: { fontSize:9, color:"#4a6080", letterSpacing:2 },
  commitVal: { fontSize:11, color:"#7a9abf", fontFamily:"monospace" },

  loadingRow: { fontSize:12, color:"#facc15", letterSpacing:1.5, display:"flex", alignItems:"center", gap:8, margin:"12px 0" },
  spinner: { display:"inline-block", width:10, height:10, borderRadius:"50%", background:"#facc15" },

  // Info box
  infoBox: { display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:6, border:"1px solid rgba(59,130,246,0.35)", background:"rgba(59,130,246,0.07)", marginBottom:14 },
  infoIcon: { width:20, height:20, borderRadius:"50%", background:"#3b82f6", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:"bold", flexShrink:0 },
  infoTitle: { fontSize:11, fontWeight:"bold", letterSpacing:1.5, color:"#c8d6e5", marginBottom:4 },
  infoText: { fontSize:11, color:"#4a6080" },

  // Terminal box
  terminalBox: { background:"#060a10", borderRadius:6, padding:"12px 14px", border:"1px solid rgba(255,255,255,0.06)", marginBottom:14 },
  termLine: { display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" },
  termKey: { fontSize:10, color:"#4a6080", letterSpacing:2 },
  termVal: { fontSize:10, color:"#00ff88", fontFamily:"monospace" },

  statusLine: { fontSize:12, color:"#7a9abf", letterSpacing:0.5, marginBottom:14, padding:"6px 10px", borderLeft:"2px solid rgba(0,255,136,0.4)", background:"rgba(0,255,136,0.02)" },
  proofBox: { marginTop:12, padding:"8px 12px", background:"rgba(0,255,136,0.08)", borderRadius:6, border:"1px solid rgba(0,255,136,0.25)", textAlign:"center", fontSize:11, color:"#00ff88", letterSpacing:1.5 },

  // Modal
  modalOverlay: { position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(4px)" },
  modal: { background:"#0b0f1a", borderRadius:12, padding:"40px 36px", maxWidth:480, width:"90%", boxShadow:"0 0 0 1px rgba(0,255,136,0.2), 0 30px 80px rgba(0,0,0,0.8)", textAlign:"center" },
  modalShield: { fontSize:64, color:"#00ff88", marginBottom:16, textShadow:"0 0 30px rgba(0,255,136,0.5)" },
  modalTitle: { fontSize:26, fontWeight:"bold", letterSpacing:4, color:"#00ff88", marginBottom:6 },
  modalSub: { fontSize:13, color:"#4a6080", marginBottom:24, lineHeight:1.6 },
  txBox: { background:"#060a10", padding:"14px", borderRadius:8, marginBottom:22, border:"1px solid rgba(255,255,255,0.07)", textAlign:"left" },
  txLabel: { fontSize:9, color:"#4a6080", marginBottom:8, letterSpacing:2, textTransform:"uppercase" },
  txHash: { fontSize:12, color:"#8b5cf6", fontFamily:"monospace", wordBreak:"break-all" },
  checkList: { marginBottom:24 },
  checkRow: { display:"flex", alignItems:"center", gap:12, padding:"9px 0", fontSize:13, color:"#c8d6e5", borderBottom:"1px solid rgba(255,255,255,0.04)", textAlign:"left" },
  checkMark: { width:22, height:22, borderRadius:"50%", background:"rgba(0,255,136,0.15)", color:"#00ff88", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:"bold", flexShrink:0, border:"1px solid rgba(0,255,136,0.4)" },
};
