const http = require('http');
const fs = require('fs');

// Read CLI-generated proof
const proof = JSON.parse(fs.readFileSync('./cli_proof.json', 'utf8'));
const publicSignals = JSON.parse(fs.readFileSync('./cli_public.json', 'utf8'));

console.log('🧪 Testing DIRECT call to Groth16Verifier contract...\n');
console.log('Verifier address: 0xd0d98DD0de10F014F7B1673340397154bf22e7bC');
console.log('');

// Format for cast call
const a0 = proof.pi_a[0];
const a1 = proof.pi_a[1];

const b00 = proof.pi_b[0][0];
const b01 = proof.pi_b[0][1];
const b10 = proof.pi_b[1][0];
const b11 = proof.pi_b[1][1];

const c0 = proof.pi_c[0];
const c1 = proof.pi_c[1];

const sig0 = publicSignals[0];
const sig1 = publicSignals[1];
const sig2 = publicSignals[2];
const sig3 = publicSignals[3];

console.log(`cast call 0xd0d98DD0de10F014F7B1673340397154bf22e7bC \\
  "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[4])" \\
  "[${a0},${a1}]" \\
  "[[${b00},${b01}],[${b10},${b11}]]" \\
  "[${c0},${c1}]" \\
  "[${sig0},${sig1},${sig2},${sig3}]" \\
  --rpc-url "https://eth-sepolia.g.alchemy.com/v2/zMK1NP_wwEkwlYF4o3LFn"
`);
