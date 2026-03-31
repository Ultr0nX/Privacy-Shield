import React from 'react';

export default function TxHashDisplay({ hash, label = 'TX HASH' }) {
  if (!hash) return null;
  const display = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  const url = `https://sepolia.etherscan.io/tx/${hash}`;

  return (
    <div>
      <div style={s.label}>{label}</div>
      <a href={url} target="_blank" rel="noreferrer" style={s.box}>
        <span style={s.hash}>{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15,3 21,3 21,9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>
  );
}

const s = {
  label: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginBottom: 6,
  },
  box: {
    background: 'var(--bg-elevated)',
    border: '0.5px solid var(--accent-border)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  hash: {
    fontSize: 12,
    color: 'var(--accent)',
    fontFamily: 'monospace',
  },
};
