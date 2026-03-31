/**
 * Geometry-based face descriptor using MediaPipe 3D landmarks.
 *
 * Replaces the face-api.js DNN approach. All 64 features are Euclidean
 * distances between landmark pairs, normalised by the interocular distance
 * so the descriptor is scale- and translation-invariant. Because these are
 * pure geometric measurements they are far more stable across sessions than
 * DNN embeddings, which change with lighting and camera angle.
 */

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// 64 landmark pairs sourced from MediaPipe Face Mesh canonical indices.
// Grouped by facial region for interpretability.
const PAIRS = [
  // Left eye outline
  [33, 160], [33, 133], [160, 144], [133, 144], [158, 153], [33, 159], [33, 145], [159, 145],
  // Right eye outline
  [263, 385], [263, 362], [385, 380], [362, 380], [387, 373], [263, 386], [263, 374], [386, 374],
  // Inter-eye (cross-face)
  [33, 263], [133, 362], [160, 385], [144, 380], [33, 362], [133, 263], [159, 386], [145, 374],
  // Nose
  [4, 1], [4, 61], [4, 291], [4, 152], [1, 61], [1, 291], [4, 168], [1, 168],
  // Mouth
  [61, 291], [13, 14], [13, 61], [13, 291], [14, 61], [14, 291], [61, 17], [291, 17],
  // Face structure (forehead, temples, chin)
  [10, 152], [234, 454], [234, 152], [454, 152], [10, 33], [10, 263], [10, 1], [10, 4],
  // Eyes to nose / mouth cross-measurements
  [33, 61], [263, 291], [33, 4], [263, 4], [234, 4], [454, 4], [234, 61], [454, 291],
  // Jaw / chin
  [152, 61], [152, 291], [133, 291], [362, 61], [234, 13], [454, 13], [33, 152], [263, 152],
];

/**
 * Extract a 64-element geometric descriptor from MediaPipe face landmarks.
 * Synchronous — no model loading required.
 *
 * @param {Array} landmarks  Array of {x,y,z} objects from FaceLandmarker
 * @returns {Float32Array}   64 normalised distance features
 */
export function extractDescriptor(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    throw new Error('Insufficient landmarks (need 468)');
  }

  const interocular = dist(landmarks[33], landmarks[263]);
  if (interocular < 1e-6) {
    throw new Error('Face too small — move closer to the camera');
  }

  const features = new Float32Array(PAIRS.length);
  for (let i = 0; i < PAIRS.length; i++) {
    features[i] = dist(landmarks[PAIRS[i][0]], landmarks[PAIRS[i][1]]) / interocular;
  }

  return features;
}

/**
 * Average an array of descriptors using a trimmed mean (removes top+bottom 20%
 * of frames per dimension).  This eliminates outlier frames caused by blinks,
 * head turns, or motion blur without needing a frame-quality pre-filter.
 *
 * Falls back to plain mean when there are fewer than 5 descriptors.
 *
 * @param {Float32Array[]} descriptors
 * @returns {Float32Array}
 */
export function averageDescriptors(descriptors) {
  if (!descriptors || descriptors.length === 0) {
    throw new Error('At least one descriptor is required');
  }

  const n   = descriptors.length;
  const dim = descriptors[0].length;
  const avg = new Float32Array(dim);

  if (n < 5) {
    // Not enough frames for trimming — plain mean.
    for (const d of descriptors) {
      for (let i = 0; i < dim; i++) avg[i] += d[i];
    }
    for (let i = 0; i < dim; i++) avg[i] /= n;
    return avg;
  }

  // Trim 20% from each end (so 60% of frames contribute per dimension).
  const trim   = Math.max(1, Math.floor(n * 0.2));
  const keepN  = n - 2 * trim;
  const col    = new Float32Array(n);

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < n; j++) col[j] = descriptors[j][i];
    col.sort();
    let sum = 0;
    for (let j = trim; j < n - trim; j++) sum += col[j];
    avg[i] = sum / keepN;
  }

  return avg;
}

/**
 * No-op kept for API compatibility — geometry approach needs no model.
 */
export async function initializeEmbeddingModels() {
  return Promise.resolve();
}
