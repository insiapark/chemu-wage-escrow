// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DailyWageEscrow
/// @notice Locks a confirmed daily wage and lets anyone release it to the worker on payday.
/// @dev Both employer and worker sign the same EIP-712 WorkRecord before funds are locked.
contract DailyWageEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant WORK_RECORD_TYPEHASH = keccak256(
        "WorkRecord(address employer,address employee,uint256 grossWage,uint64 payday,bytes32 workRecordHash,uint256 nonce)"
    );

    struct WorkRecord {
        address employer;
        address employee;
        uint256 grossWage;
        uint64 payday;
        bytes32 workRecordHash;
        uint256 nonce;
    }

    struct LockedWage {
        address employer;
        address employee;
        uint256 amount;
        uint64 payday;
        bool released;
    }

    IERC20 public immutable wageToken;

    mapping(address employer => uint256 amount) public availableBalance;
    mapping(address employer => mapping(address employee => uint256 nonce)) public nextNonce;
    mapping(bytes32 recordId => LockedWage wage) public lockedWages;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidPayday();
    error InvalidNonce(uint256 expected, uint256 received);
    error InvalidEmployerSignature();
    error InvalidEmployeeSignature();
    error InsufficientAvailableBalance(uint256 available, uint256 required);
    error AlreadyLocked(bytes32 recordId);
    error WageNotFound(bytes32 recordId);
    error PaydayNotReached(uint64 payday);
    error AlreadyReleased(bytes32 recordId);

    event Funded(address indexed employer, uint256 amount, uint256 availableAfter);
    event WageLocked(
        bytes32 indexed recordId,
        address indexed employer,
        address indexed employee,
        uint256 amount,
        uint64 payday,
        bytes32 workRecordHash
    );
    event WageReleased(bytes32 indexed recordId, address indexed employee, uint256 amount);

    constructor(IERC20 token) EIP712("ChemU Daily Wage Escrow", "1") {
        if (address(token) == address(0)) revert ZeroAddress();
        wageToken = token;
    }

    /// @notice Adds employer-owned funds that can later be locked for confirmed work.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        availableBalance[msg.sender] += amount;
        wageToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, availableBalance[msg.sender]);
    }

    /// @notice Confirms a co-signed work record and irrevocably locks its wage until payday.
    function confirmAndLock(
        WorkRecord calldata record,
        bytes calldata employerSignature,
        bytes calldata employeeSignature
    ) external nonReentrant returns (bytes32 recordId) {
        if (record.employer == address(0) || record.employee == address(0)) revert ZeroAddress();
        if (record.grossWage == 0) revert ZeroAmount();
        if (record.payday <= block.timestamp) revert InvalidPayday();

        uint256 expectedNonce = nextNonce[record.employer][record.employee];
        if (record.nonce != expectedNonce) revert InvalidNonce(expectedNonce, record.nonce);

        bytes32 structHash = hashWorkRecord(record);
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignatureNow(record.employer, digest, employerSignature)) {
            revert InvalidEmployerSignature();
        }
        if (!SignatureChecker.isValidSignatureNow(record.employee, digest, employeeSignature)) {
            revert InvalidEmployeeSignature();
        }

        recordId = digest;
        if (lockedWages[recordId].employer != address(0)) revert AlreadyLocked(recordId);

        uint256 available = availableBalance[record.employer];
        if (available < record.grossWage) {
            revert InsufficientAvailableBalance(available, record.grossWage);
        }

        availableBalance[record.employer] = available - record.grossWage;
        nextNonce[record.employer][record.employee] = expectedNonce + 1;
        lockedWages[recordId] = LockedWage({
            employer: record.employer,
            employee: record.employee,
            amount: record.grossWage,
            payday: record.payday,
            released: false
        });

        emit WageLocked(
            recordId,
            record.employer,
            record.employee,
            record.grossWage,
            record.payday,
            record.workRecordHash
        );
    }

    /// @notice Releases a locked wage after payday. Anyone may trigger; funds always go to the employee.
    function release(bytes32 recordId) external nonReentrant {
        LockedWage storage wage = lockedWages[recordId];
        if (wage.employer == address(0)) revert WageNotFound(recordId);
        if (wage.released) revert AlreadyReleased(recordId);
        if (block.timestamp < wage.payday) revert PaydayNotReached(wage.payday);

        wage.released = true;
        wageToken.safeTransfer(wage.employee, wage.amount);
        emit WageReleased(recordId, wage.employee, wage.amount);
    }

    function hashWorkRecord(WorkRecord calldata record) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                WORK_RECORD_TYPEHASH,
                record.employer,
                record.employee,
                record.grossWage,
                record.payday,
                record.workRecordHash,
                record.nonce
            )
        );
    }
}
