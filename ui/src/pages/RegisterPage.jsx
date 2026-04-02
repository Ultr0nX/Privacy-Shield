import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FaceScanner from '../components/FaceScanner';
import CommitmentDisplay from '../components/CommitmentDisplay';
import TxHashDisplay from '../components/TxHashDisplay';
import { useWalletContext } from '../context/WalletContext';
import { useBiometric } from '../hooks/useBiometric';
import { useRegistration } from '../hooks/useRegistration';
import { getProfileFromChain } from '../utils/contract';

const STEPS = ['CONNECT', 'SCAN FACE', 'IDENTITY', 'REGISTER'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const wallet = useWalletContext();
  const biometric = useBiometric(30, wallet.isConnected ? wallet.signForIdentity : null, wallet.account);
  const registration = useRegistration(biometric.commitment);

  const [step, setStep] = useState(0);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  // Initialize poseidon on mount
  useEffect(() => { biometric.initializePoseidon(); }, [biometric.initializePoseidon]);

  // Advance step when wallet connects — but check on-chain first
  useEffect(() => {
    if (!wallet.isConnected || step !== 0) return;
    getProfileFromChain(wallet.account).then(profile => {
      setAlreadyRegistered(!!profile);
      // If already registered on-chain, skip straight to the "already registered" card (step 5)
      if (profile) {
        setStep(5);
      } else {
        setStep(1);
      }
    }).catch(() => { setStep(1); });
  }, [wallet.isConnected, wallet.account]); // eslint-disable-line react-hooks/exhaustive-deps

  // Advance step when face scan completes
  useEffect(() => {
    if (biometric.verified && step === 1) setStep(2);
  }, [biometric.verified, step]);

  const handleConnect = async () => {
    try { await wallet.connect(); } catch (err) { setError(err.message); }
  };

  const handleRegister = async () => {
    setError('');
    setRegistering(true);
    try {
      // Block if different person already registered this wallet
      const existing = await getProfileFromChain(wallet.account);
      if (existing && existing.commitment !== biometric.commitment) {
        setError('This wallet is already registered to a different biometric identity.');
        setRegistering(false);
        return;
      }
      const result = await registration.register(biometric.helperDataHex, wallet.account);
      setTxHash(result.tx_hash);
      setStep(4); // success
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  const renderStep = () => {
    if (step === 4) return renderSuccess();
    if (step === 5) return renderAlreadyRegistered();
    switch (step) {
      case 0: return renderConnect();
      case 1: return renderScan();
      case 2: return renderIdentity();
      case 3: return renderRegisterConfirm();
      default: return renderConnect();
    }
  };

  const renderAlreadyRegistered = () => (
    <div style={s.stepContent}>
      <div style={{ display:'flex', justifyContent:'center', padding:'16px 0 8px' }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div style={{ textAlign:'center', fontSize:16, fontWeight:600, color:'var(--accent)', letterSpacing:'0.06em' }}>
        ALREADY REGISTERED
      </div>
      <div style={{ textAlign:'center', fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 }}>
        This wallet already has a biometric identity registered on-chain.
        Each wallet can only hold one identity.
      </div>
      <div style={s.warnBox}>
        ⚠️ To protect your identity, the face scanner is disabled here.
        Starting a new face scan with an already-registered wallet would write mismatched helperData
        to your browser storage, breaking verification. Go to Verify instead.
      </div>
      <button className="btn-primary" onClick={() => navigate('/verify')}>
        GO TO VERIFY IDENTITY →
      </button>
      <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
        VIEW DASHBOARD
      </button>
    </div>
  );

  const renderConnect = () => (
    <div style={s.stepContent}>
      <div style={s.stepHint}>
        Connect your MetaMask wallet to begin. Your wallet address is cryptographically bound to your face.
      </div>
      {alreadyRegistered && (
        <div style={s.warnBox}>
          ⚠️ This wallet already has a registered identity.{' '}
          <span style={{ color:'var(--accent)', cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
            Go to Dashboard →
          </span>
        </div>
      )}
      <button className="btn-primary" onClick={handleConnect} disabled={wallet.connecting}>
        {wallet.connecting ? 'CONNECTING...' : 'CONNECT METAMASK'}
      </button>
    </div>
  );

  const renderScan = () => (
    <div style={s.stepContent}>
      {alreadyRegistered && (
        <div style={s.warnBox}>
          ⚠️ This wallet already has a registered identity on-chain.{' '}
          <span style={{ color:'var(--accent)', cursor:'pointer' }} onClick={() => navigate('/dashboard')}>
            Go to Dashboard →
          </span>
        </div>
      )}
      <div style={s.scanBadge}>
        <span style={s.badgeLabel}>REGISTRATION SCAN · 30 FRAMES · LIVENESS DETECTION</span>
      </div>
      <FaceScanner
        onLandmarksDetected={biometric.processLandmarks}
        setStatus={() => {}}
        frameCount={biometric.validFrames}
        targetFrames={30}
      />
      <div style={s.scanMeta}>
        <span style={{ color:'var(--text-muted)', fontSize:11 }}>{biometric.status}</span>
        <span style={{ color:'var(--accent)', fontSize:11 }}>{biometric.validFrames}/30 frames</span>
      </div>
      {biometric.recoveryErrors !== null && (
        <div style={s.infoRow}>
          <span className="badge badge-accent">BCH recovered with {biometric.recoveryErrors} corrected bit errors</span>
        </div>
      )}
    </div>
  );

  const renderIdentity = () => (
    <div style={s.stepContent}>
      <div style={s.stepAlert}>
        <div style={s.alertNum}>2</div>
        <div>
          <div style={s.alertTitle}>IDENTITY COMPUTED</div>
          <div style={s.alertDesc}>
            Your secretId and commitment have been derived from your face + wallet.
            Review below and register on-chain.
          </div>
        </div>
      </div>

      <div style={s.infoGrid}>
        <div style={s.infoCell}>
          <div className="label">ALGORITHM</div>
          <div style={s.cellVal}>Groth16 + Poseidon</div>
        </div>
        <div style={s.infoCell}>
          <div className="label">NETWORK</div>
          <div style={s.cellVal}>Sepolia (11155111)</div>
        </div>
        <div style={s.infoCell}>
          <div className="label">BCH ERRORS</div>
          <div style={s.cellVal}>{biometric.recoveryErrors !== null ? `${biometric.recoveryErrors} / 30` : 'N/A (enrolled)'}</div>
        </div>
        <div style={s.infoCell}>
          <div className="label">HELPER DATA</div>
          <div style={s.cellVal}>96 bytes</div>
        </div>
      </div>

      <CommitmentDisplay value={biometric.commitment} label="BIOMETRIC COMMITMENT" fullWidth />

      <div style={{ marginTop:8 }}>
        <div className="label" style={{ marginBottom:6 }}>SECRET ID (TRUNCATED)</div>
        <div className="field-box">
          {biometric.secretId
            ? `${biometric.secretId.slice(0,14)}...${biometric.secretId.slice(-6)}`
            : '—'}
        </div>
      </div>

      <button className="btn-primary" style={{ marginTop:16 }} onClick={() => setStep(3)}>
        PROCEED TO REGISTER
      </button>
      <button className="btn-secondary" style={{ marginTop:8 }} onClick={() => {
        biometric.reset();
        setStep(1);
      }}>
        RE-SCAN FACE
      </button>
    </div>
  );

  const renderRegisterConfirm = () => (
    <div style={s.stepContent}>
      <div style={s.stepAlert}>
        <div style={s.alertNum}>3</div>
        <div>
          <div style={s.alertTitle}>REGISTER ON-CHAIN</div>
          <div style={s.alertDesc}>
            The relayer will submit your commitment and helperData to PrivacyShield.sol on Sepolia.
            You pay no gas.
          </div>
        </div>
      </div>

      <CommitmentDisplay value={biometric.commitment} label="COMMITMENT TO REGISTER" fullWidth />

      {error && <div style={s.errorBox}>{error}</div>}

      <button
        className="btn-primary"
        style={{ marginTop:16 }}
        onClick={handleRegister}
        disabled={registering}
      >
        {registering ? 'REGISTERING...' : 'REGISTER IDENTITY ON-CHAIN'}
      </button>
      <button className="btn-secondary" style={{ marginTop:8 }} onClick={() => setStep(2)}>
        BACK
      </button>
    </div>
  );

  const renderSuccess = () => (
    <div style={s.stepContent}>
      <div style={s.successIcon}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
      </div>
      <div style={s.successTitle}>IDENTITY REGISTERED</div>
      <div style={s.successSub}>
        Your biometric commitment is now anchored on Sepolia testnet.
        Scan your face again to verify your identity with a ZK proof.
      </div>

      <CommitmentDisplay value={biometric.commitment} label="REGISTERED COMMITMENT" fullWidth />
      <div style={{ marginTop:8 }}>
        <TxHashDisplay hash={txHash} label="REGISTRATION TX" />
      </div>

      <div style={s.checkList}>
        {['Face scan complete (30 frames averaged)', 'BCH fuzzy extractor enrolled', 'Commitment registered on-chain'].map(item => (
          <div key={item} style={s.checkRow}>
            <span style={s.checkMark}>✓</span>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{item}</span>
          </div>
        ))}
      </div>

      <button className="btn-primary" style={{ marginTop:8 }} onClick={() => navigate('/verify')}>
        GO TO VERIFY →
      </button>
      <button className="btn-secondary" style={{ marginTop:8 }} onClick={() => navigate('/dashboard')}>
        VIEW DASHBOARD
      </button>
    </div>
  );

  const currentStep = step >= 4 ? 4 : step;

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        {/* Page title */}
        <div style={s.pageTitle}>
          <div className="label">REGISTER</div>
          <h1 style={s.titleText}>Create Your ZK Identity</h1>
          <p style={s.titleSub}>
            Link your face to your wallet. Generate a Poseidon commitment. Store it on-chain.
          </p>
        </div>

        {/* Stepper */}
        <div style={s.stepperWrap}>
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="step-item">
                <div className={`step-circle ${i < currentStep ? 'done' : i === currentStep ? 'active' : 'idle'}`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <div className={`step-label ${i === currentStep ? 'active' : ''}`}>{label}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-connector ${i < currentStep ? 'done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="card" style={s.card}>
          <div className="card-header">
            <div className="card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={s.cardTitle}>BIOMETRIC ZK-ID</div>
              <div style={s.cardSub}>Zero-knowledge identity registration</div>
            </div>
            {wallet.account && (
              <span className="badge badge-accent" style={{ marginLeft:'auto' }}>
                {wallet.account.slice(0,6)}…{wallet.account.slice(-4)}
              </span>
            )}
          </div>
          <div style={{ padding:'24px 24px' }}>
            {renderStep()}
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

  stepperWrap: {
    display:'flex', alignItems:'flex-start', justifyContent:'center',
    marginBottom:28, gap:0,
  },

  card: { overflow:'hidden' },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  cardSub: { fontSize:11, color:'var(--text-muted)', marginTop:2 },

  stepContent: { display:'flex', flexDirection:'column', gap:12 },
  stepHint: { fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },

  warnBox: {
    fontSize:11, color:'var(--warn)',
    background:'rgba(239,159,39,0.08)', border:'0.5px solid rgba(239,159,39,0.25)',
    borderRadius:8, padding:'10px 14px', lineHeight:1.6,
  },
  errorBox: {
    fontSize:11, color:'var(--danger)',
    background:'var(--danger-dim)', border:'0.5px solid rgba(226,75,74,0.25)',
    borderRadius:8, padding:'10px 14px', lineHeight:1.6,
  },

  scanBadge: {
    padding:'8px 14px', borderRadius:6,
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
    textAlign:'center',
  },
  badgeLabel: { fontSize:9, letterSpacing:'0.1em', color:'var(--accent)', textTransform:'uppercase' },

  scanMeta: {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'8px 0',
  },
  infoRow: { display:'flex', gap:8, flexWrap:'wrap' },

  stepAlert: {
    display:'flex', gap:12, alignItems:'flex-start',
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
    borderLeft:'3px solid var(--accent)',
    borderRadius:'0 8px 8px 0', padding:'14px 16px',
  },
  alertNum: {
    width:22, height:22, borderRadius:'50%',
    background:'var(--accent)', color:'#0A0F1E',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:11, fontWeight:700, flexShrink:0,
  },
  alertTitle: { fontSize:11, fontWeight:600, color:'var(--accent)', letterSpacing:'0.06em', marginBottom:3 },
  alertDesc: { fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 },

  infoGrid: {
    display:'grid', gridTemplateColumns:'1fr 1fr',
    gap:1, background:'var(--border-base)', borderRadius:8, overflow:'hidden',
  },
  infoCell: { background:'var(--bg-surface)', padding:'12px 14px' },
  cellVal: { fontSize:12, color:'var(--text-secondary)', marginTop:4 },

  successIcon: {
    display:'flex', justifyContent:'center',
    padding:'20px 0 12px',
  },
  successTitle: {
    textAlign:'center', fontSize:18, fontWeight:600,
    color:'var(--accent)', letterSpacing:'0.06em',
  },
  successSub: {
    textAlign:'center', fontSize:12, color:'var(--text-secondary)',
    lineHeight:1.7,
  },
  checkList: { display:'flex', flexDirection:'column', gap:0, marginTop:8 },
  checkRow: {
    display:'flex', alignItems:'center', gap:12, padding:'8px 0',
    borderBottom:'0.5px solid var(--border-base)',
  },
  checkMark: {
    width:20, height:20, borderRadius:'50%',
    background:'var(--accent-dim)', color:'var(--accent)',
    border:'0.5px solid var(--accent-border)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:10, fontWeight:700, flexShrink:0,
  },
};
