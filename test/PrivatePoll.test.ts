import { expect } from "chai";
import hre from "hardhat";
import { CofheClient, Encryptable, FheTypes } from "@cofhe/sdk";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("PrivatePoll (CoFHE local mocks)", function () {
  this.timeout(60_000);

  let signers: HardhatEthersSigner[];
  let clients: CofheClient[];
  let poll: any;
  let deadline: number;

  before(async function () {
    signers = (await hre.ethers.getSigners()).slice(0, 5);
    clients = [];
    for (const signer of signers) {
      clients.push(await hre.cofhe.createClientWithBatteries(signer));
    }
  });

  beforeEach(async function () {
    const latest = await hre.ethers.provider.getBlock("latest");
    deadline = latest!.timestamp + 3600;
    poll = await hre.ethers.deployContract("PrivatePoll", [deadline, 3]);
    await poll.waitForDeployment();
  });

  async function encryptedChoice(index: number, choice: boolean, target = poll) {
    return clients[index]
      .encryptInputs([Encryptable.bool(choice)])
      .setConsumingContract(await target.getAddress())
      .execute();
  }

  async function vote(index: number, choice: boolean) {
    const [handle, proof] = await encryptedChoice(index, choice);
    await (await poll.connect(signers[index]).vote(handle, proof)).wait();
  }

  async function reachDeadline() {
    await hre.network.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await hre.network.provider.send("evm_mine");
  }

  async function expectNotAllowed(operation: Promise<unknown>) {
    let failure: unknown;
    try {
      await operation;
    } catch (error) {
      failure = error;
    }
    expect(failure, "unauthorized decryption must reject").not.to.equal(undefined);
    expect(String(failure)).to.match(/NotAllowed|not allowed|ACL|permission/i);
  }

  it("requires a future immutable deadline and a quorum of at least three", async function () {
    const factory = await hre.ethers.getContractFactory("PrivatePoll");
    const latest = await hre.ethers.provider.getBlock("latest");
    await expect(factory.deploy(latest!.timestamp, 3))
      .to.be.revertedWithCustomError(poll, "ClosingTimeMustBeFuture");
    await expect(factory.deploy(deadline, 2))
      .to.be.revertedWithCustomError(poll, "MinimumTurnoutTooSmall");
    expect(await poll.closesAt()).to.equal(BigInt(deadline));
    expect(await poll.minimumTurnout()).to.equal(3n);
    expect(await poll.finalized()).to.equal(false);
  });

  it("allows only one encrypted ballot per address", async function () {
    await vote(1, true);
    const [handle, proof] = await encryptedChoice(1, false);
    await expect(poll.connect(signers[1]).vote(handle, proof))
      .to.be.revertedWithCustomError(poll, "AlreadyVoted");
    expect(await poll.turnout()).to.equal(1n);
    expect(await poll.hasVoted(signers[1].address)).to.equal(true);
    await hre.cofhe.mocks.expectPlaintext(await poll.encryptedYesVotes(), 1n);
  });

  it("never authorizes a deployer, voter, or outsider to decrypt an intermediate tally", async function () {
    await vote(1, true);
    const handle = await poll.encryptedYesVotes();
    const acl = await hre.cofhe.mocks.getMockACL();

    expect(await acl.globalAllowed(handle)).to.equal(false);
    expect(await acl.isAllowed(handle, await poll.getAddress())).to.equal(true);
    for (const index of [0, 1, 4]) {
      expect(await acl.isAllowed(handle, signers[index].address)).to.equal(false);
      await expectNotAllowed(clients[index].decryptForView(handle, FheTypes.Uint32).execute());
    }
    await expectNotAllowed(clients[4].decryptForTx(handle).withoutACP().execute());
  });

  it("prevents an early reveal even when quorum has already been reached", async function () {
    await vote(1, true);
    await vote(2, false);
    await vote(3, true);
    await expect(poll.enableReveal())
      .to.be.revertedWithCustomError(poll, "VotingStillOpen");
    await expect(poll.publishResult(2, "0x"))
      .to.be.revertedWithCustomError(poll, "RevealNotEnabled");
    expect(await poll.revealEnabled()).to.equal(false);
  });

  it("rejects voting at the exact closing timestamp", async function () {
    const [handle, proof] = await encryptedChoice(1, true);
    await hre.network.provider.send("evm_setNextBlockTimestamp", [deadline]);
    await expect(poll.connect(signers[1]).vote(handle, proof))
      .to.be.revertedWithCustomError(poll, "VotingClosed");
    expect(await poll.turnout()).to.equal(0n);
    expect(await poll.hasVoted(signers[1].address)).to.equal(false);
  });

  it("leaves a poll permanently sealed when its deadline passes without quorum", async function () {
    await vote(1, true);
    await vote(2, false);
    const handle = await poll.encryptedYesVotes();
    await reachDeadline();
    await expect(poll.connect(signers[4]).enableReveal())
      .to.be.revertedWithCustomError(poll, "QuorumNotReached");
    await expect(poll.publishResult(1, "0x"))
      .to.be.revertedWithCustomError(poll, "RevealNotEnabled");
    const acl = await hre.cofhe.mocks.getMockACL();
    expect(await acl.globalAllowed(handle)).to.equal(false);
    await expectNotAllowed(clients[4].decryptForTx(handle).withoutACP().execute());
    expect(await poll.finalized()).to.equal(false);
  });

  for (const [label, choices, expectedYes] of [
    ["mixed", [true, false, true], 2n],
    ["all no", [false, false, false], 0n],
    ["all yes", [true, true, true], 3n],
  ] as const) {
    it(`publishes an authenticated ${label} result only after closing`, async function () {
      const historicalHandles: string[] = [];
      for (let i = 0; i < choices.length; i++) {
        await vote(i + 1, choices[i]);
        historicalHandles.push(await poll.encryptedYesVotes());
      }
      await reachDeadline();
      await (await poll.connect(signers[4]).enableReveal()).wait();

      const finalHandle = await poll.encryptedYesVotes();
      const acl = await hre.cofhe.mocks.getMockACL();
      expect(await acl.globalAllowed(finalHandle)).to.equal(true);
      for (const historicalHandle of historicalHandles.slice(0, -1)) {
        expect(await acl.globalAllowed(historicalHandle)).to.equal(false);
      }

      const result = await clients[4].decryptForTx(finalHandle).withoutACP().execute();
      expect(result.decryptedValue).to.equal(expectedYes);
      await expect(poll.connect(signers[4]).publishResult(result.decryptedValue, result.signature))
        .to.emit(poll, "ResultPublished")
        .withArgs(expectedYes, 3n - expectedYes);
      expect(await poll.finalized()).to.equal(true);
      expect(await poll.yesVotes()).to.equal(expectedYes);
      expect(await poll.noVotes()).to.equal(3n - expectedYes);
      await expect(poll.publishResult(result.decryptedValue, result.signature))
        .to.be.revertedWithCustomError(poll, "ResultAlreadyPublished");
      await expect(poll.enableReveal())
        .to.be.revertedWithCustomError(poll, "RevealAlreadyEnabled");
    });
  }

  it("rejects malformed input proofs without consuming the voter's slot", async function () {
    await expect(poll.connect(signers[1]).vote(hre.ethers.ZeroHash, "0x")).to.be.reverted;
    expect(await poll.hasVoted(signers[1].address)).to.equal(false);
    expect(await poll.turnout()).to.equal(0n);
    await vote(1, false);
    expect(await poll.turnout()).to.equal(1n);
  });

  it("binds an encrypted input to its sender and consuming contract", async function () {
    const [handle, proof] = await encryptedChoice(1, true);
    await expect(poll.connect(signers[2]).vote(handle, proof)).to.be.reverted;
    const otherPoll: any = await hre.ethers.deployContract("PrivatePoll", [deadline, 3]);
    await otherPoll.waitForDeployment();
    await expect(otherPoll.connect(signers[1]).vote(handle, proof)).to.be.reverted;
    expect(await poll.turnout()).to.equal(0n);
    expect(await otherPoll.turnout()).to.equal(0n);
  });

  it("rejects forged, altered, and out-of-range published tallies", async function () {
    await vote(1, true);
    await vote(2, false);
    await vote(3, true);
    await reachDeadline();
    await (await poll.enableReveal()).wait();
    const result = await clients[4]
      .decryptForTx(await poll.encryptedYesVotes())
      .withoutACP()
      .execute();

    await expect(poll.publishResult(2, "0x")).to.be.reverted;
    await expect(poll.publishResult(1, result.signature)).to.be.reverted;
    await expect(poll.publishResult(4, result.signature))
      .to.be.revertedWithCustomError(poll, "InvalidTally");
    expect(await poll.finalized()).to.equal(false);
    await (await poll.publishResult(result.decryptedValue, result.signature)).wait();
    expect(await poll.yesVotes()).to.equal(2n);
  });
});
