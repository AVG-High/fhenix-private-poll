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
    constructo
