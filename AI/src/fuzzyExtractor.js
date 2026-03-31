/**
 * Privacy Shield — Fuzzy Extractor
 * ==================================
 * Implements the Fuzzy Commitment Scheme (Juels-Wattenberg 1999) to convert
 * noisy 512-dim face embeddings into a stable, reproducible cryptographic key.
 *
 * Pipeline:
 *   Embedding (Float32[512]) → Quantize → Binary[511] → BCH ⊕ XOR → Key K
 *
 * Uses BCH(511, 259, t=30) error-correcting code: can fix up to 30 bit-flips
 * out of 511 bits (~6% error rate), well within typical face embedding noise.
 *
 * Dependencies: poseidon-lite (SNARK-friendly hash for Secret_ID)
 */

const { poseidon1, poseidon2 } = require("poseidon-lite");

// ─── BCH Parameters ─────────────────────────────────────────────
// BCH(511, 259, t=30) over GF(2^9)
const BCH_N = 511;     // codeword length (bits)
const BCH_K = 259;     // message length (bits)
const BCH_T = 30;      // error correction capability
const GF_M = 9;        // Galois field order: GF(2^9), so n = 2^9 - 1 = 511

// Primitive polynomial for GF(2^9): x^9 + x^4 + 1 = 0x211
const PRIMITIVE_POLY = 0x211;

// ─── Galois Field Arithmetic GF(2^m) ────────────────────────────

/**
 * Build GF(2^m) exponent and logarithm tables.
 */
function buildGaloisTables(m, primPoly) {
  const fieldSize = (1 << m); // 2^m = 512
  const exp = new Int32Array(fieldSize * 2); // exp[i] = α^i
  const log = new Int32Array(fieldSize);     // log[α^i] = i

  log[0] = -1; // log(0) undefined
  let val = 1;
  for (let i = 0; i < fieldSize - 1; i++) {
    exp[i] = val;
    log[val] = i;
    val <<= 1;
    if (val & fieldSize) {
      val ^= primPoly;
    }
  }
  // Extend exp table for easy modular arithmetic
  for (let i = fieldSize - 1; i < fieldSize * 2; i++) {
    exp[i] = exp[i - (fieldSize - 1)];
  }

  return { exp, log, fieldSize };
}

const GF = buildGaloisTables(GF_M, PRIMITIVE_POLY);

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF.exp[GF.log[a] + GF.log[b]];
}

function gfDiv(a, b) {
  if (b === 0) throw new Error("Division by zero in GF");
  if (a === 0) return 0;
  return GF.exp[(GF.log[a] - GF.log[b] + (GF.fieldSize - 1)) % (GF.fieldSize - 1)];
}

function gfPow(a, power) {
  if (a === 0) return 0;
  return GF.exp[(GF.log[a] * power) % (GF.fieldSize - 1)];
}

function gfInv(a) {
  if (a === 0) throw new Error("Inverse of zero in GF");
  return GF.exp[(GF.fieldSize - 1) - GF.log[a]];
}

// ─── BCH Encoder ─────────────────────────────────────────────────

/**
 * Compute the generator polynomial for BCH(n, k, t).
 * g(x) = LCM of minimal polynomials of α^1, α^3, ..., α^(2t-1)
 */
function computeGeneratorPoly() {
  // Find minimal polynomials
  const minPolys = [];
  const used = new Set();

  for (let i = 1; i <= 2 * BCH_T; i++) {
    if (used.has(i)) continue;

    // Compute the minimal polynomial of α^i
    let minPoly = [1];
    let conjugate = i;
    do {
      // Multiply minPoly by (x - α^conjugate)
      const root = GF.exp[conjugate % (GF.fieldSize - 1)];
      const newPoly = new Array(minPoly.length + 1).fill(0);
      for (let j = 0; j < minPoly.length; j++) {
        newPoly[j + 1] ^= minPoly[j];
        newPoly[j] ^= gfMul(minPoly[j], root);
      }
      minPoly = newPoly;

      used.add(conjugate);
      conjugate = (conjugate * 2) % (GF.fieldSize - 1);
    } while (conjugate !== i);

    minPolys.push(minPoly);
  }

  // Multiply all minimal polynomials to get g(x)
  let genPoly = [1];
  for (const mp of minPolys) {
    const newPoly = new Array(genPoly.length + mp.length - 1).fill(0);
    for (let i = 0; i < genPoly.length; i++) {
      for (let j = 0; j < mp.length; j++) {
        newPoly[i + j] ^= gfMul(genPoly[i], mp[j]);
      }
    }
    genPoly = newPoly;
  }

  return genPoly;
}

// Pre-compute the generator polynomial (computed once at module load)
let _generatorPoly = null;
function getGeneratorPoly() {
  if (!_generatorPoly) {
    _generatorPoly = computeGeneratorPoly();
  }
  return _generatorPoly;
}

/**
 * Encode a message (BCH_K bits) into a codeword (BCH_N bits).
 * Systematic encoding: codeword = [message | parity].
 *
 * @param {Uint8Array} messageBits — array of 0/1, length BCH_K
 * @returns {Uint8Array} — array of 0/1, length BCH_N
 */
function bchEncode(messageBits) {
  if (messageBits.length !== BCH_K) {
    throw new Error(`Message must be ${BCH_K} bits, got ${messageBits.length}`);
  }

  const genPoly = getGeneratorPoly();
  const parityLen = BCH_N - BCH_K;

  // Convert message bits to polynomial coefficients (GF(2))
  // Shift message by parityLen positions (multiply by x^parityLen)
  const shifted = new Uint8Array(BCH_N);
  for (let i = 0; i < BCH_K; i++) {
    shifted[i] = messageBits[i];
  }

  // Polynomial long division over GF(2)
  const remainder = new Uint8Array(BCH_N);
  remainder.set(shifted);

  for (let i = 0; i < BCH_K; i++) {
    if (remainder[i] === 1) {
      for (let j = 0; j < genPoly.length; j++) {
        // genPoly coefficients are in GF(2^m), but for binary BCH
        // we only need the parity (bit 0)
        remainder[i + j] ^= (genPoly[j] & 1);
      }
    }
  }

  // Codeword = message | remainder (systematic)
  const codeword = new Uint8Array(BCH_N);
  for (let i = 0; i < BCH_K; i++) {
    codeword[i] = messageBits[i];
  }
  for (let i = 0; i < parityLen; i++) {
    codeword[BCH_K + i] = remainder[BCH_K + i];
  }

  return codeword;
}

// ─── BCH Syndrome Decoder ────────────────────────────────────────

/**
 * Compute syndromes S_1, S_2, ..., S_{2t}.
 * S_j = r(α^j), where r(x) is the received bit-polynomial.
 */
function computeSyndromes(received) {
  const syndromes = new Int32Array(2 * BCH_T + 1);
  let allZero = true;

  for (let j = 1; j <= 2 * BCH_T; j++) {
    let s = 0;
    for (let i = 0; i < BCH_N; i++) {
      if (received[i]) {
        s ^= gfPow(GF.exp[1], (i * j) % (GF.fieldSize - 1));
      }
    }
    syndromes[j] = s;
    if (s !== 0) allZero = false;
  }

  syndromes[0] = allZero ? 0 : 1; // flag: 0 = no errors
  return syndromes;
}

/**
 * Berlekamp-Massey algorithm to find the error locator polynomial σ(x).
 */
function berlekampMassey(syndromes) {
  const T2 = 2 * BCH_T;
  let sigma = [1];     // Error locator polynomial
  let B = [1];         // Auxiliary polynomial
  let L = 0;           // Current number of assumed errors
  let m = 1;           // Step counter
  let b = 1;           // Previous discrepancy

  for (let n = 0; n < T2; n++) {
    // Compute discrepancy d
    let d = syndromes[n + 1];
    for (let i = 1; i <= L; i++) {
      if (i < sigma.length) {
        d ^= gfMul(sigma[i], syndromes[n + 1 - i]);
      }
    }

    if (d === 0) {
      m++;
    } else if (2 * L <= n) {
      const T = sigma.slice();
      const coeff = gfDiv(d, b);
      // σ(x) = σ(x) - d/b * x^m * B(x)
      while (sigma.length < B.length + m) sigma.push(0);
      for (let i = 0; i < B.length; i++) {
        sigma[i + m] ^= gfMul(coeff, B[i]);
      }
      L = n + 1 - L;
      B = T;
      b = d;
      m = 1;
    } else {
      const coeff = gfDiv(d, b);
      while (sigma.length < B.length + m) sigma.push(0);
      for (let i = 0; i < B.length; i++) {
        sigma[i + m] ^= gfMul(coeff, B[i]);
      }
      m++;
    }
  }

  return sigma;
}

/**
 * Chien search: find the roots of σ(x) to locate error positions.
 */
function chienSearch(sigma) {
  const errorPositions = [];
  for (let i = 0; i < BCH_N; i++) {
    let sum = 0;
    for (let j = 0; j < sigma.length; j++) {
      sum ^= gfMul(sigma[j], gfPow(GF.exp[1], (i * j) % (GF.fieldSize - 1)));
    }
    if (sum === 0) {
      // α^i is a root → error at position (n - i) mod n
      const pos = (BCH_N - i) % BCH_N;
      if (pos < BCH_N) {
        errorPositions.push(pos);
      }
    }
  }
  return errorPositions;
}

/**
 * BCH decode: correct up to t errors in the received word.
 *
 * @param {Uint8Array} received — array of 0/1, length BCH_N
 * @returns {{ corrected: Uint8Array, message: Uint8Array, errors: number } | null}
 *   null if decoding fails (too many errors)
 */
function bchDecode(received) {
  if (received.length !== BCH_N) {
    throw new Error(`Received word must be ${BCH_N} bits, got ${received.length}`);
  }

  const syndromes = computeSyndromes(received);
  if (syndromes[0] === 0) {
    // No errors
    return {
      corrected: received.slice(),
      message: received.slice(0, BCH_K),
      errors: 0,
    };
  }

  const sigma = berlekampMassey(syndromes);
  const errorPositions = chienSearch(sigma);

  if (errorPositions.length === 0 || errorPositions.length > BCH_T) {
    return null; // Decoding failure
  }

  // Correct errors
  const corrected = received.slice();
  for (const pos of errorPositions) {
    corrected[pos] ^= 1;
  }

  return {
    corrected,
    message: corrected.slice(0, BCH_K),
    errors: errorPositions.length,
  };
}

// ─── Quantization ────────────────────────────────────────────────

/**
 * Quantize a 512-dim float embedding → 511-bit binary vector.
 * Each dimension is thresholded at 0.0: positive → 1, negative → 0.
 * First 511 dimensions are used (truncate 1 to match BCH_N).
 *
 * @param {Float32Array} embedding — 512-dim L2-normalized
 * @returns {Uint8Array} — 511 bits (0/1 values)
 */
function quantizeEmbedding(embedding) {
  const bits = new Uint8Array(BCH_N);
  for (let i = 0; i < BCH_N; i++) {
    bits[i] = embedding[i] >= 0 ? 1 : 0;
  }
  return bits;
}

// ─── Crypto Utilities ────────────────────────────────────────────

/**
 * Generate cryptographically random bits.
 * @param {number} numBits
 * @returns {Uint8Array} — array of 0/1
 */
function randomBits(numBits) {
  const bytes = new Uint8Array(Math.ceil(numBits / 8));
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    const nodeCrypto = require("crypto");
    const buf = nodeCrypto.randomBytes(bytes.length);
    bytes.set(buf);
  }
  const bits = new Uint8Array(numBits);
  for (let i = 0; i < numBits; i++) {
    bits[i] = (bytes[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
  }
  return bits;
}

/**
 * XOR two bit arrays of the same length.
 */
function xorBits(a, b) {
  if (a.length !== b.length) throw new Error("XOR length mismatch");
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Convert a bit array to a BigInt.
 */
function bitsToBigInt(bits) {
  let result = 0n;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      result |= 1n << BigInt(bits.length - 1 - i);
    }
  }
  return result;
}

/**
 * Convert a bit array to a hex string.
 */
function bitsToHex(bits) {
  const bigint = bitsToBigInt(bits);
  return "0x" + bigint.toString(16).padStart(Math.ceil(bits.length / 4), "0");
}

/**
 * SHA-256 hash of a bit array (for commitment).
 */
async function sha256Bits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
    }
  }

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } else {
    const nodeCrypto = require("crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  }
}

/**
 * Poseidon hash of the key K for ZK-circuit compatibility.
 * Converts key bits to a field element and hashes with Poseidon.
 */
function poseidonHashKey(keyBits) {
  const keyBigInt = bitsToBigInt(keyBits);
  return poseidon1([keyBigInt]);
}

// ─── Fuzzy Commitment: Enrollment ────────────────────────────────

/**
 * ENROLLMENT: Generate helper data and Secret_ID from a face embedding.
 *
 * @param {Float32Array} embedding — 512-dim face embedding
 * @returns {Promise<{ helperData: string, commitment: string, secretID: string, keyHex: string }>}
 *   - helperData: hex-encoded XOR of quantized bits and BCH codeword (safe to store publicly)
 *   - commitment: SHA-256(K) — used to verify key recovery
 *   - secretID: Poseidon(K) — used as input to the ZK circuit
 *   - keyHex: hex-encoded key K (for debugging; do NOT store in production)
 */
async function enroll(embedding) {
  // 1. Quantize embedding → binary
  const bioBits = quantizeEmbedding(embedding);

  // 2. Generate random secret key K
  const keyBits = randomBits(BCH_K);

  // 3. BCH-encode K → codeword C
  const codeword = bchEncode(keyBits);

  // 4. Helper data H = bioBits ⊕ codeword
  const helperData = xorBits(bioBits, codeword);

  // 5. Commitment = SHA-256(K)
  const commitment = await sha256Bits(keyBits);

  // 6. Secret_ID = Poseidon(K)
  const secretID = poseidonHashKey(keyBits);

  return {
    helperData: bitsToHex(helperData),
    commitment,
    secretID: secretID.toString(),
    keyHex: bitsToHex(keyBits),
  };
}

// ─── Fuzzy Commitment: Reproduction ──────────────────────────────

/**
 * Parse a hex string back into a Uint8Array of 0/1 bits.
 */
function hexToBits(hex, length) {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bigint = BigInt("0x" + cleanHex);
  const bits = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bits[i] = Number((bigint >> BigInt(length - 1 - i)) & 1n);
  }
  return bits;
}

/**
 * VERIFICATION: Reproduce the Secret_ID from a new face scan using stored helper data.
 *
 * @param {Float32Array} embedding — 512-dim face embedding (new scan)
 * @param {string} helperDataHex — stored helper data from enrollment
 * @param {string} commitment — stored SHA-256(K) from enrollment
 * @returns {Promise<{ secretID: string | null, matched: boolean, errors: number | null }>}
 */
async function reproduce(embedding, helperDataHex, commitment) {
  // 1. Quantize new embedding
  const bioBits = quantizeEmbedding(embedding);

  // 2. Recover noisy codeword: C' = bioBits ⊕ helperData
  const helperBits = hexToBits(helperDataHex, BCH_N);
  const noisyCodeword = xorBits(bioBits, helperBits);

  // 3. BCH-decode to recover K'
  const decoded = bchDecode(noisyCodeword);
  if (!decoded) {
    return { secretID: null, matched: false, errors: null };
  }

  // 4. Verify commitment: SHA-256(K') === stored commitment
  const recoveredCommitment = await sha256Bits(decoded.message);
  const matched = recoveredCommitment === commitment;

  if (!matched) {
    return { secretID: null, matched: false, errors: decoded.errors };
  }

  // 5. Compute Secret_ID = Poseidon(K')
  const secretID = poseidonHashKey(decoded.message);

  return {
    secretID: secretID.toString(),
    matched: true,
    errors: decoded.errors,
  };
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  enroll,
  reproduce,
  quantizeEmbedding,
  bchEncode,
  bchDecode,
  BCH_N,
  BCH_K,
  BCH_T,
};
