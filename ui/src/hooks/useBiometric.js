import { useState, useRef, useCallback } from 'react';
import { initPoseidon, quantize, getRatios } from '../utils/crypto';
import { validateFaceQuality } from '../utils/validators';

/**
 * Custom hook for biometric processing
 * Handles face scanning, validation, and identity generation
 */
export const useBiometric = (scanThreshold = 20) => {
  const [secretId, setSecretId] = useState(null);
  const [commitment, setCommitment] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [verified, setVerified] = useState(false);
  
  const poseidonRef = useRef(null);
  const bufferRef = useRef([]);
  const validFramesRef = useRef(0);
  
  // Initialize Poseidon hash function
  const initializePoseidon = useCallback(async () => {
    if (!poseidonRef.current) {
      poseidonRef.current = await initPoseidon();
      // Make it globally accessible for proof service
      window.poseidonInstance = poseidonRef.current;
    }
    return poseidonRef.current;
  }, []);
  
  // Reset biometric data
  const reset = useCallback(() => {
    setSecretId(null);
    setCommitment("");
    setProgress(0);
    setStatus("Idle");
    setVerified(false);
    bufferRef.current = [];
    validFramesRef.current = 0;
  }, []);
  
  // Process face landmarks from scanner
  const processLandmarks = useCallback(async (landmarks) => {
    if (verified) return;
    
    try {
      // Validate face quality
      const validation = validateFaceQuality(landmarks, 640, 480);
      
      if (!validation.valid) {
        setStatus(`⚠️ ${validation.reason}`);
        return;
      }
      
      // Only process high-quality frames
      if (validation.score < 75) {
        setStatus(`📸 Face quality: ${validation.score}% - ${validation.reason}`);
        return;
      }
      
      validFramesRef.current++;
      
      // Extract facial ratios
      const ratios = getRatios(landmarks);
      bufferRef.current.push(ratios);
      
      const currentProgress = Math.min(100, Math.floor((bufferRef.current.length / scanThreshold) * 100));
      setProgress(currentProgress);
      setStatus(`✅ Capturing... ${validFramesRef.current} valid frames (Quality: ${validation.score}%)`);
      
      // Generate identity once threshold reached
      if (bufferRef.current.length >= scanThreshold) {
        setStatus("🔐 Finalizing Identity...");
        
        if (!poseidonRef.current) {
          await initializePoseidon();
        }
        
        // Average the ratios across all frames
        const avgRatios = bufferRef.current[0].map((_, i) => 
          bufferRef.current.reduce((sum, row) => sum + row[i], 0) / bufferRef.current.length
        );
        
        const quantizedRatios = quantize(avgRatios);
        
        // First hash: Biometric -> SecretId
        const firstHash = poseidonRef.current(quantizedRatios);
        const privateSecret = poseidonRef.current.F.toString(firstHash);
        
        // Second hash: SecretId -> Commitment
        const secondHash = poseidonRef.current([firstHash]);
        const publicCommitment = poseidonRef.current.F.toString(secondHash);
        
        setSecretId(privateSecret);
        setCommitment(publicCommitment);
        setVerified(true);
        setStatus("✅ Biometric Identity Captured Successfully");
      }
    } catch (err) {
      console.warn("Frame processing error:", err.message);
      setStatus("⚠️ Frame skipped");
    }
  }, [verified, scanThreshold, initializePoseidon]);
  
  return {
    secretId,
    commitment,
    progress,
    status,
    verified,
    processLandmarks,
    reset,
    initializePoseidon,
    validFrames: validFramesRef.current
  };
};
