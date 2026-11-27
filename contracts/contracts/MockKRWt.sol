// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockKRWt
/// @notice Testnet-only mock token. One smallest unit represents one Korean won.
contract MockKRWt is ERC20, Ownable {
    bool public constant TESTNET_ONLY = true;

    constructor(address initialOwner) ERC20("Mock Korean Won Token", "KRWt") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
