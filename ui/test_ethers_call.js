const { ethers } = require('ethers');
const fs = require('fs');

// Read CLI proof
const proof = JSON.parse(fs.readFileSync('../circuits/cli_proof.json', 'utf8'));
const publicSignals = JSON.parse(fs.readFileSync('../circuits/cli_public.json', 'utf8'));

const VERIFIER_ABI = [
  "function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[4] calldata _pubSignals) public view returns (bool)"
];

async function testDirectCall() {
  const provider = new ethers.providers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/zMK1NP_wwEkwlYF4o3LFn');
  const verifier = new ethers.Contract('0xd0d98DD0de10F014F7B1673340397154bf22e7bC', VERIFIER_ABI, provider);
  
  // Format proof components - Use ethers.BigNumber for proper encoding
  const toBN = (decStr) => ethers.BigNumber.from(decStr);
  
  const a = [toBN(proof.pi_a[0]), toBN(proof.pi_a[1])];
  const b = [
    [toBN(proof.pi_b[0][0]), toBN(proof.pi_b[0][1])],
    [toBN(proof.pi_b[1][0]), toBN(proof.pi_b[1][1])]
  ];
  const c = [toBN(proof.pi_c[0]), toBN(proof.pi_c[1])];
  const signals = publicSignals.map(toBN);
  
  console.log('🧪 Testing direct ethers.js call to verifier...\n');
  console.log('a[0]:', a[0]);
  console.log('a[1]:', a[1]);
  console.log('signals:', signals);
  console.log('');
  
  try {
    const result = await verifier.verifyProof(a, b, c, signals);
    console.log('✅ Result:', result);
    
    if (result) {
      console.log('\n🎉 SUCCESS! Proof verified using ethers.js');
    } else {
      console.log('\n❌ FAILED! Proof did not verify');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDirectCall();
