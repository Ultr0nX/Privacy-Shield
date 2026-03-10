# Replace Facial Ratios with Embeddings + Fuzzy Extractor + Liveness Detection

The current plan uses **ratios between facial landmarks** hashed via Poseidon to produce a `Secret_ID`. This approach is fragile (ratios drift with lighting/angle) and fails to capture deep identity features. We will upgrade to:

1. **Liveness Detection** — verify the user is a real, live person before any biometric extraction.
2. **512-dim Face Embeddings** via a TF.js ArcFace model — a deep CNN-based descriptor far more robust and discriminative than hand-crafted ratios.
3. **Fuzzy Extractor** — error-tolerant key derivation that handles the inherent noise in biometric readings, producing a stable `Secret_ID` every time.

> [!IMPORTANT]
> This upgrade changes **Module A (AI/Identity Engine)** only. The ZK circuit, Relayer, and Smart Contract remain structurally the same — they still receive a single `Secret_ID` field. No handshake interfaces change.

---

## Proposed Changes

### AI Module (`AI/`)

#### [NEW] [package.json](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/AI/package.json)
- Node/browser project with dependencies: `face-api.js` (face detection + alignment), `@mediapipe/tasks-vision` (liveness), `@tensorflow/tfjs` (ArcFace 512-dim model), `poseidon-lite` (SNARK-friendly hash). BCH error-correction implemented inline.

---

#### [NEW] [livenessDetector.js](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/AI/src/livenessDetector.js)
**Purpose:** Anti-spoofing gate — must pass before any embedding extraction begins.

**Technique — Multi-Challenge Active Liveness:**
1. Use MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) to get 478 3D landmarks + blendshape scores in real-time.
2. Run a **3-phase challenge** over ~3 seconds:
   - **Blink detection** — track Eye Aspect Ratio (EAR) from upper/lower eyelid landmarks. A natural blink dips EAR below a threshold and recovers within ~300 ms.
   - **Head micro-motion** — compute yaw/pitch from the 3D landmark pose over consecutive frames. A live face shows natural micro-tremor; a printed photo is static.
   - **Expression challenge** (optional, configurable) — prompt user to smile; check `mouthSmileLeft`/`mouthSmileRight` blendshapes cross a threshold.
3. Score each check independently. Require ≥ 2 of 3 to pass.
4. Export: `async function checkLiveness(videoElement) → { passed: boolean, confidence: number }`

---

#### [NEW] [embeddingExtractor.js](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/AI/src/embeddingExtractor.js)
**Purpose:** Extract a 512-dimensional face descriptor (embedding) from a live video frame.

**How:**
1. Use `face-api.js` for **face detection + alignment**: `ssdMobilenetv1` + `faceLandmark68Net` → detect and crop+align the face.
2. Feed the aligned face crop into a **TF.js ArcFace model** (`tf.loadGraphModel('/models/arcface/model.json')`) to produce a 512-dim embedding.
3. Output: `Float32Array(512)` — the embedding vector.
4. **Multi-frame averaging** (optional): capture 3 frames over 1 second, average the descriptors to reduce per-frame noise.
5. Export: `async function extractEmbedding(videoElement) → Float32Array(512)`

> [!NOTE]
> ArcFace (Additive Angular Margin Loss) is the state-of-the-art face recognition architecture. It produces 512-dim embeddings where cosine similarity > 0.5 generally means "same person". The 512-dim vector gives the fuzzy extractor 4× more bits to work with compared to 128-dim, enabling much stronger error correction.

---

#### [NEW] [fuzzyExtractor.js](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/AI/src/fuzzyExtractor.js)
**Purpose:** Convert the noisy 128-dim embedding into a **stable, reproducible cryptographic key** (`Secret_ID`).

**Algorithm — Fuzzy Commitment Scheme (Juels-Wattenberg 1999):**

**Enrollment (first scan):**
1. Quantize 512-dim embedding → binary vector `b` (512 floats → 511 bits, using per-dimension threshold at 0.0; truncate 1 bit to fit BCH block length).
2. Generate a random secret key `K` (259-bit).
3. Encode `K` using a BCH error-correcting code → codeword `C` (511 bits).
4. Compute helper data: `H = b ⊕ C` (XOR).
5. Compute commitment: `hash(K)` using SHA-256.
6. Store publicly: `{ helperData: H, commitment: hash(K) }` — this is safe; it reveals nothing about the biometric.
7. The `Secret_ID = PoseidonHash(K)` (for ZK-circuit compatibility).

**Verification (subsequent scans):**
1. Quantize new embedding → `b'` (511 bits).
2. Compute `C' = b' ⊕ H`.
3. BCH-decode `C'` → `K'` (the error-correcting code fixes the bit-flips caused by biometric noise).
4. Check: `hash(K') === commitment`.
5. If match → `Secret_ID = PoseidonHash(K')`.

**Error tolerance:** BCH(511, 259, t=30) can correct up to 30 bit-flips out of 511 bits (~6% error rate). With 512-dim ArcFace embeddings, this is well within the typical intra-user variation for face biometrics.

**Exports:**
```
function enroll(embedding) → { helperData, commitment, secretID }
function reproduce(embedding, helperData, commitment) → { secretID, matched }
```

---

#### [NEW] [biometricPipeline.js](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/AI/src/biometricPipeline.js)
**Purpose:** Orchestrate the full flow: **Liveness → Embedding → Fuzzy Extract → Secret_ID**.

```
async function runBiometricPipeline(videoElement, storedHelperData?) {
  // Step 1: Liveness
  const liveness = await checkLiveness(videoElement);
  if (!liveness.passed) throw new Error("Liveness check failed");

  // Step 2: Extract Embedding
  const embedding = await extractEmbedding(videoElement);

  // Step 3: Fuzzy Extractor
  if (!storedHelperData) {
    // ENROLLMENT
    return enroll(embedding);
  } else {
    // VERIFICATION
    return reproduce(embedding, storedHelperData.helperData, storedHelperData.commitment);
  }
}
```

---

### Documentation Updates

#### [MODIFY] [plan.md](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/plan.md)
- Update Step 1 (Face Scan) to describe the new 3-stage pipeline: Liveness → Embedding → Fuzzy Extract.
- Update the Data Flow table to include liveness check and embedding step.
- Update Phase 2 M1 task from "ratios" to "embeddings + fuzzy extractor + liveness detection".

#### [MODIFY] [README.md](file:///c:/Users/acer/OneDrive/Desktop/Identity-protocol/README.md)
- Update Module A description to reflect facial embeddings + fuzzy extractor.
- Update the tech stack table: add `face-api.js`, fuzzy extractor row.
- Update "Zero Raw Data" section: now we store helper data (XOR of quantized bits and ECC codeword), which is cryptographically safe.

---

## Why This Design?

| Old (Ratios) | New (Embeddings + Fuzzy Extractor) |
|---|---|
| Hand-crafted feature (ratios of 468 landmarks) | ArcFace CNN-learned 512-dim descriptor — state-of-the-art discriminative power |
| Fragile to lighting, expression, angle changes | Robust: ArcFace embeddings tolerate real-world variance (lighting, pose, expression) |
| Direct hash of ratios — any noise = different hash | Fuzzy extractor with BCH(511,259,t=30) corrects up to ~6% bit errors → same key |
| No liveness check — vulnerable to photo attacks | Active liveness: blink + head motion + expression challenge |
| Single Poseidon hash of ratios | Poseidon hash of ECC-recovered key `K` — deterministic |

---

## Verification Plan

### Automated Tests
Since the modules are all new code (project was empty skeletons), we will verify with:

1. **`npm install` in `AI/`** — confirm all dependencies install cleanly:
   ```bash
   cd AI && npm install
   ```

2. **Node.js unit smoke test** — run a quick script that imports each module and checks exports exist:
   ```bash
   cd AI && node -e "const l = require('./src/livenessDetector'); const e = require('./src/embeddingExtractor'); const f = require('./src/fuzzyExtractor'); const p = require('./src/biometricPipeline'); console.log('All modules loaded OK');"
   ```

### Manual Verification
Since face detection and liveness require a webcam and browser environment, the full end-to-end test is manual:

1. Open the frontend (once built) in Chrome.
2. Grant camera permission.
3. **Liveness test:** Hold up a photo of a face → should FAIL. Face the camera yourself → should PASS (blink naturally, slight head movement).
4. **Enrollment:** After liveness passes, the pipeline returns `{ helperData, commitment, secretID }`.
5. **Re-verification:** Run pipeline again with stored `helperData` → should return the **same `secretID`**.
6. **Different person:** Have a second person try with Alice's `helperData` → should FAIL (`matched: false`).

> [!TIP]
> For development without a webcam, you can mock the liveness and embedding modules with hardcoded test vectors. The fuzzy extractor can be unit-tested independently with synthetic embeddings.
