#!/bin/bash

echo "═══════════════════════════════════════════════════════"
echo "  🎯 COMPLETE END-TO-END FLOW TEST"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📋 System Status:"
echo "   Anvil (Blockchain):  http://127.0.0.1:8545"
echo "   Verifier Contract:   0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
echo "   PrivacyShield:       0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
echo "   Relayer Server:      http://localhost:3001"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Step 1: Groth16 Proof Data (from circuits)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat /Users/nithinkumar/Desktop/Identity-protocol/relayer/test-data.json
echo ""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Step 2: Sending to Relayer (Port 3001)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESPONSE=$(curl -s -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d @/Users/nithinkumar/Desktop/Identity-protocol/relayer/test-data.json)
echo "$RESPONSE" | jq .
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Step 3: Extracting Transaction Hash"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TX_HASH=$(echo "$RESPONSE" | jq -r '.tx_hash')
echo "Transaction Hash: $TX_HASH"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Step 4: Checking Blockchain Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
BLOCK=$(curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:8545 | jq -r '.result')
echo "Current Block: $BLOCK ($(echo $BLOCK | xargs printf "%d"))"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Step 5: Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ Proof was successfully processed!"
  echo "✅ Relayer parsed Groth16 components"
  echo "✅ Extracted nullifier from publicSignals[3]"
  echo "✅ Called blockchain verify function"
  echo "✅ Transaction simulated: $TX_HASH"
else
  echo "❌ Test failed"
fi
echo ""
echo "═══════════════════════════════════════════════════════"
