const fs = require('fs');
const http = require('http');

// Read CLI-generated proof
const proof = JSON.parse(fs.readFileSync('./cli_proof.json', 'utf8'));
const publicSignals = JSON.parse(fs.readFileSync('./cli_public.json', 'utf8'));

console.log('📋 CLI Proof Data:');
console.log('  pi_a:', proof.pi_a.slice(0, 2));
console.log('  pi_b:', proof.pi_b);
console.log('  pi_c:', proof.pi_c.slice(0, 2));
console.log('\n📊 Public Signals:', publicSignals);

// Prepare request payload
const payload = JSON.stringify({
  proof: {
    pi_a: proof.pi_a,
    pi_b: proof.pi_b,
    pi_c: proof.pi_c,
    protocol: proof.protocol,
    curve: proof.curve
  },
  publicSignals: publicSignals
});

console.log('\n🚀 Submitting CLI-generated proof to relayer...\n');

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
        console.log('\n✅ CLI proof SUCCEEDED on-chain!');
        console.log('This means the issue is with browser SnarkJS proof generation.');
      } else {
        console.log('\n❌ CLI proof FAILED on-chain too.');
        console.log('This means the issue is with circuit/verification keys, not browser.');
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
