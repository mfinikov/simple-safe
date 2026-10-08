// SPDX-License-Identifier: MIT
// Simple Safe: anyone can put ether in, only the owner can take it out.
// Known limit: whoever holds the owner's key is the owner. A stolen key opens the safe.
pragma solidity ^0.8.20;

contract Safe {
    // Stored on the blockchain forever. "public" lets anyone read it.
    address public owner;

    // Runs exactly once, at deploy. Whoever deploys becomes the owner.
    constructor() {
        owner = msg.sender;
    }

    // Anyone may put ether in.
    receive() external payable {}

    function withdraw(uint256 amount) public {
        // The lock: the caller must be the owner, or everything is undone.
        require(msg.sender == owner, "not the owner");
        // Send the ether to the owner; ok is false if the send failed.
        (bool ok, ) = owner.call{value: amount}("");
        require(ok, "send failed");
    }
}
