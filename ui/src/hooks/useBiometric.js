import { useState, useRef, useCallback } from 'react';
import { initPoseidon } from '../utils/crypto';
import { validateFaceQuality } from '../utils/validators';
import { averageDescriptors, extractDescriptor } from '../services/embeddingService';
import { enrollDescriptor, reproduceDescriptor, walletSigToFieldElement } from '../services/fuzzyExtractor';
import { getProfileFromChain } from '../utils/contract';

// v3: new contract 0x99C9... + random-secret key derivation (wallet+face both required)
// Bumping version clears stale v2 profiles that were enrolled against the old contract.
// Profile key is scoped per wallet so multiple users on the same device don't overwrite
// each other's face templates (which would break the cosine pre-gate).
const profileKey = (addr) => `privacy-shield.embedding-profile.v3.${(addr || '').toLowerCase()}`;
const OLD_KEYS = ['privacy-shield.embedding-profile.v2', 'privacy-shield.embedding-profile.v1', 'privacy-shield.embedding-profile.v3'];
OLD_KEYS.forEach(k => localStorage.removeItem(k));
const MIN_QUALITY_SCORE = 70;
const SAMPLE_INTERVAL_MS = 200;
const LIVENESS_DURATION_MS = 4000;
const MIN_LIVENESS_FRAMES = 5;
// Block a different face from recovering the enrolled key via BCH.
// Same person scores consistently 0.995+; different people score <0.90
// even with similar face shapes. 0.92 cleanly separates them.
const DIFFERENT_PERSON_THRESHOLD = 0.92;

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeVector(v) {
  const out = Float32Array.from(v);
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
  if (norm > 0) for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

const dist3 = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

function computeEyeAspectRatio(landmarks, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map(i => landmarks[i]);
  const vertical = dist3(p2, p6) + dist3(p3, p5);
  const horizontal = 2 * dist3(p1, p4);
  return horizontal > 0 ? vertical / horizontal : 1;
}

function estimateYaw(landmarks) {
  const nose = landmarks[1];
  const lCheek = landmarks[234];
  const rCheek = landmarks[454];
  const l = Math.abs(nose.x - lCheek.x);
  const r = Math.abs(nose.x - rCheek.x);
  return Math.atan2(l - r, l + r);
}

function evaluateLiveness(frames) {
  if (frames.length < MIN_LIVENESS_FRAMES) {
    return { passed: false };
  }

  let blinkDetected = false;
  let belowThreshold = false;
  let blinkStart = 0;

  for (const frame of frames) {
    const leftEar  = computeEyeAspectRatio(frame.landmarks, [33, 160, 158, 133, 153, 144]);
    const rightEar = computeEyeAspectRatio(frame.landmarks, [362, 385, 387, 263, 373, 380]);
    const ear = (leftEar + rightEar) / 2;
    if (ear < 0.25) {
      if (!belowThreshold) { belowThreshold = true; blinkStart = frame.elapsed; }
    } else if (belowThreshold) {
      const dur = frame.elapsed - blinkStart;
      if (dur >= 80 && dur <= 400) blinkDetected = true;
      belowThreshold = false;
    }
  }

  const yaws = frames.map(f => estimateYaw(f.landmarks));
  const headMotionDetected = Math.max(...yaws) - Math.min(...yaws) > 0.04;

  let smileDetected = false;
  for (const frame of frames) {
    const l = frame.blendshapes.find(s => s.categoryName === 'mouthSmileLeft')?.score  || 0;
    const r = frame.blendshapes.find(s => s.categoryName === 'mouthSmileRight')?.score || 0;
    if ((l + r) / 2 >= 0.4) { smileDetected = true; break; }
  }

  const checksPassed = [blinkDetected, headMotionDetected, smileDetected].filter(Boolean).length;
  return { passed: checksPassed >= 2, checksPassed, blinkDetected, headMotionDetected, smileDetected };
}

// ─── hook ───────────────────────────────────────────────────────────────────

export const useBiometric = (scanThreshold = 20, getWalletSeed = null, walletAddress = null) => {
  const [secretId,       setSecretId]       = useState(null);
  const [commitment,     setCommitment]     = useState('');
  const [helperDataHex,  setHelperDataHex]  = useState('');
  const [progress,       setProgress]       = useState(0);
  const [status,         setStatus]         = useState('Idle');
  const [verified,       setVerified]       = useState(false);
  const [recoveryErrors, setRecoveryErrors] = useState(null);
  const [hasEnrolled,    setHasEnrolled]    = useState(() => Boolean(localStorage.getItem(profileKey(walletAddress))));

  const poseidonRef         = useRef(null);
  const descriptorBufferRef = useRef([]);
  const validFramesRef      = useRef(0);
  const profileRef          = useRef(null);
  const isProcessingRef     = useRef(false);
  const lastSampleRef       = useRef(0);
  const livenessFramesRef   = useRef([]);
  const livenessStartRef    = useRef(null);
  const livenessPassedRef   = useRef(false);
  const walletSigRef        = useRef(null);

  // ── capture state reset (keeps stored profile intact) ───────────────────
  const resetCaptureState = useCallback(() => {
    descriptorBufferRef.current = [];
    validFramesRef.current      = 0;
    isProcessingRef.current     = false;
    lastSampleRef.current       = 0;
    livenessFramesRef.current   = [];
    livenessStartRef.current    = null;
    livenessPassedRef.current   = false;
    setProgress(0);
  }, []);

  // ── load stored profile from localStorage (cached in profileRef) ─────────
  const loadStoredProfile = useCallback(() => {
    if (profileRef.current) return profileRef.current;
    try {
      const raw = localStorage.getItem(profileKey(walletAddress));
      if (!raw) { setHasEnrolled(false); return null; }
      const parsed = JSON.parse(raw);
      if (!parsed.helperData) { setHasEnrolled(false); return null; }
      profileRef.current = parsed;
      return parsed;
    } catch {
      localStorage.removeItem(profileKey(walletAddress));
      setHasEnrolled(false);
      return null;
    }
  }, []);

  // ── initialize Poseidon once ─────────────────────────────────────────────
  const initializePoseidon = useCallback(async () => {
    loadStoredProfile();
    if (!poseidonRef.current) {
      poseidonRef.current = await initPoseidon();
      window.poseidonInstance = poseidonRef.current;
    }
    return poseidonRef.current;
  }, [loadStoredProfile]);

  // ── reset scan state (same person retrying) ──────────────────────────────
  const reset = useCallback(() => {
    setSecretId(null);
    setCommitment('');
    setHelperDataHex('');
    setStatus('Idle');
    setVerified(false);
    setRecoveryErrors(null);
    resetCaptureState();
  }, [resetCaptureState]);

  // ── clear profile entirely (switch to a different person) ────────────────
  const clearProfile = useCallback(() => {
    localStorage.removeItem(profileKey(walletAddress));
    profileRef.current = null;
    walletSigRef.current = null;
    setHasEnrolled(false);
    setSecretId(null);
    setCommitment('');
    setHelperDataHex('');
    setStatus('Idle');
    setVerified(false);
    setRecoveryErrors(null);
    resetCaptureState();
  }, [resetCaptureState]);

  // ── derive identity from averaged geometric descriptor ───────────────────
  const finalizeIdentity = useCallback(async () => {
    setStatus('🔐 Deriving identity from face geometry...');
    if (!poseidonRef.current) await initializePoseidon();

    const averagedDescriptor = averageDescriptors(descriptorBufferRef.current);

    console.log('%c[IDENTITY] ━━━━━━━━━━ FINALIZE IDENTITY ━━━━━━━━━━', 'color:#facc15;font-weight:bold');
    console.log('%c[IDENTITY] wallet address  :', 'color:#8888ff', walletAddress);
    console.log('%c[IDENTITY] descriptor[0..7]:', 'color:#888',
      Array.from(averagedDescriptor).slice(0, 8).map(v => v.toFixed(5)).join(', '));
    const descNorm = Math.sqrt(Array.from(averagedDescriptor).reduce((s, x) => s + x * x, 0));
    console.log('%c[IDENTITY] descriptor norm :', 'color:#888', descNorm.toFixed(6));
    console.log('%c[IDENTITY] localStorage has profile:', 'color:#888', Boolean(localStorage.getItem(profileKey(walletAddress))));

    // ── get wallet signature (needed for both enrolment and recovery) ────────
    if (!getWalletSeed) {
      throw new Error('Wallet not connected. Please connect your wallet before scanning.');
    }
    setStatus('🔑 Signing with wallet (one-time per session)...');
    if (!walletSigRef.current) {
      walletSigRef.current = await getWalletSeed();
    }
    const walletSig        = walletSigRef.current;
    const walletKeyBigInt  = await walletSigToFieldElement(walletSig);

    // ── try localStorage first, then on-chain, then fresh enrolment ─────────
    let storedProfile = loadStoredProfile();
    let profileSource = 'none';

    console.log('%c[IDENTITY] localStorage profile:', 'color:#888',
      storedProfile ? `EXISTS (template: ${Array.isArray(storedProfile.descriptorTemplate) ? 'YES' : 'NO'})` : 'EMPTY');

    // New device: no localStorage → try fetching helperData from the blockchain.
    if (!storedProfile && walletAddress) {
      setStatus('📡 No local profile — fetching recovery data from chain...');
      try {
        const chainProfile = await getProfileFromChain(walletAddress);
        if (chainProfile) {
          storedProfile = { helperData: chainProfile.helperDataHex, descriptorTemplate: null, onChainCommitment: chainProfile.commitment };
          profileSource = 'on-chain';
          console.log('%c[IDENTITY] ⛓  On-chain profile FOUND — helperData loaded (no descriptorTemplate)', 'color:#facc15;font-weight:bold');
          console.warn('%c[IDENTITY] ⚠️  Cosine check SKIPPED — no template to compare against. BCH is the only gate.', 'color:#ff8800;font-weight:bold');
        } else {
          console.log('%c[IDENTITY] ⛓  On-chain profile NOT FOUND → fresh enrollment', 'color:#888');
        }
      } catch {
        // Chain fetch is best-effort; fall through to fresh enrolment if it fails.
        console.log('%c[IDENTITY] ⛓  On-chain fetch FAILED → fresh enrollment', 'color:#888');
      }
    } else if (storedProfile) {
      profileSource = 'localStorage';
    }

    let randomSecretBigInt;
    let errors = 0;
    let isEnrolment = false;

    if (storedProfile) {
      console.log(`%c[IDENTITY] PATH: 🔄 RECOVERY (source: ${profileSource})`, 'color:#facc15;font-weight:bold');
      // ── recovery path (same device or cross-device) ────────────────────────
      // Cosine pre-gate (only when we have a stored descriptor template).
      if (
        Array.isArray(storedProfile.descriptorTemplate) &&
        storedProfile.descriptorTemplate.length === averagedDescriptor.length
      ) {
        const sim = cosineSimilarity(
          normalizeVector(storedProfile.descriptorTemplate),
          normalizeVector(averagedDescriptor)
        );
        const pass = sim >= DIFFERENT_PERSON_THRESHOLD;
        console.log(
          `%c[IDENTITY] Cosine similarity: ${sim.toFixed(6)} (threshold: ${DIFFERENT_PERSON_THRESHOLD}) → ${pass ? '✅ SAME PERSON — proceed to BCH' : '❌ DIFFERENT PERSON — blocked'}`,
          pass ? 'color:#00ff88;font-weight:bold' : 'color:#ff4444;font-weight:bold'
        );
        if (!pass) {
          throw new Error(
            `Different person detected (similarity ${sim.toFixed(3)}). ` +
            `Use "Switch User / Clear Profile" to enroll a new identity.`
          );
        }
      } else {
        console.warn('%c[IDENTITY] ⚠️  Cosine check SKIPPED — no descriptorTemplate in stored profile', 'color:#ff8800');
      }

      setStatus('🔄 Recovering identity via BCH error correction...');
      const recovered = await reproduceDescriptor(averagedDescriptor, storedProfile.helperData);

      console.log(
        `%c[IDENTITY] BCH result: matched=${recovered.matched}, errors=${recovered.errors ?? '>30 (failed)'}`,
        recovered.matched ? 'color:#00ff88;font-weight:bold' : 'color:#ff4444;font-weight:bold'
      );

      if (!recovered.matched) {
        // If profile came from on-chain and BCH failed → this is a DIFFERENT PERSON
        // trying to use a wallet that's already registered to someone else.
        if (profileSource === 'on-chain') {
          const errMsg =
            '🚫 This wallet is already registered to a different person.\n\n' +
            'Each wallet can only hold ONE biometric identity.\n' +
            'Please use a different wallet to register a new identity.';
          console.error('[IDENTITY] ❌ WALLET TAKEN: on-chain profile exists but face does not match', errMsg);
          throw new Error(errMsg);
        }
        const errMsg = recovered.errors === null
          ? 'Identity recovery failed (BCH decode error > 30 bits). Improve lighting, remove glasses, face camera directly, then retry.'
          : `Identity recovery failed (${recovered.errors} bits corrected but key mismatch). Retry in similar lighting conditions.`;
        console.warn('[PrivacyShield] BCH failed:', errMsg);
        throw new Error(errMsg);
      }

      randomSecretBigInt = recovered.randomSecretBigInt;
      errors             = recovered.errors;
      console.log('%c[IDENTITY] randomSecret prefix: 0x' + randomSecretBigInt.toString(16).padStart(64,'0').slice(0,16) + '...', 'color:#888');

      // Repopulate helperDataHex state so registration can proceed even on recovery path.
      setHelperDataHex(storedProfile.helperData);
      // If we recovered from on-chain (no descriptorTemplate), save the current
      // descriptor now so future scans on this device can do a cosine pre-check.
      if (!storedProfile.descriptorTemplate) {
        profileRef.current = {
          helperData:         storedProfile.helperData,
          descriptorTemplate: Array.from(averagedDescriptor),
        };
        localStorage.setItem(profileKey(walletAddress), JSON.stringify(profileRef.current));
        setHasEnrolled(true);
        console.log('%c[IDENTITY] Saved descriptorTemplate to localStorage for future cosine checks', 'color:#888');
      }
    } else {
      // ── fresh enrolment ────────────────────────────────────────────────────
      isEnrolment = true;
      console.log('%c[IDENTITY] PATH: 🆕 FRESH ENROLLMENT', 'color:#00ff88;font-weight:bold');
      setStatus('🎲 Generating cryptographic identity...');
      const enrolled = await enrollDescriptor(averagedDescriptor);

      randomSecretBigInt = enrolled.randomSecretBigInt;
      console.log('%c[IDENTITY] randomSecret prefix: 0x' + randomSecretBigInt.toString(16).padStart(64,'0').slice(0,16) + '...', 'color:#888');

      profileRef.current = {
        helperData:         enrolled.helperDataHex,
        descriptorTemplate: Array.from(averagedDescriptor),
      };
      localStorage.setItem(profileKey(walletAddress), JSON.stringify(profileRef.current));
      setHasEnrolled(true);
      setHelperDataHex(enrolled.helperDataHex);
    }

    // ── key derivation: secretId = Poseidon(walletKey, randomSecret) ─────────
    // This binds BOTH wallet AND face to the identity commitment.
    // Neither alone is sufficient — both are required to reproduce this value.
    const secretHash       = poseidonRef.current([walletKeyBigInt, randomSecretBigInt]);
    const privateSecret    = poseidonRef.current.F.toString(secretHash);
    const commitmentHash   = poseidonRef.current([secretHash]);
    const publicCommitment = poseidonRef.current.F.toString(commitmentHash);

    console.log('%c[IDENTITY] walletKey prefix  : 0x' + walletKeyBigInt.toString(16).padStart(64,'0').slice(0,16) + '...', 'color:#888');
    console.log('%c[IDENTITY] COMMITMENT (full) :', 'color:#00ff88;font-weight:bold', publicCommitment);

    // ── SECURITY GATE: on-chain path — verify derived commitment matches chain ──
    // BCH alone can succeed for a different person (≤30 bit errors).
    // Compare the derived commitment against what's stored on-chain so that
    // a different face that happens to pass BCH is blocked here.
    if (profileSource === 'on-chain' && storedProfile.onChainCommitment) {
      if (publicCommitment !== storedProfile.onChainCommitment) {
        const errMsg =
          '🚫 This wallet is already registered to a different person.\n\n' +
          'Each wallet can only hold ONE biometric identity.\n' +
          'Please use a different wallet to register a new identity.';
        console.error('[IDENTITY] ❌ COMMITMENT MISMATCH: BCH passed but derived commitment !== on-chain commitment');
        console.error('[IDENTITY]    derived :', publicCommitment);
        console.error('[IDENTITY]    on-chain:', storedProfile.onChainCommitment);
        throw new Error(errMsg);
      }
      console.log('%c[IDENTITY] ✅ COMMITMENT VERIFIED — derived commitment matches on-chain record', 'color:#00ff88;font-weight:bold');
    }

    console.log(`[PrivacyShield] ${isEnrolment ? 'ENROLLED' : 'RECOVERED'} — commitment: ${publicCommitment.slice(0,12)}... errors: ${errors}`);

    setSecretId(privateSecret);
    setCommitment(publicCommitment);
    setVerified(true);
    setRecoveryErrors(errors);
    setStatus(
      isEnrolment
        ? '✅ Biometric identity enrolled — wallet + face combined'
        : `✅ Identity recovered (${errors} geometric corrections)`
    );
  }, [getWalletSeed, walletAddress, initializePoseidon, loadStoredProfile]);

  // ── per-frame processing ─────────────────────────────────────────────────
  const processLandmarks = useCallback(async (frameInput) => {
    if (verified) return;

    const landmarks  = Array.isArray(frameInput) ? frameInput : frameInput?.landmarks;
    const blendshapes = Array.isArray(frameInput) ? [] : frameInput?.blendshapes || [];
    const timestamp  = Array.isArray(frameInput) ? performance.now() : frameInput?.timestamp || performance.now();

    try {
      const validation = validateFaceQuality(landmarks, 640, 480);

      if (!validation.valid) {
        setStatus(`⚠️ ${validation.reason}`);
        return;
      }

      if (validation.score < MIN_QUALITY_SCORE) {
        setStatus(`📸 Face quality: ${validation.score}% — ${validation.reason}`);
        return;
      }

      // ── liveness phase ───────────────────────────────────────────────────
      if (!livenessPassedRef.current) {
        if (livenessStartRef.current === null) {
          livenessStartRef.current = timestamp;
          livenessFramesRef.current = [];
          setProgress(0);
          setStatus('👁️ Liveness check (4s): slowly tilt head left/right + blink naturally');
        }

        const elapsed = timestamp - livenessStartRef.current;
        livenessFramesRef.current.push({ landmarks, blendshapes, elapsed });
        setProgress(Math.min(35, Math.floor((elapsed / LIVENESS_DURATION_MS) * 35)));

        if (elapsed >= 500 && elapsed < LIVENESS_DURATION_MS) {
          const partial = evaluateLiveness(livenessFramesRef.current);
          setStatus(
            `👁️ Liveness (${Math.ceil((LIVENESS_DURATION_MS - elapsed) / 1000)}s left): ` +
            `tilt ${partial.headMotionDetected ? '✅' : '⬜'} · blink ${partial.blinkDetected ? '✅' : '⬜'} · smile ${partial.smileDetected ? '✅' : '⬜'}`
          );
          return;
        }

        if (elapsed < LIVENESS_DURATION_MS) return;

        const liveness = evaluateLiveness(livenessFramesRef.current);
        livenessFramesRef.current  = [];
        livenessStartRef.current   = null;

        if (!liveness.passed) {
          descriptorBufferRef.current = [];
          validFramesRef.current      = 0;
          setProgress(0);
          setStatus(
            `❌ Liveness failed (need 2 of 3): ` +
            `tilt ${liveness.headMotionDetected ? '✅' : '❌'} · ` +
            `blink ${liveness.blinkDetected ? '✅' : '❌'} · ` +
            `smile ${liveness.smileDetected ? '✅' : '❌'}. Try again.`
          );
          return;
        }

        livenessPassedRef.current   = true;
        descriptorBufferRef.current = [];
        validFramesRef.current      = 0;
        setProgress(40);
        setStatus('✅ Liveness passed. Capturing face geometry...');
        return;
      }

      // ── geometry capture phase ───────────────────────────────────────────
      const now = performance.now();
      if (isProcessingRef.current || now - lastSampleRef.current < SAMPLE_INTERVAL_MS) return;

      isProcessingRef.current = true;
      lastSampleRef.current   = now;

      // extractDescriptor is synchronous with the new geometry-based service
      const descriptor = extractDescriptor(landmarks);
      descriptorBufferRef.current.push(descriptor);
      validFramesRef.current++;

      const pct = 40 + Math.min(60, Math.floor((descriptorBufferRef.current.length / scanThreshold) * 60));
      setProgress(pct);
      setStatus(`✅ Capturing geometry... ${descriptorBufferRef.current.length}/${scanThreshold} samples`);

      if (descriptorBufferRef.current.length >= scanThreshold) {
        await finalizeIdentity();
      }
    } catch (error) {
      console.warn('Frame processing error:', error.message);
      const msg = error?.message || 'Biometric processing failed';
      const isDifferentPerson  = msg.includes('Different person detected');
      const isWalletTaken      = msg.includes('wallet is already registered to a different person');

      if (isWalletTaken) {
        // Stop scanning completely — this wallet belongs to someone else
        setStatus('🚫 This wallet is already registered to a different person.');
        livenessPassedRef.current = false;
        resetCaptureState();
        // Show popup so the user clearly sees the message
        window.alert(
          '🚫 Wrong Wallet\n\n' +
          'This wallet is already linked to a different biometric identity.\n\n' +
          'You cannot verify or register with this wallet.\n' +
          'Please connect YOUR OWN wallet to continue.'
        );
      } else if (isDifferentPerson) {
        setStatus(`⚠️ ${msg}`);
        resetCaptureState();
      } else if (msg.includes('recovery failed') || msg.includes('recovery mismatch')) {
        setStatus('⚠️ Face mismatch with enrolled profile. Keep face centered, similar lighting, and retry.');
        resetCaptureState();
      } else if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setStatus('⚠️ Wallet signature rejected. Click "Re-Scan Face" to try again.');
        walletSigRef.current = null;
        resetCaptureState();
        livenessPassedRef.current = false;
      } else {
        setStatus(`⚠️ ${msg}`);
        resetCaptureState();
        livenessPassedRef.current = false;
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [finalizeIdentity, resetCaptureState, scanThreshold, verified]);

  return {
    secretId,
    commitment,
    helperDataHex,   // 96-byte packed hex — sent to relayer on registration
    progress,
    status,
    verified,
    recoveryErrors,
    hasEnrolled,
    processLandmarks,
    reset,
    clearProfile,
    initializePoseidon,
    validFrames:   validFramesRef.current,
    targetSamples: scanThreshold,
  };
};
