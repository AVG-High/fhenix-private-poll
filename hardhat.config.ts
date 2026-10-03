import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@cofhe/hardhat-plugin";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";

// The compiler is pinned in package-lock.json. No compiler download is required.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async (args, _hre, runSuper) => {
  if (args.solcVersion !== "0.8.28") return runSuper();
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: "0.8.28",
    longVersion: require("solc").version(),
  };
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  defaultNetwork: "hardhat",
  networks: { hardhat: { chainId: 31337, hardfork: "cancun" } },
  cofhe: { logMocks: false },
  mocha: { timeout: 120000 },
};

export default config;
