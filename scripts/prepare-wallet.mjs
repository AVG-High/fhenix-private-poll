import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = JSON.parse(await readFile(path.join(root, "artifacts/contracts/PrivatePoll.sol/PrivatePoll.json"), "utf8"));
const debug = JSON.parse(await readFile(path.join(root, "artifacts/contracts/PrivatePoll.sol/PrivatePoll.dbg.json"), "utf8"));
const buildInfo = JSON.parse(await readFile(path.resolve(root, "artifacts/contracts/PrivatePoll.sol", debug.buildInfo), "utf8"));
const immutableReferences = buildInfo.output.contracts["contracts/PrivatePoll.sol"].PrivatePoll.evm.deployedBytecode.immutableReferences;
if (!artifact.bytecode || artifact.bytecode === "0x") throw new Error("Compile PrivatePoll first.");
await mkdir(path.join(root, "web/generated"), { recursive: true });
try { await access(path.join(root, "web/generated/verification.json")); }
catch { await writeFile(path.join(root, "web/generated/verification.json"), JSON.stringify({
  localTestsPassed: false, testCount: 0, checkedAt: null,
  mode: "mock-local", publicTestnetValidated: false, rewardCreditClaimed: false,
}, null, 2) + "\n"); }
await writeFile(path.join(root, "web/generated/PrivatePoll.json"), JSON.stringify({
  contractName: "PrivatePoll",
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  deployedBytecode: artifact.deployedBytecode,
  immutableReferences,
  generatedAt: new Date().toISOString(),
  allowedChainIds: [11155111, 421614, 84532],
}, null, 2) + "\n");
console.log("Prepared local wallet console artifact. No network transaction was sent.");
