import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

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
  },
});