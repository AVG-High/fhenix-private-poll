import { createPublicClient, http, isAddress, keccak256, parseAbi, zeroAddress, formatEther } from "viem";
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const source = readFileSync("node_modules/@fhenixprotocol/cofhe-contracts/FHE.sol", "utf8");
const taskManager = source.match(/address constant TASK_MANAGER_ADDRESS = (0x[a-fA-F0-9]{40});/)?.[1];
if (!taskManager) throw new Error("Cannot derive TaskManager address from installed Fhenix contract library.");
const walletArg = process.argv.find((v) => v.startsWith("--address="))?.slice(10);
if (walletArg && !isAddress(walletArg)) throw new Error("--address requires a public 0x wallet address, never a private key.");
const results = await Promise.all([arbitrumSepolia, baseSepolia, sepolia].map(async (chain) => {
  const client = createPublicClient({ chain, transport: http(undefined, { timeout: 15000, retryCount: 0 }) });
  const result = { name: chain.name, expectedChainId: chain.id, rpc: chain.rpcUrls.default.http[0], taskManager, ready: false };
  try {
    const actualChainId = await client.getChainId();
    if (actualChainId !== chain.id) throw new Error(`Wrong RPC chain: ${actualChainId}`);
    const [code, blockNumber] = await Promise.all([client.getCode({ address: taskManager }), client.getBlockNumber()]);
    if (!code || code === "0x") throw new Error("No CoFHE TaskManager code at the expected address.");
    result.blockNumber = blockNumber.toString();
    result.taskManagerCodeHash = keccak256(code);
    result.decryptResultSigner = await client.readContract({
      address: taskManager,
      abi: parseAbi(["function decryptResultSigner() view returns (address)"]),
      functionName: "decryptResultSigner",
    });
    if (result.decryptResultSigner === zeroAddress) throw new Error("TaskManager decryption signer is zero; do not deploy with this setup.");
    if (walletArg) {
      result.publicWallet = walletArg;
      result.testEthBalance = formatEther(await client.getBalance({ address: walletArg }));
    }
    result.ready = true;
    result.limit = "RPC and decryption signer checks only; no live FHE round-trip or independent verifier validation.";
  } catch (error) {
    result.error = error.shortMessage ?? error.message ?? String(error);
  }
  return result;
}));
const report = { checkedAt: new Date().toISOString(), readOnly: true, publicTestnetValidated: false, results };
mkdirSync("reports", { recursive: true });
writeFileSync("reports/testnet-preflight.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!results.some((r) => r.ready)) process.exitCode = 1;
