import React, { useState } from 'react';
import { useWalletContext } from '../context/WalletContext';
import { CONTRACT_ADDRESS } from '../utils/contract';

const APPS = [
  {
    name: 'ZK Voting',
    desc: 'Cast anonymous votes. One human = one vote. Sybil-proof governance.',
    appAddress: '0x1111111111111111111111111111111111111111',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    name: 'DeFi Sybil Guard',
    desc: 'Prove unique humanity before claiming airdrops or protocol rewards. No bot farms.',
    appAddress: '0x2222222222222222222222222222222222222222',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
  {
    name: 'Private Forum',
    desc: 'Post without revealing your wallet. Prove you\'re human. Maintain privacy.',
    appAddress: '0x3333333333333333333333333333333333333333',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.5">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    name: 'NFT Allowlist',
    desc: 'One mint per human. Prevent bot farms from sweeping allowlists.',
    appAddress: '0x4444444444444444444444444444444444444444',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
    ),
  },
];

const CODE_SNIPPET = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPrivacyShield {
    function verifyAndExecute(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[4]    calldata publicSignals
    ) external;
}

contract MyApp {
    address constant PRIVACY_SHIELD =
        ${CONTRACT_ADDRESS};

    function verifyUser(
        uint256[2]    calldata a,
        uint256[2][2] calldata b,
        uint256[2]    calldata c,
        uint256[4]    calldata publicSignals
    ) external {
        // Verifies Groth16 proof on-chain
        IPrivacyShield(PRIVACY_SHIELD)
            .verifyAndExecute(a, b, c, publicSignals);

        // publicSignals[2] = user wallet (uint160)
        address user = address(uint160(publicSignals[2]));
        // Your logic here — user is verified human
    }
}`;

export default function AppsPage() {
  const wallet = useWalletContext();
  const [copied, setCopied] = useState(false);
  const [expandedApp, setExpandedApp] = useState(null);
  const [abiOpen, setAbiOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const getNullifierNote = (appAddress) => {
    if (!wallet.isConnected) return `Poseidon(secretId, ${appAddress.slice(0,8)}…, wallet)`;
    return `Poseidon(secretId, ${appAddress.slice(0,8)}…, ${wallet.account.slice(0,8)}…)`;
  };

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        <div style={s.pageTitle}>
          <div className="label">ECOSYSTEM</div>
          <h1 style={s.titleText}>Apps & Integrations</h1>
          <p style={s.titleSub}>
            Verify your PrivacyShield identity in these apps — one proof per app, cross-app isolated.
          </p>
        </div>

        {/* App grid */}
        <section>
          <div style={s.sectionLabel}>VERIFY YOUR IDENTITY IN THESE APPS</div>
          <div style={s.appGrid}>
            {APPS.map((app, i) => (
              <div key={app.name} className="card" style={s.appCard}>
                <div style={s.appCardHeader}>
                  <div style={s.appIcon}>{app.icon}</div>
                  <div>
                    <div style={s.appName}>{app.name}</div>
                    <span className="badge badge-accent" style={{ marginTop:4, display:'inline-flex' }}>
                      ZK PROOF REQUIRED
                    </span>
                  </div>
                </div>
                <div style={s.appDesc}>{app.desc}</div>
                <div style={s.appAddress}>
                  <div className="label" style={{ marginBottom:4 }}>APP ADDRESS</div>
                  <div style={s.addressVal}>{app.appAddress.slice(0,10)}…{app.appAddress.slice(-6)}</div>
                </div>
                <div style={s.nullifierNote}>
                  <div className="label" style={{ marginBottom:4 }}>YOUR NULLIFIER</div>
                  <div style={s.nullifierVal}>{getNullifierNote(app.appAddress)}</div>
                </div>
                <button
                  className="btn-secondary"
                  style={{ fontSize:10, padding:'8px 12px' }}
                  onClick={() => setExpandedApp(expandedApp === i ? null : i)}
                >
                  {expandedApp === i ? 'HIDE DETAILS' : 'VIEW INTEGRATION'}
                </button>
                {expandedApp === i && (
                  <div style={s.integNote}>
                    Each app uses a unique nullifier: Poseidon(secretId, app_address, wallet).
                    Your proof from PrivacyShield cannot be replayed on other apps.
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Integration code */}
        <section>
          <div style={s.sectionLabel}>INTEGRATE PRIVACYSHIELD INTO YOUR DAPP</div>
          <div className="card">
            <div className="card-header">
              <div className="card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                  <polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/>
                </svg>
              </div>
              <div style={s.cardTitle}>SOLIDITY INTEGRATION EXAMPLE</div>
              <button style={s.copyBtn} onClick={handleCopy}>
                {copied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                )}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <pre style={s.codeBlock}>{CODE_SNIPPET}</pre>
          </div>
        </section>

        {/* ABI */}
        <section>
          <div className="card">
            <div className="card-header" style={{ cursor:'pointer' }} onClick={() => setAbiOpen(v => !v)}>
              <div className="card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                </svg>
              </div>
              <div style={s.cardTitle}>CONTRACT ABI (PRIVACY SHIELD)</div>
              <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>
                {abiOpen ? '▲ COLLAPSE' : '▼ EXPAND'}
              </span>
            </div>
            {abiOpen && (
              <pre style={s.abiBlock}>{JSON.stringify(MINI_ABI, null, 2)}</pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const MINI_ABI = [
  { type:'function', name:'registerIdentity',
    inputs:[{name:'userWallet',type:'address'},{name:'commitment',type:'uint256'},{name:'helperData',type:'bytes'}] },
  { type:'function', name:'verifyAndExecute',
    inputs:[{name:'a',type:'uint256[2]'},{name:'b',type:'uint256[2][2]'},{name:'c',type:'uint256[2]'},{name:'publicSignals',type:'uint256[4]'}] },
  { type:'function', name:'getProfile',
    inputs:[{name:'userWallet',type:'address'}],
    outputs:[{name:'commitment',type:'uint256'},{name:'helperData',type:'bytes'},{name:'exists',type:'bool'}] },
  { type:'event', name:'IdentityRegistered',
    inputs:[{name:'registrant',type:'address',indexed:true},{name:'commitment',type:'uint256',indexed:true}] },
  { type:'event', name:'ActionVerified',
    inputs:[{name:'nullifier',type:'uint256',indexed:true},{name:'user',type:'address',indexed:true}] },
];

const s = {
  page: { display:'flex', justifyContent:'center', padding:'80px 24px 80px' },
  container: { width:'100%', maxWidth:900, display:'flex', flexDirection:'column', gap:32 },
  pageTitle: { textAlign:'center', marginBottom:8 },
  titleText: { fontSize:26, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em', margin:'8px 0 10px' },
  titleSub: { fontSize:12, color:'var(--text-muted)', lineHeight:1.7 },
  sectionLabel: {
    fontSize:10, textTransform:'uppercase', letterSpacing:'0.12em',
    color:'var(--text-muted)', marginBottom:16,
  },
  appGrid: {
    display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12,
  },
  appCard: { padding:'20px', display:'flex', flexDirection:'column', gap:12 },
  appCardHeader: { display:'flex', gap:12, alignItems:'flex-start' },
  appIcon: {
    width:40, height:40, borderRadius:8,
    background:'var(--bg-elevated)', border:'0.5px solid var(--border-base)',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
  },
  appName: { fontSize:14, fontWeight:600, color:'var(--text-primary)' },
  appDesc: { fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 },
  appAddress: {
    background:'var(--bg-elevated)', borderRadius:8,
    padding:'10px 14px', border:'0.5px solid var(--border-base)',
  },
  addressVal: { fontSize:11, color:'var(--text-muted)', marginTop:2, fontFamily:'monospace' },
  nullifierNote: {
    background:'var(--purple-dim)', borderRadius:8,
    padding:'10px 14px', border:'0.5px solid rgba(169,126,245,0.2)',
  },
  nullifierVal: { fontSize:10, color:'var(--purple)', marginTop:2, fontFamily:'monospace', wordBreak:'break-all' },
  integNote: {
    fontSize:11, color:'var(--text-secondary)', lineHeight:1.7,
    background:'var(--bg-elevated)', borderRadius:8, padding:'10px 14px',
    border:'0.5px solid var(--border-base)',
  },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  copyBtn: {
    marginLeft:'auto', display:'flex', alignItems:'center', gap:6,
    fontSize:10, color:'var(--text-muted)', letterSpacing:'0.06em',
    background:'var(--bg-elevated)', border:'0.5px solid var(--border-base)',
    borderRadius:6, padding:'5px 10px', cursor:'pointer',
  },
  codeBlock: {
    padding:'20px 24px', fontSize:11, lineHeight:1.8,
    color:'var(--text-secondary)', overflowX:'auto',
    background:'var(--bg-elevated)',
    borderTop:'0.5px solid var(--border-base)',
    whiteSpace:'pre',
  },
  abiBlock: {
    padding:'20px 24px', fontSize:10, lineHeight:1.7,
    color:'var(--text-muted)', overflowX:'auto',
    borderTop:'0.5px solid var(--border-base)',
    whiteSpace:'pre',
  },
};
