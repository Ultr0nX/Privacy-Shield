/**
 * Privacy Shield — Biometric Pipeline Orchestrator
 * ==================================================
 * Ties together the full flow:
 *   1. Liveness Detection (anti-spoofing gate)
 *   2. Face Embedding Extraction (512-dim ArcFace)
 *   3. Fuzzy Extractor (enrollment or verification)
 *
 * This is the single entry point that the Frontend (Member 1)
 * calls to get a `Secret_ID` from a live webcam feed.
 *
 * Dependencies: ./livenessDetector, ./embeddingExtractor, ./fuzzyExtractor
 */

const { checkLiveness } = require("./livenessDetector");
const { extractEmbedding, loadFaceApiModels, loadArcFaceModel } = require("./embeddingExtractor");
const { enroll, reproduce } = require("./fuzzyExtractor");

/**
 * Pre-load all AI models. Call this once on app startup to avoid
 * long waits during the first biometric scan.
 *
 * @param {object} [options]
 * @param {string} [options.faceApiModelUri] — path to face-api.js models
 * @param {string} [options.arcfaceModelUri] — path to ArcFace TF.js model
 */
async function preloadModels(options = {}) {
  await Promise.all([
    loadFaceApiModels(options.faceApiModelUri),
    loadArcFaceModel(options.arcfaceModelUri),
  ]);
}

/**
 * Run the full biometric pipeline.
 *
 * ┌───────────────────────────────────────────────────────────────┐
 * │  ENROLLMENT (first time — no storedData provided)            │
 * │  Face → Liveness ✓ → Embedding → Fuzzy Enroll → Secret_ID   │
 * │  Returns: { helperData, commitment, secretID }               │
 * ├───────────────────────────────────────────────────────────────┤
 * │  VERIFICATION (returning user — storedData provided)         │
 * │  Face → Liveness ✓ → Embedding → Fuzzy Reproduce → Secret_ID│
 * │  Returns: { secretID, matched, errors }                      │
 * └───────────────────────────────────────────────────────────────┘
 *
 * @param {HTMLVideoElement} videoElement — Must be playing a live webcam stream
 * @param {object} [storedData] — Previously stored enrollment data
 * @param {string} storedData.helperData — Hex string from enrollment
 * @param {string} storedData.commitment — SHA-256(K) from enrollment
 * @param {object} [options]
 * @param {boolean} [options.skipLiveness=false] — Skip liveness (for testing only!)
 *
 * @returns {Promise<object>} Result object with secretID and metadata
 * @throws {Error} If liveness fails or no face detected
 */
async function runBiometricPipeline(videoElement, storedData = null, options = {}) {
  const result = {
    mode: storedData ? "verification" : "enrollment",
    liveness: null,
    secretID: null,
    matched: null,
    errors: null,
    helperData: null,
    commitment: null,
  };

  // ── Step 1: Liveness Detection ────────────────────────────────
  if (!options.skipLiveness) {
    console.log("[Pipeline] Step 1/3: Running liveness detection...");
    const liveness = await checkLiveness(videoElement);
    result.liveness = liveness;

    if (!liveness.passed) {
      throw new Error(
        `Liveness check failed (confidence: ${(liveness.confidence * 100).toFixed(0)}%). ` +
        `Details: blink=${liveness.details.blinkDetected}, ` +
        `motion=${liveness.details.headMotionDetected}, ` +
        `smile=${liveness.details.smileDetected}`
      );
    }
    console.log(`[Pipeline] Liveness PASSED (confidence: ${(liveness.confidence * 100).toFixed(0)}%)`);
  } else {
    console.warn("[Pipeline] ⚠️  Liveness detection SKIPPED (testing mode)");
  }

  // ── Step 2: Face Embedding Extraction ─────────────────────────
  console.log("[Pipeline] Step 2/3: Extracting 512-dim face embedding...");
  const embedding = await extractEmbedding(videoElement);
  console.log("[Pipeline] Embedding extracted successfully");

  // ── Step 3: Fuzzy Extractor ───────────────────────────────────
  if (!storedData) {
    // ─── ENROLLMENT ─────────────────────────────────────────────
    console.log("[Pipeline] Step 3/3: Enrolling — generating Secret_ID...");
    const enrollment = await enroll(embedding);

    result.secretID = enrollment.secretID;
    result.helperData = enrollment.helperData;
    result.commitment = enrollment.commitment;
    result.matched = true;

    console.log("[Pipeline] ✅ Enrollment complete!");
    console.log(`[Pipeline]    Secret_ID: ${enrollment.secretID}`);
  } else {
    // ─── VERIFICATION ───────────────────────────────────────────
    console.log("[Pipeline] Step 3/3: Verifying — reproducing Secret_ID...");
    const verification = await reproduce(
      embedding,
      storedData.helperData,
      storedData.commitment
    );

    result.secretID = verification.secretID;
    result.matched = verification.matched;
    result.errors = verification.errors;

    if (verification.matched) {
      console.log(`[Pipeline] ✅ Verification MATCHED! (${verification.errors} bits corrected)`);
      console.log(`[Pipeline]    Secret_ID: ${verification.secretID}`);
    } else {
      console.log(`[Pipeline] ❌ Verification FAILED — different person or too much noise`);
    }
  }

  return result;
}

module.exports = {
  runBiometricPipeline,
  preloadModels,
};
