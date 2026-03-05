import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  solidity: {
    version: "0.8.20",
    settings: {
      evmVersion: "paris",
    },
  },
  plugins: [hardhatEthers],
  networks: {
    ganache: {
      type: "http",
      url: "http://127.0.0.1:7545",
      chainId: 1337,
    },

    // ✅ Sepolia testnet (Alchemy)
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "",
      chainId: 11155111,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
});