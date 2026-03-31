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
  
  const IDENTITY_SIGN_MESSAGE = 'PrivacyShield Identity Enrollment v1';

  const signForIdentity = useCallback(async () => {
    if (!signer) throw new Error('Wallet not connected.');
    return signer.signMessage(IDENTITY_SIGN_MESSAGE);
  }, [signer]);

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
    signForIdentity,
    isConnected: !!account
  };
};
