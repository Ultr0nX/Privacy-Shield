const BCH_N = 511;
const BCH_K = 259;
const BCH_T = 30;
const GF_M = 9;
const PRIMITIVE_POLY = 0x211;

function buildGaloisTables(m, primitivePolynomial) {
  const fieldSize = 1 << m;
  const exp = new Int32Array(fieldSize * 2);
  const log = new Int32Array(fieldSize);

  log[0] = -1;
  let value = 1;

  for (let index = 0; index < fieldSize - 1; index++) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & fieldSize) {
      value ^= primitivePolynomial;
    }
  }

  for (let index = fieldSize - 1; index < fieldSize * 2; index++) {
    exp[index] = exp[index - (fieldSize - 1)];
  }

  return { exp, log, fieldSize };
}

const GF = buildGaloisTables(GF_M, PRIMITIVE_POLY);

function gfMul(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF.exp[GF.log[left] + GF.log[right]];
}

function gfDiv(left, right) {
  if (right === 0) throw new Error('Division by zero in GF');
  if (left === 0) return 0;
  return GF.exp[(GF.log[left] - GF.log[right] + (GF.fieldSize - 1)) % (GF.fieldSize - 1)];
}

function gfPow(value, power) {
  if (value === 0) return 0;
  return GF.exp[(GF.log[value] * power) % (GF.fieldSize - 1)];
}

function computeGeneratorPoly() {
  const minPolynomials = [];
  const used = new Set();

  for (let index = 1; index <= 2 * BCH_T; index++) {
    if (used.has(index)) continue;

    let polynomial = [1];
    let conjugate = index;

    do {
      const root = GF.exp[conjugate % (GF.fieldSize - 1)];
      const nextPolynomial = new Array(polynomial.length + 1).fill(0);
      for (let polyIndex = 0; polyIndex < polynomial.length; polyIndex++) {
        nextPolynomial[polyIndex + 1] ^= polynomial[polyIndex];
        nextPolynomial[polyIndex] ^= gfMul(polynomial[polyIndex], root);
      }
      polynomial = nextPolynomial;
      used.add(conjugate);
      conjugate = (conjugate * 2) % (GF.fieldSize - 1);
    } while (conjugate !== index);

    minPolynomials.push(polynomial);
  }

  let generator = [1];
  for (const polynomial of minPolynomials) {
    const nextGenerator = new Array(generator.length + polynomial.length - 1).fill(0);
    for (let row = 0; row < generator.length; row++) {
      for (let column = 0; column < polynomial.length; column++) {
        nextGenerator[row + column] ^= gfMul(generator[row], polynomial[column]);
      }
    }
    generator = nextGenerator;
  }

  return generator;
}

let generatorPolynomial = null;

function getGeneratorPoly() {
  if (!generatorPolynomial) {
    generatorPolynomial = computeGeneratorPoly();
  }
  return generatorPolynomial;
}

function bchEncode(messageBits) {
  if (messageBits.length !== BCH_K) {
    throw new Error(`Message must be ${BCH_K} bits, got ${messageBits.length}`);
  }

  const generator = getGeneratorPoly();
  const parityLength = BCH_N - BCH_K;
  const shifted = new Uint8Array(BCH_N);
  shifted.set(messageBits);

  const remainder = new Uint8Array(BCH_N);
  remainder.set(shifted);

  for (let index = 0; index < BCH_K; index++) {
    if (remainder[index] === 1) {
      for (let inner = 0; inner < generator.length; inner++) {
        remainder[index + inner] ^= generator[inner] & 1;
      }
    }
  }

  const codeword = new Uint8Array(BCH_N);
  codeword.set(messageBits.slice(0, BCH_K));
  for (let index = 0; index < parityLength; index++) {
    codeword[BCH_K + index] = remainder[BCH_K + index];
  }

  return codeword;
}

function computeSyndromes(received) {
  const syndromes = new Int32Array(2 * BCH_T + 1);
  let allZero = true;

  for (let row = 1; row <= 2 * BCH_T; row++) {
    let syndrome = 0;
    for (let column = 0; column < BCH_N; column++) {
      if (received[column]) {
        syndrome ^= gfPow(GF.exp[1], (column * row) % (GF.fieldSize - 1));
      }
    }
    syndromes[row] = syndrome;
    if (syndrome !== 0) {
      allZero = false;
    }
  }

  syndromes[0] = allZero ? 0 : 1;
  return syndromes;
}

function berlekampMassey(syndromes) {
  const limit = 2 * BCH_T;
  let sigma = [1];
  let aux = [1];
  let degree = 0;
  let shift = 1;
  let discrepancyScale = 1;

  for (let index = 0; index < limit; index++) {
    let discrepancy = syndromes[index + 1];
    for (let inner = 1; inner <= degree; inner++) {
      if (inner < sigma.length) {
        discrepancy ^= gfMul(sigma[inner], syndromes[index + 1 - inner]);
      }
    }

    if (discrepancy === 0) {
      shift++;
      continue;
    }

    if (2 * degree <= index) {
      const snapshot = sigma.slice();
      const coefficient = gfDiv(discrepancy, discrepancyScale);
      while (sigma.length < aux.length + shift) sigma.push(0);
      for (let inner = 0; inner < aux.length; inner++) {
        sigma[inner + shift] ^= gfMul(coefficient, aux[inner]);
      }
      degree = index + 1 - degree;
      aux = snapshot;
      discrepancyScale = discrepancy;
      shift = 1;
      continue;
    }

    const coefficient = gfDiv(discrepancy, discrepancyScale);
    while (sigma.length < aux.length + shift) sigma.push(0);
    for (let inner = 0; inner < aux.length; inner++) {
      sigma[inner + shift] ^= gfMul(coefficient, aux[inner]);
    }
    shift++;
  }

  return sigma;
}

function chienSearch(sigma) {
  const errorPositions = [];

  for (let index = 0; index < BCH_N; index++) {
    let sum = 0;
    for (let inner = 0; inner < sigma.length; inner++) {
      sum ^= gfMul(sigma[inner], gfPow(GF.exp[1], (index * inner) % (GF.fieldSize - 1)));
    }
    if (sum === 0) {
      const position = (BCH_N - index) % BCH_N;
      if (position < BCH_N) {
        errorPositions.push(position);
      }
    }
  }

  return errorPositions;
}

function bchDecode(received) {
  if (received.length !== BCH_N) {
    throw new Error(`Received word must be ${BCH_N} bits, got ${received.length}`);
  }

  const syndromes = computeSyndromes(received);
  if (syndromes[0] === 0) {
    return {
      corrected: received.slice(),
      message: received.slice(0, BCH_K),
      errors: 0,
    };
  }

  const sigma = berlekampMassey(syndromes);
  const errorPositions = chienSearch(sigma);

  if (errorPositions.length === 0 || errorPositions.length > BCH_T) {
    return null;
  }

  const corrected = received.slice();
  for (const position of errorPositions) {
    corrected[position] ^= 1;
  }

  return {
    corrected,
    message: corrected.slice(0, BCH_K),
    errors: errorPositions.length,
  };
}

function projectionWeight(row, column) {
  let seed = ((row + 1) * 73856093) ^ ((column + 1) * 19349663) ^ 0x9e3779b9;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed & 1) === 0 ? -1 : 1;
}

function quantizeDescriptor(descriptor) {
  const bits = new Uint8Array(BCH_N);

  for (let row = 0; row < BCH_N; row++) {
    let projection = 0;
    for (let column = 0; column < descriptor.length; column++) {
      projection += descriptor[column] * projectionWeight(row, column);
    }
    bits[row] = projection >= 0 ? 1 : 0;
  }

  return bits;
}


function xorBits(left, right) {
  if (left.length !== right.length) {
    throw new Error('XOR length mismatch');
  }

  const result = new Uint8Array(left.length);
  for (let index = 0; index < left.length; index++) {
    result[index] = left[index] ^ right[index];
  }
  return result;
}

function bitsToBigInt(bits) {
  let result = 0n;
  for (let index = 0; index < bits.length; index++) {
    if (bits[index]) {
      result |= 1n << window.BigInt(bits.length - 1 - index);
    }
  }
  return result;
}

function bitsToHex(bits) {
  return `0x${bitsToBigInt(bits).toString(16).padStart(Math.ceil(bits.length / 4), '0')}`;
}

function hexToBits(hex, length) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bigint = window.BigInt(`0x${cleanHex}`);
  const bits = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    bits[index] = Number((bigint >> window.BigInt(length - 1 - index)) & 1n);
  }
  return bits;
}

/**
 * Generate a cryptographically random secret for enrollment.
 *
 * We use 248 bits of true randomness (31 bytes from crypto.getRandomValues),
 * padded to BCH_K=259 bits with 11 leading zero bits.  This keeps the
 * resulting BigInt safely below the BN254 field prime (≈ 2^254) without any
 * modular reduction step.
 */
function generateRandomSecretBits() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(31)); // 248 bits
  const bits = new Uint8Array(BCH_K); // zero-initialised → 11 leading zero bits
  const offset = BCH_K - 248;        // = 11
  for (let i = 0; i < 248; i++) {
    bits[offset + i] = (randomBytes[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
  }
  return bits;
}

/**
 * Derive a deterministic BN254 field element from a wallet signature.
 *
 * SHA-256(signature) gives 256 bits.  We take only the first 31 bytes
 * (248 bits) so the result is always < 2^248 < BN254 field prime — no
 * modular reduction needed, no entropy loss.
 *
 * Same wallet + same fixed message → same RFC-6979 signature → same element.
 *
 * @param  {string} signatureHex  65-byte ECDSA signature as a 0x hex string.
 * @returns {BigInt}              248-bit field element, safe for Poseidon.
 */
export async function walletSigToFieldElement(signatureHex) {
  const hex = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  const sigBytes  = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const hashBuf   = await crypto.subtle.digest('SHA-256', sigBytes);
  const hashBytes = new Uint8Array(hashBuf);
  let result = 0n;
  for (let i = 0; i < 31; i++) {
    result = (result << 8n) | window.BigInt(hashBytes[i]);
  }
  return result;
}

async function sha256Bits(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let index = 0; index < bits.length; index++) {
    if (bits[index]) {
      bytes[Math.floor(index / 8)] |= 1 << (7 - (index % 8));
    }
  }

  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Enroll a face descriptor with a fresh random secret.
 *
 * Security guarantee: randomSecret is NEVER stored.  The ONLY way to recover
 * it is to run BCH decode on (freshBiometricBits ⊕ helperData), which
 * succeeds only if the fresh face is within BCH_T=30 bits of the enrolled face.
 *
 * Packed helperData format (96 bytes / 192 hex chars after "0x"):
 *   bytes  0–63  : BCH XOR bits  (biometricBits ⊕ bchEncode(randomSecret))
 *   bytes 64–95  : SHA-256(randomSecretBits)  — recovery commitment
 *
 * @param  {Float32Array} descriptor  64-element geometric face descriptor.
 * @returns {{ helperDataHex: string, randomSecretBigInt: BigInt }}
 */
export async function enrollDescriptor(descriptor) {
  const biometricBits    = quantizeDescriptor(descriptor);
  const randomSecretBits = generateRandomSecretBits();
  const codeword         = bchEncode(randomSecretBits);
  const xorResult        = xorBits(biometricBits, codeword);
  const recoveryCommitment = await sha256Bits(randomSecretBits); // 64 hex chars = 32 bytes

  // Pack: bitsToHex gives "0x" + 128 hex chars (64 bytes).
  // Append 64-char recoveryCommitment → "0x" + 192 hex chars = 96 bytes total.
  const helperDataHex = bitsToHex(xorResult) + recoveryCommitment;

  return {
    helperDataHex,
    randomSecretBigInt: bitsToBigInt(randomSecretBits),
  };
}

/**
 * Recover the random secret from a fresh face scan.
 *
 * BCH error correction tolerates up to BCH_T=30 bit flips between the
 * enrollment biometric and the fresh scan.  The embedded SHA-256 commitment
 * (last 32 bytes of helperData) is used to verify the recovery before
 * returning — a wrong face produces garbage that fails this check.
 *
 * @param  {Float32Array} descriptor    Fresh 64-element geometric descriptor.
 * @param  {string}       helperDataHex 96-byte packed hex from enrollDescriptor.
 * @returns {{ matched: boolean, randomSecretBigInt: BigInt|null, errors: number|null }}
 */
export async function reproduceDescriptor(descriptor, helperDataHex) {
  // Unpack the 96-byte helperData.
  const hex      = helperDataHex.startsWith('0x') ? helperDataHex.slice(2) : helperDataHex;
  const xorHex   = hex.slice(0, 128);   // first 64 bytes = BCH XOR bits
  const storedRC = hex.slice(128, 192); // last  32 bytes = SHA-256(randomSecret)

  const biometricBits  = quantizeDescriptor(descriptor);
  const storedXorBits  = hexToBits('0x' + xorHex, BCH_N);
  const noisyCodeword  = xorBits(biometricBits, storedXorBits);

  // Log raw bit density of current face scan
  const currentOnes = biometricBits.reduce((s, b) => s + b, 0);
  const noisyOnes   = noisyCodeword.reduce((s, b) => s + b, 0);
  console.log(`%c[BCH] ── REPRODUCE START ──`, 'color:#facc15;font-weight:bold');
  console.log(`%c[BCH] current face bit density : ${currentOnes}/511 ones`, 'color:#888');
  console.log(`%c[BCH] noisy codeword weight    : ${noisyOnes}/511 (≈ face diff XOR codeword)`, 'color:#888');

  const decoded = bchDecode(noisyCodeword);

  if (!decoded) {
    console.log(`%c[BCH] ❌ DECODE FAILED — bit errors exceed BCH_T=${BCH_T}. Face too different from enrolled.`, 'color:#ff4444;font-weight:bold');
    return { matched: false, randomSecretBigInt: null, errors: null };
  }

  console.log(`%c[BCH] ✅ Decode succeeded — corrected ${decoded.errors} bit error(s)`, decoded.errors <= 10 ? 'color:#00ff88' : 'color:#facc15');

  const recoveredRC = await sha256Bits(decoded.message);
  const sha256Match = recoveredRC === storedRC;
  console.log(`%c[BCH] SHA-256 commitment check: ${sha256Match ? '✅ MATCH — correct face' : '❌ MISMATCH — wrong face (BCH corrected to wrong secret)'}`, sha256Match ? 'color:#00ff88' : 'color:#ff4444;font-weight:bold');

  if (!sha256Match) {
    return { matched: false, randomSecretBigInt: null, errors: decoded.errors };
  }

  return {
    matched:           true,
    randomSecretBigInt: bitsToBigInt(decoded.message),
    errors:            decoded.errors,
  };
}

export { BCH_N, BCH_K, BCH_T };