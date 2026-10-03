// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title PrivatePoll
/// @notice One yes/no poll with an encrypted tally and a fixed reveal policy.
/// @dev Addresses, turnout, and transaction timing are public. This contract does
/// not provide personhood, resistance to collusion, or receipt-free voting.
contract PrivatePoll {
    uint64 public immutable closesAt;
    uint32 public immutable minimumTurnout;

    mapping(address => bool) public hasVoted;
    uint32 public turnout;
    euint32 public encryptedYesVotes;

    bool public revealEnabled;
    bool public finalized;
    uint32 public yesVotes;
    uint32 public noVotes;

    error ClosingTimeMustBeFuture();
    error MinimumTurnoutTooSmall();
    error VotingClosed();
    error AlreadyVoted();
    error PollCapacityReached();
    error VotingStillOpen();
    error QuorumNotReached();
    error RevealAlreadyEnabled();
    error RevealNotEnabled();
    error ResultAlreadyPublished();
    error InvalidTally();

    event VoteCast(address indexed voter, uint32 turnout);
    event RevealEnabled(uint32 turnout);
    event ResultPublished(uint32 yesVotes, uint32 noVotes);

    constructor(uint64 closesAt_, uint32 minimumTurnout_) {
        if (closesAt_ <= block.timestamp) revert ClosingTimeMustBeFuture();
        if (minimumTurnout_ < 3) revert MinimumTurnoutTooSmall();

        closesAt = closesAt_;
        minimumTurnout = minimumTurnout_;
        encryptedYesVotes = FHE.asEuint32(0);
        FHE.allowThis(encryptedYesVotes);
    }

    /// @notice Submit one encrypted yes/no choice from the sending address.
    /// @dev The CoFHE proof authenticates the sender, chain, and this contract.
    /// Neither the caller nor the deployer receives permission on the tally.
    function vote(externalEbool encryptedChoice, bytes calldata inputProof) external {
        if (block.timestamp >= closesAt) revert VotingClosed();
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        if (turnout == type(uint32).max) revert PollCapacityReached();

        hasVoted[msg.sender] = true;
        turnout += 1;

        ebool choice = FHE.asEbool(encryptedChoice, inputProof);
        euint32 increment = FHE.select(choice, FHE.asEuint32(1), FHE.asEuint32(0));
        encryptedYesVotes = FHE.add(encryptedYesVotes, increment);
        FHE.allowThis(encryptedYesVotes);

        emit VoteCast(msg.sender, turnout);
    }

    /// @notice After the immutable deadline, make only the final tally public.
    /// @dev If fewer than minimumTurnout addresses voted, release is impossible.
    /// No intermediate tally or individual encrypted input is made public here.
    function enableReveal() external {
        if (block.timestamp < closesAt) revert VotingStillOpen();
        if (turnout < minimumTurnout) revert QuorumNotReached();
        if (revealEnabled) revert RevealAlreadyEnabled();

        revealEnabled = true;
        FHE.allowPublic(encryptedYesVotes);
        emit RevealEnabled(turnout);
    }

    /// @notice Publish the final tally with a valid CoFHE decryption signature.
    /// @dev Permissionless submission is safe because CoFHE authenticates the
    /// exact current handle, chain, type, and disclosed plaintext. The caller
    /// cannot choose a historical handle or submit an unsigned tally.
    function publishResult(uint32 yesVotes_, bytes calldata signature) external {
        if (!revealEnabled) revert RevealNotEnabled();
        if (finalized) revert ResultAlreadyPublished();
        if (yesVotes_ > turnout) revert InvalidTally();

        FHE.publishDecryptResult(encryptedYesVotes, yesVotes_, signature);
        yesVotes = yesVotes_;
        noVotes = turnout - yesVotes_;
        finalized = true;

        emit ResultPublished(yesVotes, noVotes);
    }
}
