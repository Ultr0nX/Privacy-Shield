const RELAYER_URL = process.env.REACT_APP_RELAYER_URL || 'http://localhost:3001';

const log  = (tag, msg, data) => console.log( `%c[${tag}] ${msg}`, 'color:#00c8ff;font-weight:bold', data ?? '');
const logOk  = (tag, msg, data) => console.log( `%c[${tag}] ✅ ${msg}`, 'color:#00ff88;font-weight:bold', data ?? '');
const logErr = (tag, msg, data) => console.error(`%c[${tag}] ❌ ${msg}`, 'color:#ff4444;font-weight:bold', data ?? '');

export const checkRegistration = async (identityCommitment) => {
  log('RELAYER', 'POST /check-registration', { identityCommitment });
  try {
    const body = JSON.stringify({ identityCommitment });
    const response = await fetch(`${RELAYER_URL}/check-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    logOk('RELAYER', `check-registration response: registered=${result.registered}`, result);

    if (!result.success) throw new Error(result.error || 'Registration check failed');

    return { registered: result.registered, message: result.message };
  } catch (error) {
    logErr('RELAYER', 'check-registration failed', error.message);
    throw new Error(`Failed to check registration: ${error.message}`);
  }
};

export const registerIdentity = async (identityCommitment, helperData, userWallet) => {
  log('RELAYER', 'POST /register', {
    userWallet,
    identityCommitment,
    helperDataLen: helperData ? helperData.length : 0,
    helperDataPrefix: helperData ? helperData.slice(0, 18) + '...' : null,
  });
  try {
    const body = JSON.stringify({ identityCommitment, helperData, userWallet });
    const response = await fetch(`${RELAYER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();

    if (!result.success) throw new Error(result.message || 'Registration failed');

    logOk('RELAYER', `register success — tx: ${result.tx_hash}`, result);
    return { success: true, tx_hash: result.tx_hash, message: result.message };
  } catch (error) {
    logErr('RELAYER', 'register failed', error.message);
    throw new Error(`Failed to register identity: ${error.message}`);
  }
};

export const submitProof = async (proof, publicSignals) => {
  log('RELAYER', 'POST /relay — submitting ZK proof', {
    publicSignals,
    pi_a_prefix: proof.pi_a?.[0]?.slice(0, 14) + '...',
  });
  try {
    const body = JSON.stringify({ proof, publicSignals });
    const response = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();

    if (!result.success) throw new Error(result.message || 'Proof verification failed');

    logOk('RELAYER', `relay success — tx: ${result.tx_hash}`, result);
    return { success: true, tx_hash: result.tx_hash, message: result.message };
  } catch (error) {
    logErr('RELAYER', 'relay failed', error.message);
    throw new Error(`Failed to submit proof: ${error.message}`);
  }
};
