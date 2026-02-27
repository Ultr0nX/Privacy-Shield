import { useState, useCallback } from 'react';
import { connectWallet as connectWalletUtil } from '../utils/wallet';

/**
 * Custom hook for wallet connection
 */
export const useWallet = () => {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    
    try {
      const { address, signer: userSigner } = await connectWalletUtil();
      setAccount(address);
      setSigner(userSigner);
      return { address, signer: userSigner };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);
  
  const disconnect = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setError(null);
  }, []);
  
  return {
    account,
    signer,
    connecting,
    error,
    connect,
    disconnect,
    isConnected: !!account
  };
};
