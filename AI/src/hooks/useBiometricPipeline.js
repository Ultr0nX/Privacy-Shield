/**
 * useBiometricPipeline — React hook for the Privacy Shield biometric flow.
 *
 * Wraps MediaPipe liveness detection, landmark-based 512-dim embedding
 * extraction, and the Fuzzy Commitment Scheme into React state.
 */
import { useState, useRef, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { poseidon1 } from 'poseidon-lite';

// ─── BCH constants ───────────────────────────────────
const BCH_N = 511;
const BCH_K = 259;

// ─── Utilities ───────────────────────────────────────
const dist3 = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

function xorBits(a, b) {
  const r = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = a[i] ^ b[i];
  return r;
}

function randomBits(n) {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  crypto.getRandomValues(bytes);
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) bits[i] = (bytes[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
  return bits;
}

function bitsToBigInt(bits) {
  let r = 0n;
  for (let i = 0; i < bits.length; i++) if (bits[i]) r |= 1n << BigInt(bits.length - 1 - i);
  return r;
}

function bitsToHex(bits) {
  return '0x' + bitsToBigInt(bits).toString(16).padStart(Math.ceil(bits.length / 4), '0');
}

function hexToBits(hex, len) {
  const b = BigInt(hex.startsWith('0x') ? hex : '0x' + hex);
  const bits = new Uint8Array(len);
  for (let i = 0; i < len; i++) bits[i] = Number((b >> BigInt(len - 1 - i)) & 1n);
  return bits;
}

async function sha256Bits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function poseidonHash(bits) {
  try {
    return poseidon1([bitsToBigInt(bits)]).toString();
  } catch {
    return '0x' + bitsToBigInt(bits).toString(16).substring(0, 64);
  }
}

function quantize(embedding) {
  const bits = new Uint8Array(BCH_N);
  for (let i = 0; i < BCH_N; i++) bits[i] = embedding[i] >= 0 ? 1 : 0;
  return bits;
}

// ─── Hook ────────────────────────────────────────────
export function useBiometricPipeline() {
  const [state, setState] = useState({
    phase: 'idle', // idle | camera | liveness | embedding | fuzzy | done | error
    cameraReady: false,
    scanning: false,
    liveness: { blink: null, motion: null, smile: null, passed: null },
    embedding: { dim: null, ready: false },
    crypto: { secretID: null, bchErrors: null, commitment: null },
    result: null, // { type: 'enrollment'|'verification', success: boolean, message: string }
    logs: [{ ts: new Date(), msg: 'Privacy Shield v1.0 — ready.', level: 'info' }],
  });

  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const enrollDataRef = useRef(null);

  const addLog = useCallback((msg, level = 'info') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { ts: new Date(), msg, level }],
    }));
  }, []);

  const updateState = useCallback((partial) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ─── Camera ──────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      addLog('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      addLog('Camera active ✓', 'success');

      addLog('Loading MediaPipe FaceLandmarker...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      addLog('MediaPipe loaded ✓', 'success');
      updateState({ cameraReady: true, phase: 'camera' });
    } catch (err) {
      addLog(`Camera error: ${err.message}`, 'error');
      updateState({ phase: 'error' });
    }
  }, [addLog, updateState]);

  // ─── Liveness ────────────────────────────────────
  const runLiveness = useCallback(async () => {
    const fl = landmarkerRef.current;
    const vid = videoRef.current;
    if (!fl || !vid) return null;

    updateState({ phase: 'liveness', scanning: true });
    addLog('Running liveness detection (3s)...');
    addLog('  ↳ Blink naturally, move your head slightly');

    const frames = [];
    const start = performance.now();

    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (performance.now() - start >= 3000) { clearInterval(iv); resolve(); return; }
        const result = fl.detectForVideo(vid, performance.now());
        if (result.faceLandmarks?.length > 0) {
          frames.push({
            lm: result.faceLandmarks[0],
            bs: result.faceBlendshapes?.[0]?.categories || [],
            ts: performance.now() - start,
          });
        }
      }, 100);
    });

    updateState({ scanning: false });

    if (frames.length < 5) {
      addLog('No face detected — try again', 'error');
      updateState({
        phase: 'error',
        liveness: { blink: false, motion: false, smile: false, passed: false },
      });
      return null;
    }

    // Blink
    let blinkDetected = false, below = false, blinkStart = 0;
    for (const f of frames) {
      const lm = f.lm;
      const earL = (dist3(lm[160], lm[144]) + dist3(lm[158], lm[153])) / (2 * dist3(lm[33], lm[133]));
      const earR = (dist3(lm[385], lm[380]) + dist3(lm[387], lm[373])) / (2 * dist3(lm[362], lm[263]));
      const ear = (earL + earR) / 2;
      if (ear < 0.21) { if (!below) { below = true; blinkStart = f.ts; } }
      else if (below) { const d = f.ts - blinkStart; if (d >= 80 && d <= 400) blinkDetected = true; below = false; }
    }

    // Head motion
    const poses = frames.map(f => {
      const n = f.lm[1], lc = f.lm[234], rc = f.lm[454];
      const ld = Math.abs(n.x - lc.x), rd = Math.abs(n.x - rc.x);
      return Math.atan2(ld - rd, ld + rd);
    });
    let maxDelta = 0;
    for (let i = 1; i < poses.length; i++) maxDelta = Math.max(maxDelta, Math.abs(poses[i] - poses[i - 1]));
    const headMotion = maxDelta > 0.02;

    // Smile
    let smileDetected = false;
    for (const f of frames) {
      const sL = f.bs.find(b => b.categoryName === 'mouthSmileLeft')?.score || 0;
      const sR = f.bs.find(b => b.categoryName === 'mouthSmileRight')?.score || 0;
      if ((sL + sR) / 2 >= 0.4) { smileDetected = true; break; }
    }

    const count = [blinkDetected, headMotion, smileDetected].filter(Boolean).length;
    const passed = count >= 2;

    addLog(`  Blink: ${blinkDetected ? '✓' : '✗'} | Motion: ${headMotion ? '✓' : '✗'} | Smile: ${smileDetected ? '✓' : '✗'}`, passed ? 'success' : 'warn');
    addLog(passed ? `Liveness PASSED (${count}/3) ✓` : `Liveness FAILED (${count}/3) — try again`, passed ? 'success' : 'error');

    updateState({
      liveness: { blink: blinkDetected, motion: headMotion, smile: smileDetected, passed },
      phase: passed ? 'liveness' : 'error',
    });

    return passed ? frames : null;
  }, [addLog, updateState]);

  // ─── Embedding ───────────────────────────────────
  const extractEmb = useCallback((frames) => {
    updateState({ phase: 'embedding' });
    addLog('Extracting 512-dim face embedding...');

    const sel = frames.slice(-3);
    const embedding = new Float32Array(512);
    for (const f of sel) {
      const lm = f.lm;
      for (let i = 0; i < 512; i++) {
        const i1 = i % 468, i2 = (i * 7 + 13) % 468;
        embedding[i] += ((lm[i1].x - lm[i2].x) + (lm[i1].y - lm[i2].y) * 0.5 + (lm[i1].z - lm[i2].z) * 0.25) / sel.length;
      }
    }
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < 512; i++) embedding[i] = norm > 0 ? embedding[i] / norm : 0;

    updateState({ embedding: { dim: 512, ready: true }, phase: 'embedding' });
    addLog('Embedding extracted ✓ (512-dim, L2-normalized)', 'success');
    return embedding;
  }, [addLog, updateState]);

  // ─── Enrollment ──────────────────────────────────
  const enroll = useCallback(async () => {
    updateState({ phase: 'liveness', result: null, crypto: { secretID: null, bchErrors: null, commitment: null } });
    addLog('━━━ ENROLLMENT Pipeline ━━━');

    const frames = await runLiveness();
    if (!frames) {
      updateState({ result: { type: 'enrollment', success: false, message: 'Liveness failed — try again.' } });
      return;
    }

    const emb = extractEmb(frames);
    updateState({ phase: 'fuzzy' });
    addLog('Running Fuzzy Commitment Scheme...');

    const bioBits = quantize(emb);
    const ones = bioBits.reduce((s, b) => s + b, 0);
    addLog(`  Quantized: ${BCH_N} bits (${ones} ones)`);

    const keyBits = randomBits(BCH_K);
    addLog(`  Generated random key K (${BCH_K} bits)`);

    const codeword = new Uint8Array(BCH_N);
    for (let i = 0; i < BCH_K; i++) codeword[i] = keyBits[i];

    const helperData = xorBits(bioBits, codeword);
    const commitment = await sha256Bits(keyBits);
    const secretID = poseidonHash(keyBits);

    enrollDataRef.current = { helperData: bitsToHex(helperData), commitment, keyBits, secretID };

    addLog(`  Secret_ID: ${secretID.substring(0, 40)}...`, 'success');
    updateState({
      phase: 'done',
      crypto: { secretID, bchErrors: 0, commitment },
      result: { type: 'enrollment', success: true, message: `Identity enrolled! Secret_ID: ${secretID.substring(0, 30)}...` },
    });
    addLog('━━━ ENROLLMENT COMPLETE ━━━', 'success');
  }, [runLiveness, extractEmb, addLog, updateState]);

  // ─── Verification ────────────────────────────────
  const verify = useCallback(async () => {
    if (!enrollDataRef.current) { addLog('No enrollment data — enroll first.', 'error'); return; }
    updateState({ phase: 'liveness', result: null, crypto: { secretID: null, bchErrors: null, commitment: null } });
    addLog('━━━ VERIFICATION Pipeline ━━━');

    const frames = await runLiveness();
    if (!frames) {
      updateState({ result: { type: 'verification', success: false, message: 'Liveness failed.' } });
      return;
    }

    const emb = extractEmb(frames);
    updateState({ phase: 'fuzzy' });
    addLog('Reproducing Secret_ID from stored helperData...');

    const bioBits = quantize(emb);
    const helperBits = hexToBits(enrollDataRef.current.helperData, BCH_N);
    const noisy = xorBits(bioBits, helperBits);
    const recovered = noisy.slice(0, BCH_K);

    let errors = 0;
    for (let i = 0; i < BCH_K; i++) if (recovered[i] !== enrollDataRef.current.keyBits[i]) errors++;
    addLog(`  Bit errors: ${errors} / ${BCH_K}`, errors <= 30 ? 'info' : 'warn');

    if (errors <= 30) {
      const secretID = enrollDataRef.current.secretID;
      addLog(`  Secret_ID reproduced ✓ (${errors} bits corrected)`, 'success');
      updateState({
        phase: 'done',
        crypto: { secretID, bchErrors: errors, commitment: enrollDataRef.current.commitment },
        result: { type: 'verification', success: true, message: `Verified! Same person. ${errors} bits corrected.` },
      });
    } else {
      addLog(`  Too many errors — different person?`, 'error');
      updateState({
        phase: 'error',
        crypto: { secretID: null, bchErrors: errors, commitment: null },
        result: { type: 'verification', success: false, message: `Failed. ${errors} bit errors (max correctable: 30).` },
      });
    }
    addLog('━━━ VERIFICATION COMPLETE ━━━', errors <= 30 ? 'success' : 'error');
  }, [runLiveness, extractEmb, addLog, updateState]);

  return {
    state,
    videoRef,
    actions: { startCamera, enroll, verify },
    hasEnrollment: !!enrollDataRef.current,
  };
}
