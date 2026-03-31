import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useWalletContext } from '../context/WalletContext';

const NAV_LINKS = [
  { to: '/',          label: 'Home' },
  { to: '/register',  label: 'Register' },
  { to: '/verify',    label: 'Verify' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/apps',      label: 'Apps' },
  { to: '/recovery',  label: 'Recovery' },
  { to: '/activity',  label: 'Activity' },
];

export default function Navbar({ points = 0 }) {
  const wallet = useWalletContext();
  const navigate = useNavigate();

  const handleConnect = async () => {
    try { await wallet.connect(); } catch (err) { alert(err.message); }
  };

  return (
    <nav style={s.nav}>
      {/* Logo */}
      <div style={s.logoWrap}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" />
          <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" opacity="0.4" />
        </svg>
        <span style={s.logoText}>
          <span style={s.logoPrimary}>PRIVACY</span>
          <span style={s.logoAccent}>SHIELD</span>
        </span>
      </div>

      {/* Nav links */}
      <div style={s.navLinks}>
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              ...s.navLink,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Right side */}
      <div style={s.navRight}>
        <span style={s.pill}>POINTS: {points}</span>
        <span style={s.pill}>SEPOLIA TESTNET</span>
        {wallet.isConnected ? (
          <span style={s.walletPill}>
            <span className="status-dot" />
            {wallet.account.slice(0, 6)}…{wallet.account.slice(-4)}
          </span>
        ) : (
          <button style={s.connectBtn} onClick={handleConnect}>
            CONNECT WALLET
          </button>
        )}
      </div>
    </nav>
  );
}

const s = {
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: 'var(--bg-surface)',
    borderBottom: '0.5px solid var(--border-base)',
    zIndex: 100,
    gap: 16,
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    flexShrink: 0,
    textDecoration: 'none',
  },
  logoText: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.12em',
  },
  logoPrimary: { color: 'var(--text-primary)' },
  logoAccent:  { color: 'var(--accent)' },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    flex: 1,
    justifyContent: 'center',
  },
  navLink: {
    fontSize: 11,
    letterSpacing: '0.04em',
    transition: 'color 0.15s',
    textDecoration: 'none',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  pill: {
    fontSize: 10,
    padding: '4px 10px',
    borderRadius: 20,
    border: '0.5px solid var(--border-base)',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
  },
  walletPill: {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 20,
    border: '0.5px solid var(--accent-border)',
    color: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    letterSpacing: '0.04em',
  },
  connectBtn: {
    fontSize: 10,
    padding: '6px 12px',
    borderRadius: 6,
    background: 'var(--accent)',
    border: 'none',
    color: '#0A0F1E',
    fontWeight: 600,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  },
};
