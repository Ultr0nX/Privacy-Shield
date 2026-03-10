/**
 * Privacy Shield — Smoke Test
 * ============================
 * Quick verification that all modules load and export correctly.
 * Run with: node test/smoke.js
 *
 * NOTE: This does NOT test actual face detection (requires browser + webcam).
 *       It validates module structure, fuzzy extractor math, and exports.
 */

// ─── 1. Module Loading ──────────────────────────────────────────
console.log("=== Privacy Shield AI Module — Smoke Test ===\n");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// Test: livenessDetector exports
console.log("1. Liveness Detector:");
try {
  const liveness = require("../src/livenessDetector");
  assert(typeof liveness.checkLiveness === "function", "checkLiveness is a function");
  assert(typeof liveness.CONFIG === "object", "CONFIG is exported");
  assert(liveness.CONFIG.EAR_BLINK_THRESHOLD > 0, "EAR_BLINK_THRESHOLD is set");
} catch (e) {
  console.log(`  ❌ Failed to load: ${e.message}`);
  failed++;
}

// Test: embeddingExtractor exports
console.log("\n2. Embedding Extractor:");
try {
  const embedding = require("../src/embeddingExtractor");
  assert(typeof embedding.extractEmbedding === "function", "extractEmbedding is a function");
  assert(typeof embedding.extractSingleEmbedding === "function", "extractSingleEmbedding is a function");
  assert(typeof embedding.loadFaceApiModels === "function", "loadFaceApiModels is a function");
  assert(typeof embedding.loadArcFaceModel === "function", "loadArcFaceModel is a function");
  assert(embedding.CONFIG.EMBEDDING_DIM === 512, "EMBEDDING_DIM is 512");
} catch (e) {
  console.log(`  ❌ Failed to load: ${e.message}`);
  failed++;
}

// Test: fuzzyExtractor exports and math
console.log("\n3. Fuzzy Extractor:");
try {
  const fuzzy = require("../src/fuzzyExtractor");
  assert(typeof fuzzy.enroll === "function", "enroll is a function");
  assert(typeof fuzzy.reproduce === "function", "reproduce is a function");
  assert(typeof fuzzy.quantizeEmbedding === "function", "quantizeEmbedding is a function");
  assert(typeof fuzzy.bchEncode === "function", "bchEncode is a function");
  assert(typeof fuzzy.bchDecode === "function", "bchDecode is a function");
  assert(fuzzy.BCH_N === 511, "BCH_N is 511");
  assert(fuzzy.BCH_K === 259, "BCH_K is 259");
  assert(fuzzy.BCH_T === 30, "BCH_T is 30");

  // Test quantization
  console.log("\n   Quantization test:");
  const mockEmbedding = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    mockEmbedding[i] = (i % 2 === 0) ? 0.5 : -0.3;
  }
  const bits = fuzzy.quantizeEmbedding(mockEmbedding);
  assert(bits.length === 511, "Quantized to 511 bits");
  assert(bits[0] === 1, "Positive value → bit 1");
  assert(bits[1] === 0, "Negative value → bit 0");

  // Test BCH encode → decode roundtrip (no errors)
  console.log("\n   BCH encode/decode roundtrip (0 errors):");
  const testKey = new Uint8Array(259);
  for (let i = 0; i < 259; i++) testKey[i] = i % 2;
  const codeword = fuzzy.bchEncode(testKey);
  assert(codeword.length === 511, "Codeword is 511 bits");
  const decoded = fuzzy.bchDecode(codeword);
  assert(decoded !== null, "Decoding succeeded");
  assert(decoded.errors === 0, "0 errors detected");

  let keyMatch = true;
  for (let i = 0; i < 259; i++) {
    if (decoded.message[i] !== testKey[i]) { keyMatch = false; break; }
  }
  assert(keyMatch, "Recovered key matches original");

  // Test BCH with injected errors
  console.log("\n   BCH decode with 10 injected errors:");
  const noisyCodeword = codeword.slice();
  const errorPositions = [3, 17, 42, 88, 123, 199, 255, 301, 400, 490];
  for (const pos of errorPositions) {
    noisyCodeword[pos] ^= 1;
  }
  const decodedNoisy = fuzzy.bchDecode(noisyCodeword);
  assert(decodedNoisy !== null, "Decoding with errors succeeded");
  if (decodedNoisy) {
    assert(decodedNoisy.errors === 10, `Corrected ${decodedNoisy.errors} errors`);
    let noisyMatch = true;
    for (let i = 0; i < 259; i++) {
      if (decodedNoisy.message[i] !== testKey[i]) { noisyMatch = false; break; }
    }
    assert(noisyMatch, "Recovered key matches after error correction");
  }

} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
  console.log(`     Stack: ${e.stack}`);
  failed++;
}

// Test: biometricPipeline exports
console.log("\n4. Biometric Pipeline:");
try {
  const pipeline = require("../src/biometricPipeline");
  assert(typeof pipeline.runBiometricPipeline === "function", "runBiometricPipeline is a function");
  assert(typeof pipeline.preloadModels === "function", "preloadModels is a function");
} catch (e) {
  console.log(`  ❌ Failed to load: ${e.message}`);
  failed++;
}

// ─── Summary ─────────────────────────────────────────────────────
console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("⚠️  Some tests failed. Check errors above.");
  process.exit(1);
} else {
  console.log("🎉 All smoke tests passed!");
  process.exit(0);
}
