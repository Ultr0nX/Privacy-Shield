/**
 * Relayer Service
 * Handles all API calls to the relayer backend
 */

const RELAYER_URL = process.env.REACT_APP_RELAYER_URL || 'http://localhost:3001';

/**
 * Check if an identity commitment is registered on-chain
 */
export const checkRegistration = async (identityCommitment) => {
  try {
    const response = await fetch(`${RELAYER_URL}/check-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityCommitment })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Registration check failed');
    }
    
    return {
      registered: result.registered,
      message: result.message
    };
  } catch (error) {
    console.error('Check registration error:', error);
    throw new Error(`Failed to check registration: ${error.message}`);
  }
};

/**
 * Register an identity commitment on-chain
 */
export const registerIdentity = async (identityCommitment) => {
  try {
    const response = await fetch(`${RELAYER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityCommitment })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Registration failed');
    }
    
    return {
      success: true,
      tx_hash: result.tx_hash,
      message: result.message
    };
  } catch (error) {
    console.error('Register identity error:', error);
    throw new Error(`Failed to register identity: ${error.message}`);
  }
};

/**
 * Submit a ZK proof for verification
 */
export const submitProof = async (proof, publicSignals) => {
  try {
    const response = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof,
        publicSignals
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Proof verification failed');
    }
    
    return {
      success: true,
      tx_hash: result.tx_hash,
      message: result.message
    };
  } catch (error) {
    console.error('Submit proof error:', error);
    throw new Error(`Failed to submit proof: ${error.message}`);
  }
};
