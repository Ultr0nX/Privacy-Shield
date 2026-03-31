import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider, useWalletContext } from './context/WalletContext';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import VerifyPage from './pages/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import RecoveryPage from './pages/RecoveryPage';
import ActivityPage from './pages/ActivityPage';
import AppsPage from './pages/AppsPage';

function AppInner() {
  const wallet = useWalletContext();
  const [points, setPoints] = useState(0);

  const getPointsKey = (account) =>
    `privacy-shield.points.${(account || '').toLowerCase()}`;

  useEffect(() => {
    if (!wallet.account) { setPoints(0); return; }
    const stored = Number(localStorage.getItem(getPointsKey(wallet.account)) || 0);
    setPoints(Number.isFinite(stored) ? stored : 0);
  }, [wallet.account]);

  return (
    <>
      <Navbar points={points} />
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/register"  element={<RegisterPage />} />
        <Route path="/verify"    element={<VerifyPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/recovery"  element={<RecoveryPage />} />
        <Route path="/activity"  element={<ActivityPage />} />
        <Route path="/apps"      element={<AppsPage />} />
        <Route path="*"          element={<HomePage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <AppInner />
      </WalletProvider>
    </BrowserRouter>
  );
}
