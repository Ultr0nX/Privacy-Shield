// src/utils/faceGeometry.js
export const distance = (a, b) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2 + (a.z - b.z)**2);

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

export const isHeadStable = (landmarks) => {
  const leftEye = landmarks[33], rightEye = landmarks[263], nose = landmarks[1], chin = landmarks[152];
  const eyeSlope = Math.abs((rightEye.y - leftEye.y) / (rightEye.x - leftEye.x));
  const verticalRatio = distance(nose, chin) / distance(leftEye, rightEye);
  return eyeSlope < 0.12 && verticalRatio > 0.9 && verticalRatio < 2.0;
};