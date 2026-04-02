import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import CommitmentDisplay from '../components/CommitmentDisplay';
import TxHashDisplay from '../components/TxHashDisplay';
import { useWalletContext } from '../context/WalletContext';
import { CONTRACT_ADDRESS, getProfileFromChain } from '../utils/contract';

const ABI = [
  { type:'function', name:'getProfile', inputs:[{name:'userWallet',type:'address'}],
    outputs:[{name:'commitment',type:'uint256'},{name:'helperData',type:'bytes'},{name:'exists',type:'bool'}],
    stateMutability:'view' },
  { type:'event', name:'IdentityRegistered', inputs:[
    {name:'registrant',type:'address',indexed:true},{name:'commitment',type:'uint256',indexed:true}],anonymous:false },
  { type:'event', name:'ActionVerified', inputs:[
    {name:'nullifier',type:'uint256',indexed:true},{name:'user',type:'address',indexed:true}],anonymous:false },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const wallet = useWalletContext();

  const [profile, setProfile] = useState(null);
  const [regEvent, setRegEvent] = useState(null);
  const [verEvents, setVerEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!wallet.isConnected || !wallet.account) return;
    setLoading(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

      const addrLower = wallet.account.toLowerCase();
      const checksumAddr = ethers.utils.getAddress(wallet.account);

      // Mirror HomePage's proven approach: no address filter on ActionVerified,
      // filter client-side. Alchemy silently drops sparse topic filters (null, addr).
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000);

      const [onChainProfile, regEvts, allVerEvts] = await Promise.all([
        getProfileFromChain(wallet.account),
        contract.queryFilter(contract.filters.IdentityRegistered(checksumAddr), fromBlock, 'latest'),
        contract.queryFilter(contract.filters.ActionVerified(), fromBlock, 'latest'),
      ]);
      const verEvts = allVerEvts.filter(ev =>
        ev.args.user.toLowerCase() === addrLower
      );

      setProfile(onChainProfile);

      if (regEvts.length > 0) {
        const ev = regEvts[regEvts.length - 1];
        setRegEvent({ block: ev.blockNumber, tx: ev.transactionHash });
      }

      const enriched = await Promise.all(verEvts.map(async ev => {
        let ts = null;
        try { const b = await provider.getBlock(ev.blockNumber); ts = b.timestamp * 1000; } catch {}
        return {
          nullifier: ev.args.nullifier.toString(),
          tx: ev.transactionHash,
          block: ev.blockNumber,
          timestamp: ts,
        };
      }));
      setVerEvents(enriched.reverse());
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet.account, wallet.isConnected]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15_000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (!wallet.isConnected) {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.centerWrap}>
          <div className="card" style={{ padding:40, textAlign:'center' }}>
            <div style={s.cardTitle}>DASHBOARD</div>
            <div style={s.cardSub}>Connect your wallet to view your identity dashboard.</div>
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={async () => { try { await wallet.connect(); } catch (e) { alert(e.message); } }}>
              CONNECT WALLET
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.centerWrap}>
          <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
            <span className="status-dot blink" style={{ marginRight:8 }} />
            Loading identity data...
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.centerWrap}>
          <div className="card" style={{ padding:40, textAlign:'center' }}>
            <div style={s.cardTitle}>NO IDENTITY FOUND</div>
            <div style={s.cardSub}>This wallet has no registered identity on-chain.</div>
            <button className="btn-primary" style={{ marginTop:20 }} onClick={() => navigate('/register')}>
              REGISTER IDENTITY
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVerified = verEvents.length > 0;
  const lastVerified = verEvents[0];

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        <div style={s.pageTitle}>
          <div className="label">DASHBOARD</div>
          <h1 style={s.titleText}>Identity Overview</h1>
        </div>

        {/* Identity Card */}
        <div className="card" style={s.identityCard}>
          <div className="card-header">
            <div className="card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={s.cardTitle}>BIOMETRIC ZK-ID</div>
              <div style={s.cardSub}>Zero-knowledge identity protocol</div>
            </div>
            <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
              <span className="badge badge-accent">REGISTERED ✓</span>
              {isVerified
                ? <span className="badge badge-accent">VERIFIED ✓</span>
                : <span className="badge badge-warn">PROOF PENDING</span>}
            </div>
          </div>

          <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            <CommitmentDisplay value={profile.commitment} label="BIOMETRIC COMMITMENT" fullWidth />

            <div style={s.infoGrid}>
              <div style={s.infoCell}>
                <div className="label">NETWORK</div>
                <div style={s.cellVal}>Sepolia (11155111)</div>
              </div>
              <div style={s.infoCell}>
                <div className="label">ALGORITHM</div>
                <div style={s.cellVal}>Groth16 + Poseidon + BCH</div>
              </div>
              <div style={s.infoCell}>
                <div className="label">HELPER DATA</div>
                <div style={s.cellVal}>96 bytes on-chain</div>
              </div>
              <div style={s.infoCell}>
                <div className="label">REGISTRATION BLOCK</div>
                <div style={s.cellVal}>#{regEvent?.block ?? '—'}</div>
              </div>
              {regEvent?.tx && (
                <div style={{ ...s.infoCell, gridColumn:'1/-1' }}>
                  <TxHashDisplay hash={regEvent.tx} label="REGISTRATION TX" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={s.statsRow}>
          {[
            { label:'PROOFS SUBMITTED', val: verEvents.length },
            { label:'LAST VERIFIED', val: lastVerified?.timestamp
                ? new Date(lastVerified.timestamp).toLocaleDateString()
                : '—' },
            { label:'NULLIFIERS USED', val: verEvents.length },
          ].map(({ label, val }) => (
            <div key={label} className="card" style={s.statCard}>
              <div className="label" style={{ marginBottom:10 }}>{label}</div>
              <div style={s.statVal}>{val}</div>
            </div>
          ))}
        </div>

        {/* Proof history */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
              </svg>
            </div>
            <div style={s.cardTitle}>PROOF HISTORY</div>
            <span className="badge badge-accent" style={{ marginLeft:'auto' }}>
              {verEvents.length} proofs
            </span>
          </div>

          {verEvents.length === 0 ? (
            <div style={s.emptyState}>
              No proofs submitted yet.{' '}
              <span style={{ color:'var(--accent)', cursor:'pointer' }} onClick={() => navigate('/verify')}>
                Go to Verify →
              </span>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['#', 'TIMESTAMP', 'NULLIFIER', 'TX HASH', 'BLOCK'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {verEvents.map((ev, i) => (
                    <tr key={ev.tx} style={s.tr}>
                      <td style={s.td}>{i + 1}</td>
                      <td style={s.td}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : `Block #${ev.block}`}
                      </td>
                      <td style={s.td}>
                        <span className="badge badge-purple">
                          {ev.nullifier.slice(0,8)}…{ev.nullifier.slice(-4)}
                        </span>
                      </td>
                      <td style={s.td}>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${ev.tx}`}
                          target="_blank" rel="noreferrer"
                          style={{ color:'var(--accent)', fontSize:11 }}
                        >
                          {ev.tx.slice(0,8)}…{ev.tx.slice(-4)} ↗
                        </a>
                      </td>
                      <td style={s.td}>#{ev.block}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:12, marginTop:8 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={() => navigate('/verify')}>
            VERIFY AGAIN
          </button>
          <button className="btn-secondary" style={{ flex:1 }} onClick={loadData} disabled={loading}>
            {loading ? 'REFRESHING...' : '↻ REFRESH'}
          </button>
          <button className="btn-secondary" style={{ flex:1 }} onClick={() => navigate('/activity')}>
            VIEW ACTIVITY
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { display:'flex', justifyContent:'center', padding:'80px 24px 80px' },
  container: { width:'100%', maxWidth:760, display:'flex', flexDirection:'column', gap:16 },
  centerWrap: { maxWidth:420, margin:'80px auto 0' },
  pageTitle: { textAlign:'center', marginBottom:24 },
  titleText: { fontSize:26, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em', margin:'8px 0 0' },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  cardSub: { fontSize:11, color:'var(--text-muted)', marginTop:2 },
  identityCard: { overflow:'hidden' },
  infoGrid: {
    display:'grid', gridTemplateColumns:'1fr 1fr',
    gap:1, background:'var(--border-base)', borderRadius:8, overflow:'hidden',
  },
  infoCell: { background:'var(--bg-surface)', padding:'12px 14px' },
  cellVal: { fontSize:12, color:'var(--text-secondary)', marginTop:4 },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 },
  statCard: { padding:'16px 20px' },
  statVal: { fontSize:22, fontWeight:600, color:'var(--text-primary)' },
  emptyState: {
    padding:'40px 24px', textAlign:'center',
    fontSize:12, color:'var(--text-muted)',
  },
  table: { width:'100%', borderCollapse:'collapse' },
  th: {
    padding:'10px 16px', textAlign:'left',
    fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em',
    color:'var(--text-muted)', borderBottom:'0.5px solid var(--border-base)',
  },
  tr: { borderBottom:'0.5px solid var(--border-base)' },
  td: { padding:'12px 16px', fontSize:11, color:'var(--text-secondary)', verticalAlign:'middle' },
};
