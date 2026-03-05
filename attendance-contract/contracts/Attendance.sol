// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Attendance {
    address public admin;
    uint256 public currentSessionId;

    struct CheckIn {
        address student;
        uint256 timestamp;
        string studentId;
    }

    // sessionId => list of check-ins
    mapping(uint256 => CheckIn[]) private sessionRecords;

    // sessionId => studentId => checkedIn
    mapping(uint256 => mapping(string => bool)) private checkedIn;

    event SessionStarted(uint256 sessionId, address admin, uint256 timestamp);
    event CheckedIn(uint256 sessionId, string studentId, address student, uint256 timestamp);

    constructor() {
        admin = msg.sender; // ✅ teacher = deployer wallet
        currentSessionId = 0;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can do this");
        _;
    }

    // ✅ Teacher starts a new session (resets attendance for a new class)
    function startSession() external onlyAdmin {
        currentSessionId += 1;
        emit SessionStarted(currentSessionId, msg.sender, block.timestamp);
    }

    // ✅ Students check-in for the current session
    function checkIn(string calldata studentId) external {
        require(currentSessionId > 0, "Session not started");
        require(bytes(studentId).length > 0, "Student ID required");
        require(!checkedIn[currentSessionId][studentId], "Already checked in");

        checkedIn[currentSessionId][studentId] = true;

        sessionRecords[currentSessionId].push(
            CheckIn({
                student: msg.sender,
                timestamp: block.timestamp,
                studentId: studentId
            })
        );

        emit CheckedIn(currentSessionId, studentId, msg.sender, block.timestamp);
    }

    function getSessionCount(uint256 sessionId) external view returns (uint256) {
        return sessionRecords[sessionId].length;
    }

    function hasCheckedIn(uint256 sessionId, string calldata studentId) external view returns (bool) {
        return checkedIn[sessionId][studentId];
    }
}