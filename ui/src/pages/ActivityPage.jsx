import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWalletContext } from '../context/WalletContext';
import { CONTRACT_ADDRESS } from '../utils/contract';

const ABI = [
  { type:'event', name:'IdentityRegistered', inputs:[
    {name:'registrant',type:'address',indexed:true},{name:'commitment',type:'uint256',indexed:true}],anonymous:false },
  { type:'event', name:'ActionVerified', inputs:[
    {name:'nullifier',type:'uint256',indexed:true},{name:'user',type:'address',indexed:true}],anonymous:false },
];

export default function ActivityPage() {
  const wallet = useWalletContext();
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const contractRef = useRef(null);

  const loadEvents = useCallback(async () => {
    if (!wallet.isConnected || !wallet.account || !window.ethereum) return;
    setLoading(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      contractRef.current = contract;

      const [regEvts, verEvts] = await Promise.all([
        contract.queryFilter(contract.filters.IdentityRegistered(wallet.account), 0, 'latest'),
        contract.queryFilter(contract.filters.ActionVerified(null, wallet.account), 0, 'latest'),
      ]);

      const enriched = await Promise.all([
        ...regEvts.map(async ev => {
          let ts = null;
          try { const b = await provider.getBlock(ev.blockNumber); ts = b.timestamp * 1000; } catch {}
          return { type:'IdentityRegistered', block:ev.blockNumber, tx:ev.transactionHash,
            commitment:ev.args.commitment.toString(), nullifier:null, timestamp:ts };
        }),
        ...verEvts.map(async ev => {
          let ts = null;
          try { const b = await provider.getBlock(ev.blockNumber); ts = b.timestamp * 1000; } catch {}
          return { type:'ActionVerified', block:ev.blockNumber, tx:ev.transactionHash,
            commitment:null, nullifier:ev.args.nullifier.toString(), timestamp:ts };
        }),
      ]);

      setEvents(enriched);
      setLive(true);

      // Live listener
      contract.on('IdentityRegistered', (registrant, commitment, ev) => {
        if (registrant.toLowerCase() !== wallet.account.toLowerCase()) return;
        setEvents(prev => [{
          type:'IdentityRegistered', block:ev.blockNumber, tx:ev.transactionHash,
          commitment:commitment.toString(), nullifier:null, timestamp:Date.now(),
        }, ...prev]);
      });
      contract.on('ActionVerified', (nullifier, user, ev) => {
        if (user.toLowerCase() !== wallet.account.toLowerCase()) return;
        setEvents(prev => [{
          type:'ActionVerified', block:ev.blockNumber, tx:ev.transactionHash,
          commitment:null, nullifier:nullifier.toString(), timestamp:Date.now(),
        }, ...prev]);
      });
    } catch (err) {
      console.error('Activity load error:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet.account, wallet.isConnected]);

  useEffect(() => {
    loadEvents();
    return () => {
      if (contractRef.current) {
        contractRef.current.removeAllListeners();
      }
    };
  }, [loadEvents]);

  const filtered = events
    .filter(ev => filter === 'All' || ev.type === filter)
    .sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return b.block - a.block;
      return sort === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
    });

  if (!wallet.isConnected) {
    return (
      <div className="page-wrap" style={s.page}>
        <div style={s.centerWrap}>
          <div className="card" style={{ padding:40, textAlign:'center' }}>
            <div style={s.cardTitle}>ACTIVITY LOG</div>
            <div style={s.cardSub}>Connect your wallet to view on-chain activity.</div>
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={async () => { try { await wallet.connect(); } catch (e) { alert(e.message); } }}>
              CONNECT WALLET
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap" style={s.page}>
      <div style={s.container}>
        <div style={s.pageTitle}>
          <div className="label">ACTIVITY</div>
          <h1 style={s.titleText}>On-Chain Activity</h1>
        </div>

        {/* Filter bar */}
        <div style={s.filterBar}>
          <div style={s.filterGroup}>
            {['All','IdentityRegistered','ActionVerified'].map(f => (
              <button
                key={f}
                style={{ ...s.filterBtn, ...(filter===f ? s.filterBtnActive : {}) }}
                onClick={() => setFilter(f)}
              >
                {f === 'All' ? 'ALL' : f === 'IdentityRegistered' ? 'REGISTERED' : 'VERIFIED'}
              </button>
            ))}
          </div>
          <div style={s.filterGroup}>
            <button style={{ ...s.filterBtn, ...(sort==='newest' ? s.filterBtnActive : {}) }}
              onClick={() => setSort('newest')}>NEWEST</button>
            <button style={{ ...s.filterBtn, ...(sort==='oldest' ? s.filterBtnActive : {}) }}
              onClick={() => setSort('oldest')}>OLDEST</button>
          </div>
          {live && (
            <div style={s.liveChip}>
              <span className="status-dot blink" />
              Listening for new events...
            </div>
          )}
        </div>

        {/* Timeline */}
        {loading ? (
          <div style={s.loadingState}>
            <span className="status-dot blink" style={{ marginRight:8 }} />
            Loading events from chain...
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={s.emptyState}>
            No events found for this wallet.
          </div>
        ) : (
          <div style={s.timeline}>
            {filtered.map((ev, i) => (
              <div key={`${ev.tx}-${i}`} className="card" style={s.eventCard}>
                <div style={s.eventHeader}>
                  <span className={`badge ${ev.type === 'IdentityRegistered' ? 'badge-accent' : 'badge-purple'}`}>
                    {ev.type === 'IdentityRegistered' ? 'IDENTITY REGISTERED' : 'PROOF VERIFIED'}
                  </span>
                  <span style={s.eventTime}>
                    {ev.timestamp
                      ? new Date(ev.timestamp).toLocaleString()
                      : `Block #${ev.block}`}
                  </span>
                </div>

                <div style={s.eventBody}>
                  {ev.commitment && (
                    <div style={s.eventField}>
                      <div className="label">COMMITMENT</div>
                      <div style={s.eventValue}>{ev.commitment.slice(0,12)}…{ev.commitment.slice(-6)}</div>
                    </div>
                  )}
                  {ev.nullifier && (
                    <div style={s.eventField}>
                      <div className="label">NULLIFIER</div>
                      <div style={s.eventValue}>{ev.nullifier.slice(0,12)}…{ev.nullifier.slice(-6)}</div>
                    </div>
                  )}
                  <div style={s.eventField}>
                    <div className="label">BLOCK</div>
                    <div style={s.eventValue}>#{ev.block}</div>
                  </div>
                  <div style={s.eventField}>
                    <div className="label">TX</div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${ev.tx}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:'var(--accent)' }}
                    >
                      {ev.tx.slice(0,10)}…{ev.tx.slice(-6)} ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { display:'flex', justifyContent:'center', padding:'32px 24px 80px' },
  container: { width:'100%', maxWidth:700, display:'flex', flexDirection:'column', gap:16 },
  centerWrap: { maxWidth:420, margin:'80px auto 0' },
  pageTitle: { textAlign:'center', marginBottom:8 },
  titleText: { fontSize:26, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.01em', margin:'8px 0 0' },
  cardTitle: { fontSize:13, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.04em' },
  cardSub: { fontSize:11, color:'var(--text-muted)', marginTop:2 },
  filterBar: {
    display:'flex', gap:12, alignItems:'center', flexWrap:'wrap',
    padding:'12px 16px', borderRadius:8,
    background:'var(--bg-surface)', border:'0.5px solid var(--border-base)',
  },
  filterGroup: { display:'flex', gap:1, borderRadius:6, overflow:'hidden', border:'0.5px solid var(--border-base)' },
  filterBtn: {
    padding:'6px 12px', background:'transparent',
    border:'none', color:'var(--text-muted)',
    fontSize:10, letterSpacing:'0.08em', cursor:'pointer',
    transition:'background 0.15s, color 0.15s',
  },
  filterBtnActive: {
    background:'var(--accent-dim)', color:'var(--accent)',
  },
  liveChip: {
    display:'flex', alignItems:'center', gap:6,
    fontSize:10, color:'var(--accent)', letterSpacing:'0.08em',
    marginLeft:'auto',
  },
  loadingState: {
    textAlign:'center', fontSize:12, color:'var(--text-muted)',
    padding:'60px 0', display:'flex', alignItems:'center', justifyContent:'center',
  },
  emptyState: {
    padding:'60px 24px', textAlign:'center',
    fontSize:12, color:'var(--text-muted)',
  },
  timeline: { display:'flex', flexDirection:'column', gap:8 },
  eventCard: { padding:'16px 20px', overflow:'hidden' },
  eventHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  eventTime: { fontSize:11, color:'var(--text-muted)' },
  eventBody: { display:'flex', gap:24, flexWrap:'wrap' },
  eventField: {},
  eventValue: { fontSize:12, color:'var(--text-secondary)', marginTop:4, fontFamily:'monospace' },
};
