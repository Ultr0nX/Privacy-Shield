#!/bin/bash

# Privacy Shield - Contract Deployment Script
# Deploys Verifier and PrivacyShield contracts to local Anvil

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════════"
echo "   🛡️  Privacy Shield - Contract Deployment"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Configuration
RPC_URL="http://127.0.0.1:8545"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

echo "📋 Configuration:"
echo "   RPC URL: $RPC_URL"
echo "   Deployer: $DEPLOYER"
echo ""

# Check if Anvil is running
echo "🔍 Checking if Anvil is running..."
if ! curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' $RPC_URL > /dev/null 2>&1; then
    echo "❌ Error: Anvil is not running on $RPC_URL"
    echo ""
    echo "Please start Anvil in another terminal:"
    echo "   anvil"
    echo ""
    exit 1
fi
echo "✅ Anvil is running"
echo ""

# Step 1: Deploy Verifier
echo "📝 Step 1: Deploying Verifier contract..."
VERIFIER_OUTPUT=$(forge create src/Verifier.sol:Verifier \
    --rpc-url $RPC_URL \
    --private-key $PRIVATE_KEY \
    --json)

VERIFIER_ADDRESS=$(echo $VERIFIER_OUTPUT | jq -r '.deployedTo')

if [ "$VERIFIER_ADDRESS" = "null" ] || [ -z "$VERIFIER_ADDRESS" ]; then
    echo "❌ Failed to deploy Verifier"
    echo "$VERIFIER_OUTPUT"
    exit 1
fi

echo "✅ Verifier deployed at: $VERIFIER_ADDRESS"
echo ""

# Step 2: Deploy PrivacyShield with Verifier address
echo "📝 Step 2: Deploying PrivacyShield contract..."
SHIELD_OUTPUT=$(forge create src/PrivacyShield.sol:PrivacyShield \
    --rpc-url $RPC_URL \
    --private-key $PRIVATE_KEY \
    --constructor-args $VERIFIER_ADDRESS \
    --json)

SHIELD_ADDRESS=$(echo $SHIELD_OUTPUT | jq -r '.deployedTo')

if [ "$SHIELD_ADDRESS" = "null" ] || [ -z "$SHIELD_ADDRESS" ]; then
    echo "❌ Failed to deploy PrivacyShield"
    echo "$SHIELD_OUTPUT"
    exit 1
fi

echo "✅ PrivacyShield deployed at: $SHIELD_ADDRESS"
echo ""

# Step 3: Verify deployment
echo "🧪 Step 3: Verifying deployment..."

# Test Verifier
echo "   Testing Verifier.verifyProof()..."
VERIFY_TEST=$(cast call $VERIFIER_ADDRESS "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[1])" "[1,2]" "[[3,4],[5,6]]" "[7,8]" "[123456]" --rpc-url $RPC_URL)
if [ "$VERIFY_TEST" = "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
    echo "   ✅ Verifier is working (returns true)"
else
    echo "   ⚠️  Verifier returned unexpected value: $VERIFY_TEST"
fi

# Test PrivacyShield
echo "   Testing PrivacyShield.verify()..."
SHIELD_TEST=$(cast call $SHIELD_ADDRESS "verify(uint256[2],uint256[2][2],uint256[2],uint256[1])" "[1,2]" "[[3,4],[5,6]]" "[7,8]" "[123456]" --rpc-url $RPC_URL)
if [ "$SHIELD_TEST" = "0x0000000000000000000000000000000000000000000000000000000000000001" ]; then
    echo "   ✅ PrivacyShield is working (returns true)"
else
    echo "   ⚠️  PrivacyShield returned unexpected value: $SHIELD_TEST"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "   🎉 Deployment Successful!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Contract Addresses:"
echo "   Verifier:      $VERIFIER_ADDRESS"
echo "   PrivacyShield: $SHIELD_ADDRESS"
echo ""
echo "💾 Saving addresses to .env..."

# Create or update .env file
ENV_FILE="../../relayer/.env"
if [ -f "$ENV_FILE" ]; then
    # Update existing .env
    if grep -q "CONTRACT_ADDRESS=" "$ENV_FILE"; then
        # macOS compatible sed
        sed -i '' "s|CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$SHIELD_ADDRESS|g" "$ENV_FILE"
    else
        echo "CONTRACT_ADDRESS=$SHIELD_ADDRESS" >> "$ENV_FILE"
    fi
    echo "✅ Updated $ENV_FILE with new contract address"
else
    echo "⚠️  .env file not found at $ENV_FILE"
fi

echo ""
echo "📝 Next Steps:"
echo "   1. Restart the relayer to use the new contract address"
echo "   2. Test the integration with: curl http://localhost:3001/"
echo ""
echo "🔧 To interact with contracts:"
echo "   # Call verify function"
echo "   cast call $SHIELD_ADDRESS \"verify(uint256[2],uint256[2][2],uint256[2],uint256[1])\" \\"
echo "     \"[1,2]\" \"[[3,4],[5,6]]\" \"[7,8]\" \"[123456]\" --rpc-url $RPC_URL"
echo ""
echo "════════════════════════════════════════════════════════════════"
