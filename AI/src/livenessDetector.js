/**
 * Privacy Shield — Liveness Detector
 * ===================================
 * Anti-spoofing gate using MediaPipe Face Landmarker.
 * Runs multi-challenge active liveness (blink + head motion + expression)
 * entirely in the browser. Must pass before any biometric extraction.
 *
 * Dependencies: @mediapipe/tasks-vision
 */

const { FaceLandmarker, FilesetResolver } = require("@mediapipe/tasks-vision");

// ─── Configuration ───────────────────────────────────────────────
const CONFIG = {
  // Eye Aspect Ratio threshold (below = blink detected)
  EAR_BLINK_THRESHOLD: 0.21,
  // Minimum blink duration in ms
  BLINK_MIN_DURATION_MS: 80,
  // Maximum blink duration in ms (longer likely means eyes closed, not a blink)
  BLINK_MAX_DURATION_MS: 400,

  // Head micro-motion: minimum yaw/pitch delta (radians) across frames
  HEAD_MOTION_THRESHOLD: 0.02,

  // Expression challenge: smile blendshape score threshold
  SMILE_THRESHOLD: 0.4,

  // Total analysis duration in ms
  ANALYSIS_DURATION_MS: 3000,
  // Frame sampling interval in ms
  FRAME_INTERVAL_MS: 100,

  // Minimum checks that must pass (out of 3: blink, head motion, expression)
  MIN_CHECKS_PASSED: 2,
};

// ─── Landmark indices for Eye Aspect Ratio ───────────────────────
// MediaPipe 478-landmark model eye landmarks
const LEFT_EYE = {
  upper: [159, 145],  // upper/lower eyelid vertical pair
  outer: [33, 133],   // inner/outer corners (horizontal)
  p1: 33, p2: 160, p3: 158, p4: 133, p5: 153, p6: 144,
};
const RIGHT_EYE = {
  p1: 362, p2: 385, p3: 387, p4: 263, p5: 373, p6: 380,
};

/**
 * Calculate Eye Aspect Ratio (EAR) from 6 landmark points.
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 */
function euclidean(a, b) {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
  );
}

function computeEAR(landmarks, eye) {
  const p1 = landmarks[eye.p1];
  const p2 = landmarks[eye.p2];
  const p3 = landmarks[eye.p3];
  const p4 = landmarks[eye.p4];
  const p5 = landmarks[eye.p5];
  const p6 = landmarks[eye.p6];

  const vertical1 = euclidean(p2, p6);
  const vertical2 = euclidean(p3, p5);
  const horizontal = euclidean(p1, p4);

  if (horizontal === 0) return 1.0; // avoid division by zero
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Estimate head yaw and pitch from key face landmarks.
 * Uses nose tip (1), chin (152), left cheek (234), right cheek (454).
 */
function estimateHeadPose(landmarks) {
  const nose = landmarks[1];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  // Yaw: ratio of horizontal distance nose-to-cheeks
  const leftDist = Math.abs(nose.x - leftCheek.x);
  const rightDist = Math.abs(nose.x - rightCheek.x);
  const yaw = Math.atan2(leftDist - rightDist, leftDist + rightDist);

  // Pitch: vertical relation of nose to chin
  const faceHeight = euclidean(landmarks[10], chin); // forehead to chin
  const noseToChin = euclidean(nose, chin);
  const pitch = Math.asin(Math.min(1, Math.max(-1, (noseToChin / (faceHeight || 1)) - 0.5)));

  return { yaw, pitch };
}

/**
 * Initialize the MediaPipe FaceLandmarker.
 * @returns {Promise<FaceLandmarker>}
 */
async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  return faceLandmarker;
}

/**
 * Run multi-challenge active liveness detection.
 *
 * @param {HTMLVideoElement} videoElement — Must be playing a live webcam stream
 * @param {object} [options] — Override CONFIG values
 * @returns {Promise<{ passed: boolean, confidence: number, details: object }>}
 */
async function checkLiveness(videoElement, options = {}) {
  const cfg = { ...CONFIG, ...options };
  const faceLandmarker = await createFaceLandmarker();

  const frames = [];
  const startTime = performance.now();

  // ── Collect frames ──────────────────────────────────────────────
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= cfg.ANALYSIS_DURATION_MS) {
        clearInterval(interval);
        resolve();
        return;
      }

      const result = faceLandmarker.detectForVideo(videoElement, performance.now());
      if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        frames.push({
          timestamp: elapsed,
          landmarks: result.faceLandmarks[0],
          blendshapes: result.faceBlendshapes?.[0]?.categories || [],
        });
      }
    }, cfg.FRAME_INTERVAL_MS);
  });

  faceLandmarker.close();

  if (frames.length < 5) {
    return { passed: false, confidence: 0, details: { error: "Insufficient frames — no face detected" } };
  }

  // ── Check 1: Blink Detection ────────────────────────────────────
  let blinkDetected = false;
  let earBelowThreshold = false;
  let blinkStartTime = 0;

  for (const frame of frames) {
    const leftEAR = computeEAR(frame.landmarks, LEFT_EYE);
    const rightEAR = computeEAR(frame.landmarks, RIGHT_EYE);
    const avgEAR = (leftEAR + rightEAR) / 2;

    if (avgEAR < cfg.EAR_BLINK_THRESHOLD) {
      if (!earBelowThreshold) {
        earBelowThreshold = true;
        blinkStartTime = frame.timestamp;
      }
    } else {
      if (earBelowThreshold) {
        const blinkDuration = frame.timestamp - blinkStartTime;
        if (blinkDuration >= cfg.BLINK_MIN_DURATION_MS && blinkDuration <= cfg.BLINK_MAX_DURATION_MS) {
          blinkDetected = true;
        }
        earBelowThreshold = false;
      }
    }
  }

  // ── Check 2: Head Micro-Motion ──────────────────────────────────
  let headMotionDetected = false;
  const poses = frames.map((f) => estimateHeadPose(f.landmarks));
  let maxYawDelta = 0;
  let maxPitchDelta = 0;

  for (let i = 1; i < poses.length; i++) {
    const yawDelta = Math.abs(poses[i].yaw - poses[i - 1].yaw);
    const pitchDelta = Math.abs(poses[i].pitch - poses[i - 1].pitch);
    maxYawDelta = Math.max(maxYawDelta, yawDelta);
    maxPitchDelta = Math.max(maxPitchDelta, pitchDelta);
  }

  if (maxYawDelta > cfg.HEAD_MOTION_THRESHOLD || maxPitchDelta > cfg.HEAD_MOTION_THRESHOLD) {
    headMotionDetected = true;
  }

  // ── Check 3: Expression (Smile) ─────────────────────────────────
  let smileDetected = false;
  for (const frame of frames) {
    const smileLeft = frame.blendshapes.find((b) => b.categoryName === "mouthSmileLeft");
    const smileRight = frame.blendshapes.find((b) => b.categoryName === "mouthSmileRight");
    const smileScore = ((smileLeft?.score || 0) + (smileRight?.score || 0)) / 2;

    if (smileScore >= cfg.SMILE_THRESHOLD) {
      smileDetected = true;
      break;
    }
  }

  // ── Final Verdict ───────────────────────────────────────────────
  const checksPassed = [blinkDetected, headMotionDetected, smileDetected].filter(Boolean).length;
  const passed = checksPassed >= cfg.MIN_CHECKS_PASSED;
  const confidence = checksPassed / 3;

  return {
    passed,
    confidence,
    details: {
      blinkDetected,
      headMotionDetected,
      smileDetected,
      framesAnalyzed: frames.length,
      maxYawDelta,
      maxPitchDelta,
    },
  };
}

module.exports = { checkLiveness, CONFIG };
