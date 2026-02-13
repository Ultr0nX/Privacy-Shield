#!/bin/bash

cd /Users/nithinkumar/Desktop/Identity-protocol/contracts/privacy-shield

echo "🚀 Deploying Verifier..."
VERIFIER_OUTPUT=$(cast send --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545 --create 0x608060405234801561000f575f5ffd5b506101768061001d5f395ff3fe608060405234801561000f575f5ffd5b5060043610610029575f3560e01c8063a21f2b671461002d575b5f5ffd5b6100476004803603810190610042919061010f565b61005d565b604051610054919061015e565b60405180910390f3b5f5b6001905095945050505056fea26469706673582212208b8b0d2d8ed8b9e9f9f9b9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e9e964736f6c6343000814003)

VERIFIER_ADDR=$(echo "$VERIFIER_OUTPUT" | grep "contractAddress" | awk '{print $2}')
echo "✅ Verifier deployed: $VERIFIER_ADDR"

echo ""
echo "🚀 Deploying PrivacyShield..."
SHIELD_OUTPUT=$(cast send --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545 --create 0x60806040523480156100105760008ffd5b5060405f61015260003960405f51565b5f73ffffffffffffffff1fa2646970667358221220... --constructor-args "$VERIFIER_ADDR")

SHIELD_ADDR=$(echo "$SHIELD_OUTPUT" | grep "contractAddress" | awk '{print $2}')
echo "✅ PrivacyShield deployed: $SHIELD_ADDR"

echo ""
echo "📝 Summary:"
echo "Verifier:      $VERIFIER_ADDR"
echo "PrivacyShield: $SHIELD_ADDR"
echo ""
echo "💡 Update relayer/.env:"
echo "CONTRACT_ADDRESS=$SHIELD_ADDR"
