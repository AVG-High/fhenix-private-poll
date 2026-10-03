import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
mkdirSync("reports", { recursive: true });
mkdirSync("web/generated", { recursive: true });
writeFileSync("web/generated/verification.json", JSON.stringify({
  checkedAt: new Date().toISOString(), mode: "mock-local", localTestsPassed: false,
  testCount: 0, publicTestnetValidated: false, rewardCreditClaimed: false,
}) + "\n");
const tasks = [
  ["contract-tests", ["scripts/hardhat-local.cjs", "test"]],
  ["tooling-types", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["wallet-artifact", ["scripts/prepare-wallet.mjs"]],
  ["wallet-types", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.web.json", "--noEmit"]],
];
const logs = [];
let passed = true;
let testCount = 0;
for (const [label, args] of tasks) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 180000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  process.stdout.write(output);
  logs.push({ label, exitCode: result.status, output, error: result.error?.message });
  if (label === "contract-tests") testCount = Number(output.match(/(\d+) passing/)?.[1] ?? 0);
  if (result.status !== 0) { passed = false; break; }
}
const hashes = {};
for (const file of ["contracts/PrivatePoll.sol", "test/PrivatePoll.test.ts", "package-lock.json", "web/main.ts", "vite.config.ts", "scripts/serve.mjs"]) {
  hashes[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
}
const summary = {
  checkedAt: new Date().toISOString(),
  mode: "mock-local",
  localTestsPassed: passed && testCount > 0,
  testCount,
  publicTestnetValidated: false,
  rewardCreditClaimed: false,
  nodeVersion: process.version,
  hashes,
};
writeFileSync("reports/verification.json", JSON.stringify({ ...summary, checks: logs }, null, 2) + "\n");
writeFileSync("web/generated/verification.json", JSON.stringify(summary, null, 2) + "\n");
if (!passed || testCount === 0) process.exitCode = 1;
