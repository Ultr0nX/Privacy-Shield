// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/Verifier.sol";
import "../src/PrivacyShield.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Verifier
        Verifier verifier = new Verifier();
        console.log("Verifier deployed at:", address(verifier));
        
        // Deploy PrivacyShield
        PrivacyShield shield = new PrivacyShield(address(verifier));
        console.log("PrivacyShield deployed at:", address(shield));
        
        vm.stopBroadcast();
    }
}
