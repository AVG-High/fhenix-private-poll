import hre from "hardhat";
import { Encryptable } from "@cofhe/sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (hre.network.name !== "hardhat" || network.chainId !== 31337n) {
    throw new Error("This automated multi-signer demonstration is LOCAL MOCK ONLY.");
  }
  await hre.cofhe.mocks.deployMocks();
  const signers = (await hre.ethers.getSigners()).slice(0, 4);
  const block = await hre.ethers.provider.getBlock("latest");
  const closesAt = block!.timestamp + 600;
  const poll: any = await hre.ethers.deployContract("PrivatePoll", [closesAt, 3]);
  await poll.waitForDeployment();
  const address = await poll.getAddress();
  const actions: Array<{ action: string; hash: string }> = [];
  actions.push({ action: "local deploy", hash: poll.deploymentTransaction()!.hash });

  for (const [index, choice] of [true, false, true].entries()) {
    const client = await hre.cofhe.createClientWithBatteries(signers[index]);
    const [handle, proof] = await client.encryptInputs([Encryptable.bool(choice)])
      .setConsumingContract(address).execute();
    const tx = await poll.connect(signers[index]).vote(handle, proof);
    await tx.wait();
    actions.push({ action: `local test ballot ${index + 1}`, hash: tx.hash });
  }
  const acl = await hre.cofhe.mocks.getMockACL();
  const finalHandle = await poll.encryptedYesVotes();
  assert.equal(await acl.globalAllowed(finalHandle), false);

  // Time travel exists only inside this isolated in-process development chain.
  await hre.network.provider.send("evm_setNextBlockTimestamp", [closesAt]);
  await hre.network.provider.send("evm_mine");
  const reveal = await poll.enableReveal();
  await reveal.wait();
  actions.push({ action: "local enable reveal", hash: reveal.hash });
  const observer = await hre.cofhe.createClientWithBatteries(signers[3]);
  const result = await observer.decryptForTx(finalHandle).withoutACP().execute();
  const publish = await poll.publishResult(result.decryptedValue, result.signature);
  await publish.wait();
  actions.push({ action: "local publish verified result", hash: publish.hash });
  assert.equal(await poll.yesVotes(), 2n);
  assert.equal(await poll.noVotes(), 1n);

  const report = {
    checkedAt: new Date().toISOString(),
    mode: "mock-local",
    chainId: 31337,
    publicTestnetValidated: false,
    rewardCreditClaimed: false,
    note: "Ephemeral Hardhat mock simulation. No real FHE security or public contribution credit is established.",
    localContract: address,
    yesVotes: 2,
    noVotes: 1,
    aggregateWasPrivateBeforeClose: true,
    transactions: actions,
  };
  await mkdir("reports", { recursive: true });
  await writeFile("reports/local-demo.json", JSON.stringify(report, null, 2) + "\n");
  console.log("LOCAL MOCK ONLY: 3 encrypted test ballots -> verified aggregate YES 2 / NO 1.");
  console.log("Saved reports/local-demo.json. Public testnet deployment: NOT performed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
