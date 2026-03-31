import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS } from '../utils/contract';

const ABI_EVENTS = [
  { type:'event', name:'IdentityRegistered', inputs:[
    { name:'registrant', type:'address', indexed:true },
    { name:'commitment',  type:'uint256', indexed:true },
  ], anonymous:false },
  { type:'event', name:'ActionVerified', inputs:[
    { name:'nullifier', type:'uint256', indexed:true },
    { name:'user',      type:'address', indexed:true },
  ], anonymous:false },
];

const HOW_IT_WORKS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 14 0v2"/>
      </svg>
    ),
    title: 'Face Scan (Local)',
    desc: 'MediaPipe extracts 511 facial bits entirely in your browser. No image, no embedding — nothing biometric ever leaves your device.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: 'ZK Proof',
    desc: 'A Groth16 proof proves you know the secret behind your commitment. The secretId is never revealed — only its Poseidon hash.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.5">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    title: 'On-Chain Commitment',
    desc: 'Only a Poseidon(secretId) hash is stored on Ethereum. Nothing links back to your face, your wallet, or your identity.',
  },
];

const TECH_TAGS = ['Groth16', 'Poseidon', 'BCH(511,259,t=30)', 'BN128', 'Circom 2.0', 'Sepolia', 'MediaPipe', 'ethers.js'];

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ registered: '—', verified: '—', block: '—' });
  const [live, setLive] = useState(false);
  const intervalRef = useRef(null);

  const fetchStats = async () => {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI_EVENTS, provider);
      const blockNumber = await provider.getBlockNumber();
      const fromBlock = Math.max(0, blockNumber - 50000);
      const [regEvts, verEvts] = await Promise.all([
        contract.queryFilter(contract.filters.IdentityRegistered(), fromBlock, 'latest'),
        contract.queryFilter(contract.filters.ActionVerified(),     fromBlock, 'latest'),
      ]);
      setStats({ registered: regEvts.length, verified: verEvts.length, block: blockNumber });
      setLive(true);
    } catch { setLive(false); }
  };

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div style={s.page}>
      {/* Hero */}
      <section style={s.hero}>
        {/* Animated rings behind heading */}
        <div style={s.ring1} />
        <div style={s.ring2} />
        <div style={s.ring3} />

        <div style={s.heroContent}>
          <div style={s.heroBadge}>
            <span className="status-dot blink" />
            LIVE ON SEPOLIA TESTNET
          </div>
          <h1 style={s.heroTitle}>
            Prove you're human.<br />
            <span style={s.heroAccent}>Zero knowledge. No data stored.</span>
          </h1>
          <p style={s.heroSub}>
            Link your face to your wallet cryptographically. A Groth16 ZK proof verifies your humanity on-chain.
            No biometric data ever leaves your browser.
          </p>
          <div style={s.heroButtons}>
            <button className="btn-primary" style={s.heroBtnPrimary} onClick={() => navigate('/register')}>
              Register Identity
            </button>
            <button className="btn-secondary" style={s.heroBtnSec} onClick={() => {
              document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
            }}>
              How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <div style={s.statsBar}>
        <span style={s.statItem}>
          <span style={s.statVal}>{stats.registered}</span>
          <span style={s.statLabel}>Identities Registered</span>
        </span>
        <span style={s.statDot} />
        <span style={s.statItem}>
          <span style={s.statVal}>{stats.verified}</span>
          <span style={s.statLabel}>Proofs Generated</span>
        </span>
        <span style={s.statDot} />
        <span style={s.statItem}>
          <span style={s.statVal}>Sepolia Testnet</span>
        </span>
        <span style={s.statDot} />
        <span style={s.statItem}>
          <span style={s.statVal}>Block #{stats.block}</span>
        </span>
        {live && (
          <span style={s.liveIndicator}>
            <span className="status-dot blink" />
            LIVE
          </span>
        )}
      </div>

      {/* How it works */}
      <section id="how-it-works" style={s.section}>
        <div style={s.sectionLabel}>HOW IT WORKS</div>
        <h2 style={s.sectionTitle}>Privacy-preserving identity in three steps</h2>
        <div style={s.cardsRow}>
          {HOW_IT_WORKS.map((item, i) => (
            <div key={i} className="card" style={s.howCard}>
              <div style={s.howCardIcon}>
                {item.icon}
                <span style={s.howCardNum}>{i + 1}</span>
              </div>
              <div style={s.howCardTitle}>{item.title}</div>
              <div style={s.howCardDesc}>{item.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack strip */}
      <section style={s.techStrip}>
        {TECH_TAGS.map(tag => (
          <span key={tag} style={s.techTag}>{tag}</span>
        ))}
      </section>

      {/* CTA */}
      <section style={s.cta}>
        <div style={s.ctaCard}>
          <div style={s.ctaTitle}>Ready to prove your identity?</div>
          <div style={s.ctaSub}>One wallet. One face. One commitment. Forever on-chain.</div>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <button className="btn-primary" style={{ width:'auto', padding:'12px 32px' }}
              onClick={() => navigate('/register')}>
              Register Now
            </button>
            <button className="btn-secondary" style={{ width:'auto', padding:'12px 32px' }}
              onClick={() => navigate('/verify')}>
              Verify Identity
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: 'var(--bg-base)' },

  // Hero
  hero: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '90vh',
    overflow: 'hidden',
    padding: '60px 24px 80px',
  },
  ring1: {
    position:'absolute', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    width:400, height:400, borderRadius:'50%',
    border:'1px solid rgba(20,196,162,0.15)',
    animation:'heroRing 4s ease-in-out infinite',
    pointerEvents:'none',
  },
  ring2: {
    position:'absolute', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    width:600, height:600, borderRadius:'50%',
    border:'1px solid rgba(20,196,162,0.08)',
    animation:'heroRing 4s ease-in-out infinite 0.8s',
    pointerEvents:'none',
  },
  ring3: {
    position:'absolute', top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    width:800, height:800, borderRadius:'50%',
    border:'1px solid rgba(20,196,162,0.04)',
    animation:'heroRing 4s ease-in-out infinite 1.6s',
    pointerEvents:'none',
  },
  heroContent: {
    position:'relative', zIndex:2,
    textAlign:'center', maxWidth:680,
  },
  heroBadge: {
    display:'inline-flex', alignItems:'center', gap:8,
    fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase',
    color:'var(--accent)',
    padding:'5px 14px', borderRadius:20,
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
    marginBottom:28,
  },
  heroTitle: {
    fontSize:40, fontWeight:600, color:'var(--text-primary)',
    lineHeight:1.25, letterSpacing:'-0.01em', marginBottom:20,
  },
  heroAccent: { color:'var(--accent)' },
  heroSub: {
    fontSize:13, color:'var(--text-secondary)', lineHeight:1.8,
    marginBottom:36, maxWidth:560, margin:'0 auto 36px',
  },
  heroButtons: { display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' },
  heroBtnPrimary: { width:'auto', padding:'13px 32px' },
  heroBtnSec: { width:'auto', padding:'13px 32px' },

  // Stats bar
  statsBar: {
    display:'flex', alignItems:'center', justifyContent:'center',
    gap:16, flexWrap:'wrap',
    padding:'14px 24px',
    borderTop:'0.5px solid var(--border-base)',
    borderBottom:'0.5px solid var(--border-base)',
    background:'var(--bg-surface)',
  },
  statItem: { display:'flex', alignItems:'center', gap:6 },
  statVal: { fontSize:13, color:'var(--text-primary)', fontWeight:500 },
  statLabel: { fontSize:11, color:'var(--text-muted)' },
  statDot: { width:3, height:3, borderRadius:'50%', background:'var(--border-base)' },
  liveIndicator: {
    display:'flex', alignItems:'center', gap:5,
    fontSize:10, color:'var(--accent)', letterSpacing:'0.1em',
    padding:'3px 8px', borderRadius:20,
    background:'var(--accent-dim)', border:'0.5px solid var(--accent-border)',
  },

  // How it works
  section: { maxWidth:1000, margin:'0 auto', padding:'80px 24px' },
  sectionLabel: {
    fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em',
    color:'var(--accent)', marginBottom:12, textAlign:'center',
  },
  sectionTitle: {
    fontSize:24, fontWeight:600, color:'var(--text-primary)',
    textAlign:'center', marginBottom:48, letterSpacing:'-0.01em',
  },
  cardsRow: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 },
  howCard: { padding:24, display:'flex', flexDirection:'column', gap:14 },
  howCardIcon: {
    display:'flex', alignItems:'center', justifyContent:'space-between',
  },
  howCardNum: {
    fontSize:32, fontWeight:600, color:'var(--border-base)',
    lineHeight:1, fontFamily:'monospace',
  },
  howCardTitle: {
    fontSize:14, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.02em',
  },
  howCardDesc: { fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },

  // Tech strip
  techStrip: {
    display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center',
    padding:'24px', borderTop:'0.5px solid var(--border-base)',
    borderBottom:'0.5px solid var(--border-base)',
  },
  techTag: {
    fontSize:11, padding:'5px 12px', borderRadius:4,
    background:'var(--bg-surface)', border:'0.5px solid var(--border-base)',
    color:'var(--text-muted)', letterSpacing:'0.04em',
  },

  // CTA
  cta: { padding:'80px 24px', display:'flex', justifyContent:'center' },
  ctaCard: {
    maxWidth:560, width:'100%', textAlign:'center',
    padding:40, borderRadius:12,
    background:'var(--bg-surface)', border:'0.5px solid var(--accent-border)',
  },
  ctaTitle: {
    fontSize:22, fontWeight:600, color:'var(--text-primary)',
    letterSpacing:'-0.01em', marginBottom:12,
  },
  ctaSub: {
    fontSize:12, color:'var(--text-secondary)', lineHeight:1.7,
    marginBottom:28,
  },
};
