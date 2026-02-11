**Role of this module**

- UI part contains :
    - secretId -> private input 
    - user_wallet -> public input 
    - app_address -> public input 
    - nullifier -> public input 
    (nullifier is computed as  : `Poseidon(secretId, app_address, user_wallet)`)
- From this module `.wasm and .zkey` goes into the UI 
- Witness generation :
    - The UI provides the inputs to `.wasm` files :
        - **Private input:** `secretId`
        - **Public inputs:** `app_address`, `user_wallet`, `nullifier`.

        ( the circuit enforces `Poseidon(secretId, app_address, user_wallet) == nullifier`)

- Proof Generation (Groth16)
   - The UI (acting as the prover) uses:
     - the witness
     - the `.zkey` proving key
   - to generate a zk-SNARK proof (`proof.json`) and public inputs (`public.json`).


