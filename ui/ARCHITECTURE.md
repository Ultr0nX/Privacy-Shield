# Modular Code Architecture

This document explains the refactored code structure for better team collaboration and maintainability.

## 📁 Project Structure

```
ui/src/
├── components/           # Reusable UI Components
│   ├── FaceScanner.jsx           # MediaPipe face scanning component
│   └── VerificationCard.jsx      # Verification UI card
│
├── hooks/                # Custom React Hooks (Business Logic)
│   ├── useBiometric.js           # Face scanning & identity generation
│   ├── useWallet.js              # Wallet connection management
│   └── useRegistration.js        # Identity registration flow
│
├── services/             # API & External Services
│   ├── relayerService.js         # Relayer backend API calls
│   └── proofService.js           # ZK proof generation & formatting
│
├── utils/                # Pure Utility Functions
│   ├── crypto.js                 # Poseidon hashing, quantization
│   ├── wallet.js                 # Wallet connection utilities
│   ├── contract.js               # Smart contract interactions
│   └── validators.js             # Face quality validation
│
└── App.js                # Main Application (orchestrates components)
```

## 🎯 Key Improvements

### 1. **Face Validation** (`utils/validators.js`)
- ✅ Detects actual human faces vs objects/photos
- ✅ Checks face size, orientation, and centering
- ✅ Basic liveness detection (eyes open, 3D depth)
- ✅ Real-time quality feedback with scores

**Functions:**
- `validateFaceQuality(landmarks, width, height)` - Full validation with detailed metrics
- `quickValidateFace(landmarks)` - Fast validation for real-time feedback

### 2. **Custom Hooks** (Separation of Concerns)

#### `useBiometric(scanThreshold)`
Handles all biometric processing logic:
- Face landmark processing
- Quality validation
- Identity generation (secretId & commitment)
- Progress tracking

**Exports:**
```javascript
{
  secretId,          // Private biometric secret
  commitment,        // Public identity commitment
  progress,          // Scan progress (0-100)
  status,            // Current status message
  verified,          // Whether scan is complete
  processLandmarks,  // Function to process face data
  reset,             // Reset biometric state
  validFrames        // Number of high-quality frames captured
}
```

#### `useWallet()`
Manages wallet connection:
- Connection state
- Account address
- Signer instance
- Error handling

**Exports:**
```javascript
{
  account,         // Connected wallet address
  signer,          // Ethers.js signer
  connecting,      // Connection in progress
  error,           // Error message if any
  connect,         // Function to connect wallet
  disconnect,      // Function to disconnect
  isConnected      // Boolean connection status
}
```

#### `useRegistration(commitment)`
Handles identity registration:
- Check registration status
- Register new identity
- Track transaction status

**Exports:**
```javascript
{
  isRegistered,    // Whether identity is registered
  checking,        // Checking status in progress
  registering,     // Registration in progress
  txHash,          // Transaction hash
  error,           // Error message if any
  checkStatus,     // Function to check registration
  register         // Function to register identity
}
```

### 3. **Service Layer** (API Abstraction)

#### `relayerService.js`
All relayer API calls in one place:
- `checkRegistration(commitment)` - Check if identity is registered
- `registerIdentity(commitment)` - Register new identity
- `submitProof(proof, publicSignals)` - Submit ZK proof for verification

**Benefits:**
- Easy to change relayer URL (one place)
- Consistent error handling
- Easy to mock for testing

#### `proofService.js`
ZK proof generation utilities:
- `generateProof(inputs)` - Generate ZK proof with SnarkJS
- `formatProofForChain(proof, signals)` - Convert to hex format
- `calculateNullifier(secretId, app, wallet)` - Calculate nullifier
- `prepareCircuitInputs(...)` - Prepare inputs for circuit

**Benefits:**
- Isolates complex proof logic
- Easy to unit test
- Reusable across different components

## 🔧 How to Use

### Example: Adding a New Feature

**Scenario:** Add a "Save Identity" feature

1. **Create Service** (`services/storageService.js`):
```javascript
export const saveIdentity = (secretId, commitment) => {
  localStorage.setItem('identity', JSON.stringify({ secretId, commitment }));
};

export const loadIdentity = () => {
  const data = localStorage.getItem('identity');
  return data ? JSON.parse(data) : null;
};
```

2. **Create Hook** (`hooks/useIdentityStorage.js`):
```javascript
export const useIdentityStorage = () => {
  const [stored, setStored] = useState(null);
  
  useEffect(() => {
    setStored(loadIdentity());
  }, []);
  
  const save = (secretId, commitment) => {
    saveIdentity(secretId, commitment);
    setStored({ secretId, commitment });
  };
  
  return { stored, save };
};
```

3. **Use in App.js**:
```javascript
const storage = useIdentityStorage();

// When identity is generated:
if (biometric.verified && !storage.stored) {
  storage.save(biometric.secretId, biometric.commitment);
}
```

## 📝 Code Style Guidelines

### Naming Conventions
- **Components**: PascalCase (`FaceScanner.jsx`)
- **Hooks**: camelCase with "use" prefix (`useBiometric.js`)
- **Services**: camelCase with descriptive suffix (`relayerService.js`)
- **Utils**: camelCase (`validators.js`)

### File Organization
- One export per service file (clear responsibility)
- Group related functions in utils
- Keep hooks focused on single concern
- Components should be presentational when possible

### Error Handling
- Services throw errors with descriptive messages
- Hooks catch and expose errors as state
- App.js shows errors to users via alerts/UI

## 🚀 Benefits of This Structure

1. **Easier onboarding** - New team members can find code quickly
2. **Better testing** - Each layer can be tested independently
3. **Reusability** - Hooks and services can be used in multiple components
4. **Maintainability** - Changes are localized to specific files
5. **Scalability** - Easy to add new features without cluttering App.js

## 🔍 Face Validation Details

### Quality Checks:
1. **Face Size** - Must be 5-70% of frame
2. **Orientation** - Yaw < 30°, Pitch < 25°, Roll < 20°
3. **Depth Variance** - Must be > 0.0005 (anti-spoofing)
4. **Eyes Open** - Eye Aspect Ratio > 0.15
5. **Centering** - Face must be centered in frame

### Quality Score:
- Starts at 100
- Deductions for each issue
- Must score >= 60 to be accepted
- Only high-quality frames (>75) are used for identity generation

### Real-time Feedback:
```
✅ Capturing... 15 valid frames (Quality: 82%)
⚠️ Face too far from camera
⚠️ Face turned horizontally
⚠️ Possible 2D photo detected
```

## 📊 Data Flow

```
User Action
    ↓
App.js (UI Layer)
    ↓
Custom Hooks (Business Logic)
    ↓
Services (API/External)
    ↓
Utils (Pure Functions)
```

Example verification flow:
1. User clicks "Verify Identity"
2. App.js calls `handleFullVerification()`
3. Hook calculates nullifier via `proofService.calculateNullifier()`
4. Service generates proof via `proofService.generateProof()`
5. Service submits via `relayerService.submitProof()`
6. App.js shows result in modal

## 🛠️ Development Tips

- **Debug services**: Check browser console for detailed logs
- **Test hooks**: Use React DevTools to inspect hook state
- **Mock services**: Create mock versions for offline development
- **Add features**: Start with service → hook → UI

## 📞 Team Communication

When working on features:
1. **Services** - Backend team handles relayer changes
2. **Hooks** - Frontend team handles business logic
3. **Components** - UI/UX team handles presentation
4. **Utils** - Shared by all teams

Clear boundaries = Less merge conflicts!
