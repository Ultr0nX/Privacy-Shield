/**
 * Privacy Shield — Face Embedding Extractor
 * ==========================================
 * Uses face-api.js for face detection + alignment, then feeds the aligned
 * face crop into a TensorFlow.js ArcFace model to produce a 512-dimensional
 * face descriptor (embedding).
 *
 * Dependencies: face-api.js, @tensorflow/tfjs
 */

const faceapi = require("face-api.js");
const tf = require("@tensorflow/tfjs");

// ─── Configuration ───────────────────────────────────────────────
const CONFIG = {
  // Path to face-api.js model weights (SSD + Landmarks)
  FACEAPI_MODEL_URI: "/models/faceapi",
  // Path to the TF.js ArcFace model (model.json + weight shards)
  ARCFACE_MODEL_URI: "/models/arcface/model.json",
  // Expected ArcFace input size (112×112 is standard for ArcFace)
  ARCFACE_INPUT_SIZE: 112,
  // Number of frames to average for multi-frame extraction
  MULTI_FRAME_COUNT: 3,
  // Delay between multi-frame captures in ms
  MULTI_FRAME_DELAY_MS: 350,
  // Embedding dimensionality
  EMBEDDING_DIM: 512,
};

let faceapiModelsLoaded = false;
let arcfaceModel = null;

/**
 * Load face-api.js detection + landmark models (one-time initialization).
 */
async function loadFaceApiModels(modelUri) {
  if (faceapiModelsLoaded) return;
  const uri = modelUri || CONFIG.FACEAPI_MODEL_URI;
  await faceapi.nets.ssdMobilenetv1.loadFromUri(uri);
  await faceapi.nets.faceLandmark68Net.loadFromUri(uri);
  faceapiModelsLoaded = true;
}

/**
 * Load the ArcFace TF.js graph model (one-time initialization).
 */
async function loadArcFaceModel(modelUri) {
  if (arcfaceModel) return arcfaceModel;
  const uri = modelUri || CONFIG.ARCFACE_MODEL_URI;
  arcfaceModel = await tf.loadGraphModel(uri);
  return arcfaceModel;
}

/**
 * Detect a face and extract 68 landmarks for alignment.
 * Returns the detection with landmarks, or null if no face found.
 */
async function detectAlignedFace(input) {
  const detection = await faceapi
    .detectSingleFace(input)
    .withFaceLandmarks();
  return detection || null;
}

/**
 * Crop and align a face from the input image/video frame using the
 * detected landmarks. Returns a 112×112 tensor suitable for ArcFace.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} input
 * @param {faceapi.FaceDetection} detection
 * @returns {tf.Tensor4D} — shape [1, 112, 112, 3], float32 normalized to [-1, 1]
 */
function cropAlignedFace(input, detection) {
  const box = detection.detection.box;

  // Expand box slightly for better alignment (10% padding)
  const padX = box.width * 0.1;
  const padY = box.height * 0.1;

  const inputWidth = input.videoWidth || input.width;
  const inputHeight = input.videoHeight || input.height;

  const x = Math.max(0, Math.round(box.x - padX));
  const y = Math.max(0, Math.round(box.y - padY));
  const w = Math.min(inputWidth - x, Math.round(box.width + 2 * padX));
  const h = Math.min(inputHeight - y, Math.round(box.height + 2 * padY));

  return tf.tidy(() => {
    // Read image as tensor
    const imgTensor = tf.browser.fromPixels(input);
    // Crop face region
    const cropped = tf.image.cropAndResize(
      imgTensor.expandDims(0).toFloat(),
      [[y / inputHeight, x / inputWidth, (y + h) / inputHeight, (x + w) / inputWidth]],
      [0],
      [CONFIG.ARCFACE_INPUT_SIZE, CONFIG.ARCFACE_INPUT_SIZE]
    );
    // Normalize to [-1, 1] (ArcFace standard preprocessing)
    return cropped.div(127.5).sub(1.0);
  });
}

/**
 * Run ArcFace model on the preprocessed face tensor.
 * @param {tf.Tensor4D} faceTensor — [1, 112, 112, 3]
 * @returns {Float32Array} — 512-dim embedding
 */
async function runArcFace(faceTensor) {
  const model = await loadArcFaceModel();
  const output = model.predict(faceTensor);
  const embedding = await output.data();
  output.dispose();

  // L2 normalize the embedding
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  const normalized = new Float32Array(CONFIG.EMBEDDING_DIM);
  for (let i = 0; i < CONFIG.EMBEDDING_DIM; i++) {
    normalized[i] = norm > 0 ? embedding[i] / norm : 0;
  }
  return normalized;
}

/**
 * Extract a single-frame 512-dim face embedding.
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} input
 * @returns {Promise<Float32Array>} — 512-dim L2-normalized embedding
 * @throws {Error} if no face detected
 */
async function extractSingleEmbedding(input) {
  await loadFaceApiModels();

  const detection = await detectAlignedFace(input);
  if (!detection) {
    throw new Error("No face detected in the input");
  }

  const faceTensor = cropAlignedFace(input, detection);
  try {
    return await runArcFace(faceTensor);
  } finally {
    faceTensor.dispose();
  }
}

/**
 * Extract a multi-frame averaged 512-dim embedding for higher stability.
 * Captures MULTI_FRAME_COUNT frames with MULTI_FRAME_DELAY_MS spacing,
 * then averages and L2-normalizes the result.
 *
 * @param {HTMLVideoElement} videoElement — Must be playing
 * @returns {Promise<Float32Array>} — 512-dim L2-normalized embedding
 */
async function extractEmbedding(videoElement) {
  await loadFaceApiModels();
  await loadArcFaceModel();

  const embeddings = [];

  for (let i = 0; i < CONFIG.MULTI_FRAME_COUNT; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, CONFIG.MULTI_FRAME_DELAY_MS));
    }
    const emb = await extractSingleEmbedding(videoElement);
    embeddings.push(emb);
  }

  // Average the embeddings
  const averaged = new Float32Array(CONFIG.EMBEDDING_DIM);
  for (let d = 0; d < CONFIG.EMBEDDING_DIM; d++) {
    let sum = 0;
    for (const emb of embeddings) {
      sum += emb[d];
    }
    averaged[d] = sum / embeddings.length;
  }

  // L2-normalize the averaged embedding
  const norm = Math.sqrt(averaged.reduce((sum, v) => sum + v * v, 0));
  for (let d = 0; d < CONFIG.EMBEDDING_DIM; d++) {
    averaged[d] = norm > 0 ? averaged[d] / norm : 0;
  }

  return averaged;
}

module.exports = {
  extractEmbedding,
  extractSingleEmbedding,
  loadFaceApiModels,
  loadArcFaceModel,
  CONFIG,
};
