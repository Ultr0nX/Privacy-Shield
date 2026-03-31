import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FaceScanner from '../components/FaceScanner';
import CommitmentDisplay from '../components/CommitmentDisplay';
import { getProfileFromChain } from '../utils/contract';
import { averageDescriptors, extractDescriptor } from '../services/embeddingService';
import { reproduceDescriptor } from '../services/fuzzyExtractor';

const STEPS = ['ENTER WALLET', 'SCAN FACE', 'RESULT'];

export default function RecoveryPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [walletInput, setWalletInput] = useState('');
  const [chainProfile, setChainProfile] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  // Scan state
  const [scanActive, setScanActive] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const descriptorsRef = useRef([]);
  const [scanStatus, setScanStatus] = useState('');

  // Result state
  const [result, setResult] = useState(null); // { matched, errors, commitment }

  const handleLookup = async () => {
    if (!walletInput.trim()) return;
    setLookupError('');
    setLookingUp(true);
    try {
      const addr = walletInput.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        setLookupError('Invalid Ethereum address format.');
        setLookingUp(false);
        return;
      }
      if (!window.ethereum) { setLookupError('No Web3 provider. Connect MetaMask first.'); setLookingUp(false); return; }
      const profile = await getProfileFromChain(addr);
      if (!profile) {
        setLookupError('No identity registered for this wallet address.');
        setLookingUp(false);
        return;
      }
      setChainProfile(profile);
      setStep(1);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const processLandmarks = useCallback(async ({ landmarks, videoElement }) => {
    if (!scanActive || frameCount >= 30) return;
    try {
      const desc = await extractDescriptor(landmarks, videoElement);
      if (!desc) return;
      descriptorsRef.current.push(desc);
      setFrameCount(descriptorsRef.current.length);
      setScanStatus(`Capturing... ${descriptorsRef.current.length}/30 frames`);

      if (descriptorsRef.current.length >= 30) {
        setScanActive(false);
        setScanStatus('Processing...');
        const averaged = averageDescriptors(descriptorsRef.current);
        const recovered = await reproduceDescriptor(averaged, chainProfile.helperDataHex);
        setResult({
          matched: recovered.matched,
          errors: recovered.errors,
          commitment: chainProfile.commitment,
        });
        setStep(2);
      }
    } catch {}
  }, [scanActive, frameCount, chainProfile]);

  const startScan = () => {
    descriptorsRef.current = [];
    setFrameCount(0);
    setScanStatus('');
    setScanActive(true);
  };

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        <div style={s.pageTitle}>
          <div className="label">RECOVERY</div>
          <h1 style={s.titleText}>Cross-Device Recovery</h1>
          <p style={s.titleSub}>
            Switched devices or cleared storage? Recover your identity using on-chain helperData + a fresh face scan.
          </p>
        </div>

        {/* Stepper */}
        <div style={s.stepperWrap}>
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="step-item">
                <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'idle'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div className={`step-label ${i === step ? 'active' : ''}`}>{label}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-connector ${i < step ? 'done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="card" style={{ overflow:'hidden' }}>
          <div className="card-header">
            <div className="card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <polyline points="1,4 1,10 7,10"/><polyline points="23,20 23,14 17,14"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </div>
            <div style={s.cardTitle}>IDENTITY RECOVERY</div>
          </div>

          <div style={{ padding:'24px' }}>
            {step === 0 && (
              <div style={s.stepContent}>
                <div style={s.infoBox}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 }}>
                    Enter the wallet address that was used during registration.
                    We'll fetch your helperData from the blockchain.
                  </span>
                </div>

                <div>
                  <div className="label" style={{ marginBottom:6 }}>WALLET ADDRESS</div>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="0x..."
                    value={walletInput}
                    onChange={e => setWalletInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLookup(); }}
                  />
                </div>

                {lookupError && <div style={s.errorBox}>{lookupError}</div>}

                <button className="btn-primary" onClick={handleLookup} disabled={lookingUp || !walletInput}>
                  {lookingUp ? 'FETCHING FROM CHAIN...' : 'FETCH IDENTITY DATA'}
                </button>
              </div>
            )}

            {step === 1 && chainProfile && (
              <div style={s.stepContent}>
                <div style={s.foundBox}>
                  <span className="badge badge-accent">HELPER DATA FOUND ON-CHAIN</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8 }}>96 bytes</span>
                </div>
                <CommitmentDisplay value={chainProfile.commitment} label="REGISTERED COMMITMENT" fullWidth />

                {!scanActive ? (
                  <>
                    <div style={s.stepHint}>
                      Scan your face on this new device. BCH error correction will attempt to recover your randomSecret.
                      Up to 30 bit errors are tolerated (t=30).
                    </div>
                    <button className="btn-primary" onClick={startScan}>
                      START FACE SCAN
                    </button>
                  </>
                ) : (
                  <>
                    <FaceScanner
                      onLandmarksDetected={processLandmarks}
                      setStatus={setScanStatus}
                      frameCount={frameCount}
                      targetFrames={30}
                    />
                    <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                      {scanStatus}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 2 && result && (
              <div style={s.stepContent}>
                {result.matched ? (
                  <>
                    <div style={s.successIcon}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22,4 12,14.01 9,11.01"/>
                      </svg>
                    </div>
                    <div style={s.successTitle}>RECOVERY SUCCESSFUL</div>
                    <div style={s.successSub}>
                      Identity recovered. secretId recomputed. You can now generate proofs on this device.
                    </div>
                    <CommitmentDisplay value={result.commitment} label="RECOVERED COMMITMENT" fullWidth />
                    <div style={s.resultGrid}>
                      <div style={s.resultCell}>
                        <div className="label">BIT ERRORS</div>
                        <div style={{ fontSize:16, color:'var(--accent)', fontWeight:600, marginTop:6 }}>
                          {result.errors} / 511
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>threshold: 30</div>
                      </div>
                      <div style={s.resultCell}>
                        <div className="label">SHA-256 CHECK</div>
                        <div style={{ fontSize:16, color:'var(--accent)', fontWeight:600, marginTop:6 }}>✓ PASS</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>secret verified</div>
                      </div>
                    </div>
                    <button className="btn-primary" onClick={() => navigate('/verify')}>
                      GO TO VERIFY →
                    </button>
                  </>
                ) : (
                  <>
                    <div style={s.failIcon}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <div style={s.failTitle}>RECOVERY FAILED</div>
                    <div style={s.failSub}>
                      Too many bit errors — face does not match the registered identity,
                      or lighting/angle differs too much. Try again in better lighting.
                    </div>
                    <div style={s.resultGrid}>
                      <div style={s.resultCell}>
                        <div className="label">BIT ERRORS</div>
                        <div style={{ fontSize:16, color:'var(--danger)', fontWeight:600, marginTop:6 }}>
                          {result.errors ?? '>30'} / 511
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>threshold exceeded</div>
                      </div>
                      <div style={s.resultCell}>
                        <div className="label">BCH DECODE</div>
                        <div style={{ fontSize:16, color:'var(--danger)', fontWeight:600, marginTop:6 }}>✗ FAIL</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>cannot recover</div>
                      </div>
                    </div>
                    <button className="btn-secondary" onClick={() => {
                      setStep(1);
                      setResult(null);
                    }}>
                      TRY AGAIN
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display:'flex', justifyContent:'center', padding:'32px 24px 80px' },
  container: { width:'100%', maxWidth:520, display:'flex', flexDirection:'column', gap:16 },
  pageTitle: { textAlign:'center', marginBottom:8 },
  titleText: { fontSize:26, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em', margin:'8px 0 10px' },
  titleSub: { fontSize:12, color:'var(--text-muted)', lineHeight:1.7 },
  stepperWrap: { display:'flex', alignItems:'flex-start', justifyContent:'center', marginBottom:20 },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  stepContent: { display:'flex', flexDirection:'column', gap:12 },
  stepHint: { fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },
  infoBox: {
    display:'flex', gap:10, alignItems:'flex-start',
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
    borderRadius:8, padding:'12px 14px',
  },
  input: {
    width:'100%', padding:'10px 14px',
    background:'var(--bg-elevated)', border:'0.5px solid var(--border-base)',
    borderRadius:8, color:'var(--text-secondary)', fontSize:12,
    outline:'none',
  },
  errorBox: {
    fontSize:11, color:'var(--danger)',
    background:'var(--danger-dim)', border:'0.5px solid rgba(226,75,74,0.25)',
    borderRadius:8, padding:'10px 14px', lineHeight:1.6,
  },
  foundBox: { display:'flex', alignItems:'center', gap:0 },
  successIcon: { display:'flex', justifyContent:'center', padding:'16px 0 8px' },
  successTitle: { textAlign:'center', fontSize:18, fontWeight:600, color:'var(--accent)', letterSpacing:'0.06em' },
  successSub: { textAlign:'center', fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },
  failIcon: { display:'flex', justifyContent:'center', padding:'16px 0 8px' },
  failTitle: { textAlign:'center', fontSize:18, fontWeight:600, color:'var(--danger)', letterSpacing:'0.06em' },
  failSub: { textAlign:'center', fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },
  resultGrid: {
    display:'grid', gridTemplateColumns:'1fr 1fr',
    gap:1, background:'var(--border-base)', borderRadius:8, overflow:'hidden',
  },
  resultCell: { background:'var(--bg-surface)', padding:'16px' },
};
