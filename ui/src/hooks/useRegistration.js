import { useState, useCallback } from 'react';
import { checkRegistration, registerIdentity } from '../services/relayerService';

/**
 * Custom hook for identity registration
 */
export const useRegistration = (commitment) => {
  const [isRegistered, setIsRegistered] = useState(false);
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState(null);
  
  // Check if identity is registered on-chain
  const checkStatus = useCallback(async () => {
    if (!commitment) return;
    
    setChecking(true);
    setError(null);
    
    try {
      const result = await checkRegistration(commitment);
      setIsRegistered(result.registered);
      return result;
    } catch (err) {
      setError(err.message);
      console.error("Registration check failed:", err);
      return { registered: false, error: err.message };
    } finally {
      setChecking(false);
    }
  }, [commitment]);
  
  // Register identity on blockchain
  const register = useCallback(async (helperData, userWallet) => {
    if (!commitment) throw new Error("No commitment available");
    if (!helperData) throw new Error("No helper data available — complete face scan first");
    if (!userWallet) throw new Error("No wallet address — connect wallet first");

    setRegistering(true);
    setError(null);

    try {
      const result = await registerIdentity(commitment, helperData, userWallet);
      
      if (result.success) {
        setIsRegistered(true);
        setTxHash(result.tx_hash);
        return result;
      } else {
        throw new Error(result.message || "Registration failed");
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setRegistering(false);
    }
  }, [commitment]);
  
  return {
    isRegistered,
    checking,
    registering,
    txHash,
    error,
    checkStatus,
    register
  };
};
