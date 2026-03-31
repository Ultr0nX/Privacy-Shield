import React, { useState } from 'react';

export default function CommitmentDisplay({ value, label = 'COMMITMENT', fullWidth = false }) {
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  if (!value) return null;

  const display = showFull
    ? value
    : `${value.slice(0, 10)}...${value.slice(-6)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }}>
      <div style={s.label}>{label}</div>
      <div style={s.box}>
        <span style={s.value}>{display}</span>
        <div style={s.actions}>
          <button style={s.btn} onClick={() => setShowFull(v => !v)}>
            {showFull ? 'HIDE' : 'FULL'}
          </button>
          <button style={s.btn} onClick={handleCopy}>
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
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
    border: '0.5px solid var(--border-base)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  value: {
    fontSize: 12,
    color: 'var(--accent)',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    flex: 1,
  },
  actions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  btn: {
    background: 'transparent',
    border: '0.5px solid var(--border-base)',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 9,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
