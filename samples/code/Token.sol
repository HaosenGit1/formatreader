// Solidity sample (opens as plain text — no colours yet)
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;
    function increment() external { count += 1; }
}
