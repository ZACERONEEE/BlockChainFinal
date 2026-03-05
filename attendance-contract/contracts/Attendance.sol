// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Attendance {
    struct CheckIn {
        address student;
        uint256 timestamp;
    }

    mapping(string => CheckIn[]) private records;

    event CheckedIn(string studentId, address student, uint256 timestamp);

    function checkIn(string calldata studentId) external {
        require(bytes(studentId).length > 0, "Student ID required");

        records[studentId].push(CheckIn({
            student: msg.sender,
            timestamp: block.timestamp
        }));

        emit CheckedIn(studentId, msg.sender, block.timestamp);
    }

    function getCheckInCount(string calldata studentId)
        external
        view
        returns (uint256)
    {
        return records[studentId].length;
    }
}