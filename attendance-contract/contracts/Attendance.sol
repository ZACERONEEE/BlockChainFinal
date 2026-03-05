// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Attendance {
    struct Record {
        string studentId;
        address student;
        uint256 timestamp;
    }

    Record[] private allRecords;

    // Student ID => already checked in
    mapping(string => bool) private checkedIn;

    event CheckedIn(string studentId, address student, uint256 timestamp);

    function checkIn(string calldata studentId) external {
        require(bytes(studentId).length > 0, "Student ID required");
        require(!checkedIn[studentId], "Already checked in");

        checkedIn[studentId] = true;

        allRecords.push(
            Record({
                studentId: studentId,
                student: msg.sender,
                timestamp: block.timestamp
            })
        );

        emit CheckedIn(studentId, msg.sender, block.timestamp);
    }

    // For your UI: 1 if checked-in, else 0
    function getCheckInCount(string calldata studentId) external view returns (uint256) {
        return checkedIn[studentId] ? 1 : 0;
    }

    function hasCheckedIn(string calldata studentId) external view returns (bool) {
        return checkedIn[studentId];
    }

    function getTotalCheckIns() external view returns (uint256) {
        return allRecords.length;
    }

    // List ALL records (for table + export)
    function getAllCheckIns()
        external
        view
        returns (string[] memory ids, address[] memory students, uint256[] memory timestamps)
    {
        uint256 n = allRecords.length;
        ids = new string[](n);
        students = new address[](n);
        timestamps = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            Record storage r = allRecords[i];
            ids[i] = r.studentId;
            students[i] = r.student;
            timestamps[i] = r.timestamp;
        }
    }
}