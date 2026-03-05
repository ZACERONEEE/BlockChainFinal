import { network } from "hardhat";

async function main() {
  // Connect to the selected network (ganache)
  const { ethers } = await network.connect();

  // Deploy
  const attendance = await ethers.deployContract("Attendance");
  await attendance.waitForDeployment();

  console.log("✅ Attendance deployed to:", await attendance.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});