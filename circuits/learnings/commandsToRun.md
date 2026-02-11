1. npm init -y
2. npm install circomlib
3. circom privacy.circom --r1cs --wasm -l node_modules

// trusted setup (groth 16)
-> Start powers of tau

4. snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
5. snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v
6. snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v

->generate proving key 

7. snarkjs groth16 setup privacy.r1cs pot12_final.ptau privacy_0000.zkey
8. snarkjs zkey contribute privacy_0000.zkey privacyy_final.zkey --name="Second contribution" -v

-> export verification key ( for the contract )

9.snarkjs zkey export verificationkey identity_final.zkey verification_key.json

10. snarkjs zkey export solidityverifier privacyy_final.zkey verifier.sol