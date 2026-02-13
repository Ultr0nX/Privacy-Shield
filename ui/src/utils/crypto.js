import { buildPoseidon } from "circomlibjs";

// Helper for biometric geometry
export const distance = (a, b) => 
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

// FIXED: Explicitly exporting getRatios so App.js can find it
export const getRatios = (landmarks) => {
  const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1], chin = landmarks[152];
  const eyeDist = distance(leftEye, rightEye);
  return [
    distance(nose, leftEye) / eyeDist,
    distance(nose, rightEye) / eyeDist,
    distance(landmarks[61], landmarks[291]) / eyeDist,
    distance(nose, chin) / eyeDist,
  ];
};

export const quantize = (ratios) => ratios.map((r) => Math.floor(r * 100000));

export const initPoseidon = async () => {
  return await buildPoseidon();
};