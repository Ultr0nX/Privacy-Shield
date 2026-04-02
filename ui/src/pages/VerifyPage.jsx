import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FaceScanner from '../components/FaceScanner';
import CommitmentDisplay from '../components/CommitmentDisplay';
import TxHashDisplay from '../components/TxHashDisplay';
import { useWalletContext } from '../context/WalletContext';
import { useBiometric } from '../hooks/useBiometric';
import { useRegistration } from '../hooks/useRegistration';
import { calculateNullifier, formatProofForChain, generateProof, prepareCircuitInputs } from '../services/proofService';
import { submitProof } from '../services/relayerService';
import { CONTRACT_ADDRESS, getProfileFromChain } from '../utils/contract';

const PROOF_STEPS = [
  'Computing secretId...',
  'Computing commitment...',
  'Generating Groth16 proof...',
  'Submitting to relayer...',
];

export default function VerifyPage() {
  const navigate = useNavigate();
  const wallet = useWalletContext();
  const biometric = useBiometric(30, wallet.isConnected ? wallet.signForIdentity : null, wallet.account);
  const registration = useRegistration(biometric.commitment);

  const [step, setStep] = useState(0); // 0=scan, 1=prove, 2=success
  const [proofStep, setProofStep] = useState(-1);
  const [proofTimes, setProofTimes] = useState([]);
  const [txHash, setTxHash] = useState('');
  const [nullifierDisplay, setNullifierDisplay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bchFailed, setBchFailed] = useState(false);

  // 'checking' | 'fresh-device' | 'confirmed' | 'own-device'
  const [deviceState, setDeviceState] = useState('checking');

  // Detect fresh-device scenario: registered on-chain but no localStorage template
  useEffect(() => {
    if (!wallet.isConnected || !wallet.account) return;
    setDeviceState('checking');
    getProfileFromChain(wallet.account).then(profile => {
      if (!profile) {
        // Not registered — let RegisterPage handle this
        setDeviceState('own-device');
        return;
      }
      // Registered on-chain. Is there a local face template?
      if (biometric.hasEnrolled) {
        setDeviceState('own-device');
      } else {
        // Fresh device — no local template, on-chain recovery path will skip cosine check
        setDeviceState('fresh-device');
      }
    }).catch(() => setDeviceState('own-device'));
  }, [wallet.isConnected, wallet.account, biometric.hasEnrolled]);

  useEffect(() => { biometric.initializePoseidon(); }, [biometric.initializePoseidon]);

  // When face scan completes, advance to step 1
  useEffect(() => {
    if (biometric.verified && step === 0) setStep(1);
  }, [biometric.verified, step]);

  // Detect BCH failure — useBiometric sets this exact phrase when SHA-256 mismatches
  useEffect(() => {
    if (
      biometric.status &&
      (biometric.status.includes('Face mismatch with enrolled profile') ||
       biometric.status.includes('key mismatch') ||
       biometric.status.includes('recovery failed') ||
       biometric.status.includes('SHA-256') ||
       biometric.status.includes('mismatch'))
    ) {
      setBchFailed(true);
    }
  }, [biometric.status]);

  const handleConnect = async () => {
    try { await wallet.connect(); } catch (err) { setError(err.message); }
  };

  const handleVerify = async () => {
    if (!biometric.commitment || !biometric.secretId) {
      setError('Complete face scan first.');
      return;
    }
    if (!wallet.isConnected) {
      setError('Connect wallet first.');
      return;
    }

    setError('');
    setSubmitting(true);
    setProofStep(0);
    const times = [];

    try {
      // 1. secretId (already done in biometric hook)
      const t0 = performance.now();
      await new Promise(r => setTimeout(r, 200)); // visual pause
      times.push(Math.round(performance.now() - t0));
      setProofStep(1);

      // 2. commitment (already computed)
      const t1 = performance.now();
      const regResult = await registration.checkStatus();
      if (!regResult?.registered) {
        setError('Identity not registered on-chain. Please register first.');
        setSubmitting(false);
        setProofStep(-1);
        return;
      }
      times.push(Math.round(performance.now() - t1));
      setProofStep(2);

      // 3. Generate Groth16 proof
      const t2 = performance.now();
      biometric.initializePoseidon();
      const nullifier = calculateNullifier(biometric.secretId, CONTRACT_ADDRESS, wallet.account);
      setNullifierDisplay(`${nullifier.slice(0,10)}...${nullifier.slice(-6)}`);
      const zkInputs = prepareCircuitInputs(
        biometric.commitment, CONTRACT_ADDRESS, wallet.account,
        nullifier, biometric.secretId
      );
      const { proof, publicSignals } = await generateProof(zkInputs);
      const { proof: proofHex, publicSignals: pubHex } = formatProofForChain(proof, publicSignals);
      times.push(Math.round(performance.now() - t2));
      setProofStep(3);

      // 4. Submit to relayer
      const t3 = performance.now();
      const chainResult = await submitProof(proofHex, pubHex);
      if (!chainResult.success) throw new Error(chainResult.message || 'Proof relay failed');
      times.push(Math.round(performance.now() - t3));

      setProofTimes(times);
      setTxHash(chainResult.tx_hash);
      setStep(2);
    } catch (err) {
      setError(err.message);
      setProofStep(-1);
    } finally {
      setSubmitting(false);
    }
  };

  if (!wallet.isConnected) {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.container}>
          <div style={s.centerCard} className="card">
            <div style={{ padding:32, textAlign:'center' }}>
              <div style={s.cardTitle}>VERIFY IDENTITY</div>
              <div style={s.cardSub}>Connect your wallet to start the verification flow.</div>
              <button className="btn-primary" style={{ marginTop:20 }} onClick={handleConnect}>
                CONNECT WALLET
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fresh-device gate — shown before face scanner activates
  if (deviceState === 'checking') {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.container}>
          <div className="card" style={{ padding:32, textAlign:'center' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>
              <span className="status-dot blink" style={{ marginRight:8 }} />
              Checking identity status...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (deviceState === 'fresh-device') {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.container}>
          <div style={s.pageTitle}>
            <div className="label">VERIFY</div>
            <h1 style={s.titleText}>Verify Your Identity</h1>
          </div>

          <div className="card" style={{ overflow:'hidden' }}>
            <div className="card-header">
              <div className="card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <div style={{ ...s.cardTitle, color:'var(--warn)' }}>FRESH DEVICE DETECTED</div>
                <div style={s.cardSub}>This wallet has an existing on-chain identity</div>
              </div>
            </div>

            <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div style={s.warnBox}>
                <div style={s.warnTitle}>⚠️ WALLET ALREADY REGISTERED</div>
                <div style={s.warnDesc}>
                  This wallet <strong style={{ color:'var(--text-primary)' }}>
                    {wallet.account.slice(0,6)}…{wallet.account.slice(-4)}
                  </strong> has a biometric identity stored on-chain, but no face data found on this device.
                </div>
                <div style={s.warnDesc}>
                  Only the person who originally registered this wallet can verify. If you are NOT the owner of this wallet, you will fail the biometric check.
                </div>
              </div>

              <div style={s.ownershipBox}>
                <div style={s.ownershipTitle}>ONLY PROCEED IF YOU:</div>
                <div style={s.ownershipItem}>✓ Own the private key to this wallet</div>
                <div style={s.ownershipItem}>✓ Are the person who registered this identity</div>
                <div style={s.ownershipItem}>✓ Are on a new device or cleared browser data</div>
              </div>

              <button
                className="btn-primary"
                onClick={() => setDeviceState('confirmed')}
              >
                I AM THE WALLET OWNER — PROCEED
              </button>
              <button
                className="btn-secondary"
                onClick={() => navigate('/')}
              >
                USE A DIFFERENT WALLET
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        <div style={s.pageTitle}>
          <div className="label">VERIFY</div>
          <h1 style={s.titleText}>Verify Your Identity</h1>
          <p style={s.titleSub}>
            Re-scan your face to recover your secretId via BCH, then generate a Groth16 ZK proof.
          </p>
        </div>

        {/* Stepper */}
        <div style={s.stepperWrap}>
          {['RE-SCAN FACE', 'SUBMIT PROOF'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="step-item">
                <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'idle'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div className={`step-label ${i === step ? 'active' : ''}`}>{label}</div>
              </div>
              {i < 1 && <div className={`step-connector ${i < step ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Main card */}
        <div className="card" style={{ overflow:'hidden' }}>
          <div className="card-header">
            <div className="card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <div>
              <div style={s.cardTitle}>IDENTITY VERIFICATION</div>
              <div style={s.cardSub}>Groth16 + Poseidon · Sepolia (11155111)</div>
            </div>
            <span className="badge badge-accent" style={{ marginLeft:'auto' }}>
              {wallet.account.slice(0,6)}…{wallet.account.slice(-4)}
            </span>
          </div>

          <div style={{ padding:'24px' }}>
            {step === 0 && (
              <div style={s.stepContent}>
                <div style={s.stepAlert}>
                  <div>
                    <div style={s.alertTitle}>STEP 1 — RE-SCAN FACE</div>
                    <div style={s.alertDesc}>
                      Your face bits will be XOR'd with stored helperData. BCH error correction recovers your randomSecret.
                    </div>
                  </div>
                </div>

                {/* BCH failure detected — stale localStorage */}
                {bchFailed && (
                  <div style={s.bchFailBox}>
                    <div style={s.bchFailTitle}>⚠️ LOCAL DATA MISMATCH</div>
                    <div style={s.bchFailDesc}>
                      Your browser has cached identity data that doesn't match what's on-chain.
                      This usually happens after re-visiting the Register page.
                      Clear the cached data to fetch the correct helperData from the blockchain.
                    </div>
                    <button
                      style={{ ...s.clearBtn }}
                      onClick={() => {
                        biometric.clearProfile();
                        setBchFailed(false);
                      }}
                    >
                      CLEAR LOCAL CACHE &amp; RETRY FROM CHAIN
                    </button>
                  </div>
                )}

                <FaceScanner
                  onLandmarksDetected={biometric.processLandmarks}
                  setStatus={() => {}}
                  frameCount={biometric.validFrames}
                  targetFrames={30}
                />
                <div style={s.scanMeta}>
                  <span style={{ fontSize:11, color: bchFailed ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {biometric.status}
                  </span>
                  <span style={{ fontSize:11, color:'var(--accent)' }}>{biometric.validFrames}/30</span>
                </div>
                {biometric.recoveryErrors !== null && (
                  <span className="badge badge-accent">
                    BCH recovered: {biometric.recoveryErrors} bit errors corrected
                  </span>
                )}
              </div>
            )}

            {step === 1 && (
              <div style={s.stepContent}>
                {/* Identity summary */}
                <CommitmentDisplay value={biometric.commitment} label="REGISTERED COMMITMENT" fullWidth />

                <div style={s.infoGrid}>
                  <div style={s.infoCell}>
                    <div className="label">BCH ERRORS</div>
                    <div style={s.cellVal}>{biometric.recoveryErrors !== null ? `${biometric.recoveryErrors}/30` : '—'}</div>
                  </div>
                  <div style={s.infoCell}>
                    <div className="label">SHA-256 CHECK</div>
                    <div style={{ fontSize:12, color:'var(--accent)', marginTop:4 }}>✓ MATCH</div>
                  </div>
                </div>

                {/* Proof steps animation */}
                {submitting && (
                  <div style={s.proofStepsBox}>
                    <div style={s.proofStepsTitle}>PROOF GENERATION</div>
                    {PROOF_STEPS.map((label, i) => (
                      <div key={i} style={s.proofStepRow}>
                        <span style={{
                          ...s.proofStepIcon,
                          color: i < proofStep ? 'var(--accent)'
                            : i === proofStep ? 'var(--warn)' : 'var(--border-base)',
                        }}>
                          {i < proofStep ? '✓' : i === proofStep ? '◌' : '○'}
                        </span>
                        <span style={{
                          fontSize:11,
                          color: i < proofStep ? 'var(--text-secondary)'
                            : i === proofStep ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}>
                          {label}
                        </span>
                        {i < proofStep && proofTimes[i] !== undefined && (
                          <span style={s.proofTime}>{proofTimes[i]}ms</span>
                        )}
                        {i === proofStep && <span style={s.proofSpinner}>···</span>}
                      </div>
                    ))}
                  </div>
                )}

                {nullifierDisplay && !submitting && (
                  <div>
                    <div className="label" style={{ marginBottom:6 }}>NULLIFIER</div>
                    <div className="field-box accent">
                      {nullifierDisplay}
                      <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
                        Unique to this app + wallet — cannot be reused
                      </div>
                    </div>
                  </div>
                )}

                {error && <div style={s.errorBox}>{error}</div>}

                <button
                  className="btn-primary"
                  onClick={handleVerify}
                  disabled={submitting}
                >
                  {submitting ? 'GENERATING PROOF...' : 'VERIFY IDENTITY ON-CHAIN'}
                </button>
                <button className="btn-secondary" onClick={() => {
                  biometric.reset();
                  setStep(0);
                  setError('');
                  setProofStep(-1);
                }}>
                  RE-SCAN FACE
                </button>
              </div>
            )}

            {step === 2 && (
              <div style={s.stepContent}>
                <div style={s.successIcon}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                </div>
                <div style={s.successTitle}>IDENTITY VERIFIED</div>
                <div style={s.successSub}>
                  Groth16 proof verified on-chain. ActionVerified event emitted.
                </div>

                <CommitmentDisplay value={biometric.commitment} label="VERIFIED COMMITMENT" fullWidth />
                <div style={{ marginTop:8 }}>
                  <TxHashDisplay hash={txHash} label="VERIFICATION TX" />
                </div>

                <div style={s.proofStepsBox}>
                  {PROOF_STEPS.map((label, i) => (
                    <div key={i} style={s.proofStepRow}>
                      <span style={{ ...s.proofStepIcon, color:'var(--accent)' }}>✓</span>
                      <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{label}</span>
                      {proofTimes[i] !== undefined && <span style={s.proofTime}>{proofTimes[i]}ms</span>}
                    </div>
                  ))}
                </div>

                <button className="btn-primary" onClick={() => navigate('/dashboard')}>
                  VIEW DASHBOARD →
                </button>
                <button className="btn-secondary" onClick={() => {
                  biometric.reset();
                  setStep(0);
                  setTxHash('');
                  setNullifierDisplay('');
                  setProofTimes([]);
                  setProofStep(-1);
                }}>
                  VERIFY AGAIN
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display:'flex', justifyContent:'center', padding:'80px 24px 80px' },
  container: { width:'100%', maxWidth:520 },
  pageTitle: { textAlign:'center', marginBottom:32 },
  titleText: { fontSize:26, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em', margin:'8px 0 10px' },
  titleSub: { fontSize:12, color:'var(--text-muted)', lineHeight:1.7 },
  stepperWrap: { display:'flex', alignItems:'flex-start', justifyContent:'center', marginBottom:28 },
  centerCard: { maxWidth:400, margin:'60px auto', overflow:'hidden' },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  cardSub: { fontSize:11, color:'var(--text-muted)', marginTop:2 },
  stepContent: { display:'flex', flexDirection:'column', gap:12 },
  stepAlert: {
    display:'flex', gap:12, alignItems:'flex-start',
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
    borderLeft:'3px solid var(--accent)',
    borderRadius:'0 8px 8px 0', padding:'14px 16px',
  },
  alertTitle: { fontSize:11, fontWeight:600, color:'var(--accent)', letterSpacing:'0.06em', marginBottom:3 },
  alertDesc: { fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 },
  scanMeta: { display:'flex', justifyContent:'space-between' },
  infoGrid: {
    display:'grid', gridTemplateColumns:'1fr 1fr',
    gap:1, background:'var(--border-base)', borderRadius:8, overflow:'hidden',
  },
  infoCell: { background:'var(--bg-surface)', padding:'12px 14px' },
  cellVal: { fontSize:12, color:'var(--text-secondary)', marginTop:4 },
  proofStepsBox: {
    background:'var(--bg-elevated)', border:'0.5px solid var(--border-base)',
    borderRadius:8, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8,
  },
  proofStepsTitle: {
    fontSize:9, letterSpacing:'0.1em', color:'var(--text-muted)',
    textTransform:'uppercase', marginBottom:4,
  },
  proofStepRow: { display:'flex', alignItems:'center', gap:10 },
  proofStepIcon: { fontSize:13, fontWeight:700, width:16, flexShrink:0 },
  proofTime: { marginLeft:'auto', fontSize:10, color:'var(--text-muted)' },
  proofSpinner: { marginLeft:'auto', fontSize:12, color:'var(--warn)' },
  errorBox: {
    fontSize:11, color:'var(--danger)',
    background:'var(--danger-dim)', border:'0.5px solid rgba(226,75,74,0.25)',
    borderRadius:8, padding:'10px 14px', lineHeight:1.6,
  },
  successIcon: { display:'flex', justifyContent:'center', padding:'20px 0 12px' },
  successTitle: { textAlign:'center', fontSize:18, fontWeight:600, color:'var(--accent)', letterSpacing:'0.06em' },
  successSub: { textAlign:'center', fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },

  bchFailBox: {
    background:'var(--danger-dim)', border:'0.5px solid rgba(226,75,74,0.3)',
    borderLeft:'3px solid var(--danger)',
    borderRadius:'0 8px 8px 0', padding:'14px 16px',
    display:'flex', flexDirection:'column', gap:8,
  },
  bchFailTitle: { fontSize:11, fontWeight:600, color:'var(--danger)', letterSpacing:'0.06em' },
  bchFailDesc: { fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 },
  warnBox: {
    background:'rgba(239,159,39,0.06)', border:'0.5px solid rgba(239,159,39,0.3)',
    borderLeft:'3px solid var(--warn)',
    borderRadius:'0 8px 8px 0', padding:'14px 16px',
    display:'flex', flexDirection:'column', gap:8,
  },
  warnTitle: { fontSize:11, fontWeight:600, color:'var(--warn)', letterSpacing:'0.06em' },
  warnDesc: { fontSize:11, color:'var(--text-secondary)', lineHeight:1.7 },
  ownershipBox: {
    background:'var(--bg-elevated)', border:'0.5px solid var(--border-base)',
    borderRadius:8, padding:'14px 16px', display:'flex', flexDirection:'column', gap:6,
  },
  ownershipTitle: { fontSize:9, letterSpacing:'0.1em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:4 },
  ownershipItem: { fontSize:11, color:'var(--accent)' },
  clearBtn: {
    padding:'9px 14px', borderRadius:6,
    background:'var(--danger)', border:'none', color:'#fff',
    fontSize:10, fontWeight:600, letterSpacing:'0.08em',
    cursor:'pointer', textTransform:'uppercase', alignSelf:'flex-start',
    fontFamily:'var(--font-mono, monospace)',
  },
};
