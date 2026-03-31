/**
 * Face Validation Utilities
 * Ensures proper human face detection and quality checks
 */

/**
 * Calculate face bounding box from landmarks
 */
const calculateFaceBoundingBox = (landmarks) => {
  const xs = landmarks.map(p => p.x);
  const ys = landmarks.map(p => p.y);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
};

/**
 * Calculate face orientation (yaw, pitch, roll)
 * Using key facial landmarks
 */
const calculateFaceOrientation = (landmarks) => {
  // Key landmarks: left eye, right eye, nose tip, left mouth, right mouth
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[1];
  const leftMouth = landmarks[61];
  const rightMouth = landmarks[291];
  
  // Calculate yaw (horizontal rotation) using eye positions
  const eyeWidth = Math.abs(rightEye.x - leftEye.x);
  const noseCenterOffset = noseTip.x - (leftEye.x + rightEye.x) / 2;
  const yaw = (noseCenterOffset / eyeWidth) * 90; // Approximate degrees
  
  // Calculate pitch (vertical rotation) using eye-nose-mouth alignment
  const eyeY = (leftEye.y + rightEye.y) / 2;
  const mouthY = (leftMouth.y + rightMouth.y) / 2;
  const faceHeight = mouthY - eyeY;
  const noseVerticalOffset = noseTip.y - eyeY;
  const pitch = ((noseVerticalOffset / faceHeight) - 0.4) * 90;
  
  // Calculate roll (tilt) using eye horizontal alignment
  const eyeDeltaY = rightEye.y - leftEye.y;
  const eyeDeltaX = rightEye.x - leftEye.x;
  const roll = Math.atan2(eyeDeltaY, eyeDeltaX) * (180 / Math.PI);
  
  return { yaw, pitch, roll };
};

/**
 * Calculate depth variance to detect 2D photos vs 3D faces
 * Real faces have more depth variation in z-coordinates
 */
const calculateDepthVariance = (landmarks) => {
  const zValues = landmarks.map(p => p.z || 0);
  const mean = zValues.reduce((sum, z) => sum + z, 0) / zValues.length;
  const variance = zValues.reduce((sum, z) => sum + Math.pow(z - mean, 2), 0) / zValues.length;
  return variance;
};

/**
 * Check if eyes are open (basic liveness check)
 */
const checkEyesOpen = (landmarks) => {
  // Left eye landmarks (upper and lower eyelid)
  const leftEyeUpper = landmarks[159];
  const leftEyeLower = landmarks[145];
  const leftEyeLeft = landmarks[33];
  const leftEyeRight = landmarks[133];
  
  // Right eye landmarks
  const rightEyeUpper = landmarks[386];
  const rightEyeLower = landmarks[374];
  const rightEyeLeft = landmarks[362];
  const rightEyeRight = landmarks[263];
  
  // Calculate eye aspect ratios
  const leftEyeHeight = Math.abs(leftEyeUpper.y - leftEyeLower.y);
  const leftEyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x);
  const leftEAR = leftEyeHeight / leftEyeWidth;
  
  const rightEyeHeight = Math.abs(rightEyeUpper.y - rightEyeLower.y);
  const rightEyeWidth = Math.abs(rightEyeRight.x - rightEyeLeft.x);
  const rightEAR = rightEyeHeight / rightEyeWidth;
  
  const avgEAR = (leftEAR + rightEAR) / 2;
  
  // Threshold: eyes are considered closed if EAR < 0.15
  return avgEAR > 0.15;
};

/**
 * Main validation function - comprehensive face quality check
 * @param {Array} landmarks - MediaPipe face landmarks (468 points)
 * @param {Number} imageWidth - Video frame width
 * @param {Number} imageHeight - Video frame height
 * @returns {Object} { valid: boolean, reason?: string, score: number }
 */
export const validateFaceQuality = (landmarks, imageWidth = 640, imageHeight = 480) => {
  if (!landmarks || landmarks.length < 468) {
    return { valid: false, reason: "Incomplete landmark data", score: 0 };
  }
  
  let score = 100; // Start with perfect score
  const issues = [];
  
  // 1. Check face size (not too close, not too far)
  const faceBox = calculateFaceBoundingBox(landmarks);
  // MediaPipe landmarks are normalized (0-1), so width*height is already a ratio
  const faceRatio = (faceBox.width * faceBox.height);
  
  // VERY LENIENT thresholds - accept almost any reasonable distance
  // This allows normal MacBook usage at comfortable sitting distance
  
  if (faceRatio < 0.03) {
    issues.push("Face too far - move closer");
    score -= 30;
  } else if (faceRatio > 0.65) {
    issues.push("Face too close - move back");
    score -= 30;
  } else if (faceRatio < 0.06) {
    // Still acceptable, just slightly reduce score
    score -= 5;
  } else if (faceRatio > 0.5) {
    // Still acceptable, just slightly reduce score
    score -= 5;
  }
  
  // 2. Check face orientation (looking at camera)
  const orientation = calculateFaceOrientation(landmarks);
  
  if (Math.abs(orientation.yaw) > 30) {
    issues.push("Face turned horizontally");
    score -= 25;
  } else if (Math.abs(orientation.yaw) > 20) {
    score -= 10;
  }
  
  if (Math.abs(orientation.pitch) > 25) {
    issues.push("Face tilted vertically");
    score -= 20;
  } else if (Math.abs(orientation.pitch) > 15) {
    score -= 10;
  }
  
  if (Math.abs(orientation.roll) > 20) {
    issues.push("Head tilted sideways");
    score -= 15;
  }
  
  // 3. Check depth variance (liveness / anti-spoofing)
  // Note: MacBook FaceTime cameras report lower z-variance than external webcams.
  // Thresholds are kept lenient to avoid blocking legitimate users; the 4-second
  // liveness challenge (blink + tilt + smile) is the primary anti-spoofing layer.
  const depthVariance = calculateDepthVariance(landmarks);

  if (depthVariance < 0.0001) {
    issues.push("Possible 2D photo detected");
    score -= 25;
  } else if (depthVariance < 0.0003) {
    score -= 10;
  }
  
  // 4. Check eyes open (basic liveness)
  const eyesOpen = checkEyesOpen(landmarks);
  if (!eyesOpen) {
    issues.push("Keep eyes open");
    score -= 25;
  }
  
  // 5. Check face centering
  const faceCenterX = (faceBox.minX + faceBox.maxX) / 2;
  const faceCenterY = (faceBox.minY + faceBox.maxY) / 2;
  const frameCenterX = 0.5;
  const frameCenterY = 0.5;
  
  const centerOffsetX = Math.abs(faceCenterX - frameCenterX);
  const centerOffsetY = Math.abs(faceCenterY - frameCenterY);
  
  if (centerOffsetX > 0.2 || centerOffsetY > 0.2) {
    issues.push("Center your face in frame");
    score -= 15;
  }
  
  // Validation passes if score > 60
  const valid = score >= 60;
  
  return {
    valid,
    score: Math.max(0, score),
    reason: issues.length > 0 ? issues[0] : "Good face quality",
    allIssues: issues,
    metrics: {
      faceSize: faceRatio,
      orientation,
      depthVariance,
      eyesOpen
    }
  };
};

/**
 * Quick validation for real-time feedback (very lenient)
 */
export const quickValidateFace = (landmarks) => {
  if (!landmarks || landmarks.length < 468) {
    return { valid: false, message: "No face detected" };
  }
  
  const faceBox = calculateFaceBoundingBox(landmarks);
  // MediaPipe landmarks are normalized (0-1)
  const faceRatio = faceBox.width * faceBox.height;
  
  // Very lenient - accept almost any distance
  if (faceRatio < 0.03) {
    return { valid: false, message: "Move closer to camera" };
  }
  if (faceRatio > 0.65) {
    return { valid: false, message: "Move back from camera" };
  }
  
  const orientation = calculateFaceOrientation(landmarks);
  if (Math.abs(orientation.yaw) > 35) {
    return { valid: false, message: "Face camera directly" };
  }
  
  return { valid: true, message: "Good position" };
};
