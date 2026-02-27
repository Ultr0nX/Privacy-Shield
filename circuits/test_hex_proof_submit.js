const fs = require('fs');
const http = require('http');

// Read CLI-generated proof
const proof = JSON.parse(fs.readFileSync('./cli_proof.json', 'utf8'));
const publicSignals = JSON.parse(fs.readFileSync('./cli_public.json', 'utf8'));

// Convert to hex strings (32-byte padded)
const toHex = (val) => '0x' + BigInt(val).toString(16).padStart(64, '0');

// IMPORTANT: pi_b sub-arrays need to be reversed for Solidity (G2 point encoding)
const proofHex = {
  pi_a: proof.pi_a.slice(0, 2).map(toHex),
  pi_b: proof.pi_b.slice(0, 2).map(row => row.slice(0, 2).reverse().map(toHex)),
  pi_c: proof.pi_c.slice(0, 2).map(toHex),
  protocol: proof.protocol,
  curve: proof.curve
};
const publicSignalsHex = publicSignals.map(toHex);

console.log('📋 CLI Proof Data (HEX ENCODED):');
console.log('  pi_a:', proofHex.pi_a);
console.log('  pi_b[0]:', proofHex.pi_b[0]);
console.log('  pi_b[1]:', proofHex.pi_b[1]);
console.log('  pi_c:', proofHex.pi_c);
console.log('\n📊 Public Signals (HEX):', publicSignalsHex);

// Prepare request payload
const payload = JSON.stringify({
  proof: proofHex,
  publicSignals: publicSignalsHex
});

console.log('\n🚀 Submitting HEX-encoded proof to relayer...\n');

// Send to relayer
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/relay',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📬 Relayer Response:');
    console.log('Status:', res.statusCode);
    try {
      const response = JSON.parse(data);
      console.log(JSON.stringify(response, null, 2));
      
      if (response.success) {
        console.log('\n✅✅✅ HEX-ENCODED PROOF SUCCEEDED ON-CHAIN! ✅✅✅');
        console.log('🎉 THE FIX WORKS! Transaction hash:', response.tx_hash);
        console.log('\n💡 The issue was decimal string encoding in ethers.js/ethers-rs.');
        console.log('💡 Solution: Convert all proof values to hex strings before transmission.');
      } else {
        console.log('\n❌ Proof still failed.');
        console.log('Error:', response.message);
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
});

req.write(payload);
req.end();
