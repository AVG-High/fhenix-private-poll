# PrivatePoll — a CoFHE testnet reference implementation

An independent, AI-assisted contribution by **AVG-High**. This is not an official Fhenix product and does not promise tokens, points, grants, or an airdrop.

PrivatePoll demonstrates a common privacy mistake and its fix: an encrypted poll must not grant its administrator or voters access to a running tally. Otherwise consecutive decryptions can reveal individual votes. This implementation keeps the tally accessible only to the contract until a fixed deadline and a minimum turnout are met.

## What is implemented

- One encrypted yes/no ballot per address, using CoFHE `externalEbool` inputs and a proof bound to the sender and consuming contract.
- A fixed closing time and quorum of at least three addresses. The creator has no privileged early-reveal or parameter-editing method.
- Encrypted addition of 0/1 contributions; no caller permission on the running tally.
- Permissionless final release after the deadline and quorum. Earlier tally handles remain private.
- Publication of the final count only with a CoFHE-authenticated decryption result.
- A local Korean wallet console to deploy, submit an encrypted vote, release a completed poll, publish the result, and export public transaction evidence.
- Testnet allowlisting, revalidation of the wallet account/network before writes, and no token approvals, ETH value transfer, backend signer, or seed-phrase input.

## Verification and honest status

`npm run verify` writes `reports/verification.json` with the actual test count, timestamp, command results, and source SHA-256 digests. `npm run demo` writes a separate **local-only** three-ballot demonstration.

Local mocks validate contract behavior, ACL wiring, proof binding, and decryption-signature use. They store plaintext and use mock cryptography. Passing them **does not establish live FHE correctness, public testnet compatibility, deployment, or contribution credit**.

Public testnet deployment has not been performed as part of the initial local validation. `reports/testnet-preflight.json`, when present, is a read-only connectivity/infrastructure check, not a successful deployment. The wallet console records live actions separately.

## Run locally

Use Node.js 24 and npm. Exact dependency versions are pinned in `package-lock.json`.

```bash
npm ci --ignore-scripts
npm test
npm run prepare:wallet
npm run verify
npm run demo
npm run build
npm start
```

The Solidity compiler is the pinned local `solc@0.8.28`, targeting Cancun. Hardhat configuration and caches are kept in `.local-runtime/`. No personal wallet key is needed for tests.

Open http://127.0.0.1:4173 in a browser where your wallet is already installed. The UI does not install a wallet or ask for a private key. If no injected wallet is available, transaction controls remain unavailable. `npm run dev` is available for development with Vite; the compiled `npm start` path avoids development bundler restrictions in sandboxed Windows environments.

## Public testnet workflow

1. Connect the intended contribution wallet to the official [Fhenix Loyalty Program](https://analytics.fhenix.io/loyalty) yourself and inspect the currently available tasks. Link GitHub only if the portal offers that flow. Do not assume local tests count as points.
2. Obtain valueless faucet ETH through a provider linked in the [official network documentation](https://cofhe-docs.fhenix.zone/get-started/introduction/networks). No purchase or mainnet bridge is required by this project.
3. Run `npm run preflight`. This only reads public RPC data, expected TaskManager code, and its decryption signer. It does not prove the full encryption/decryption path works.
4. In the wallet console, choose a supported testnet, inspect the operation, and sign the deployment with your own wallet. The default is Arbitrum Sepolia. Pick a deadline that leaves enough time for real participants.
5. Share the deployed poll address and chain with genuinely interested testers. Each participant submits their own ballot. Do not manufacture multiple identities or pretend local test accounts are users.
6. After the deadline, anyone can enable the final release if turnout reaches the quorum, obtain the authenticated result, and publish it.
7. Export the real transaction evidence and document issues or UX findings. Record actual user feedback without inventing traction or reward eligibility.

Supported chains: Ethereum Sepolia **11155111**, Arbitrum Sepolia **421614**, Base Sepolia **84532**. Mainnet and local development wallets are not enabled in the browser console.

## Privacy limits

This is a development example, not an audited election system. Addresses, participation, timing, gas usage, and turnout are public. One wallet is not one person. The final aggregate is intentionally public. Unanimous outcomes reveal all choices, and colluding voters may infer another participant's choice. A quorum of three is a minimum release policy, **not a mathematical anonymity guarantee**. Coercion resistance, receipt-free voting, and Sybil resistance are out of scope.

CoFHE infrastructure and service availability remain dependencies. The live network's proof verifier and decryption configuration require validation before relying on confidentiality. Never put sensitive real votes or valuable assets into this testnet example.

## Files

- `contracts/PrivatePoll.sol`: the poll contract.
- `test/PrivatePoll.test.ts`: regression and permission tests.
- `web/`: local wallet console; generated artifacts are built from source.
- `scripts/demo.ts`: local mock scenario, refuses non-Hardhat networks.
- `scripts/preflight.mjs`: bounded read-only RPC checks.
- `scripts/verify.mjs`: reproducible validation report.

## Official references

- [SDK compatibility](https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility)
- [Encrypted inputs](https://cofhe-docs.fhenix.zone/client-sdk/guides/encrypting-inputs)
- [Access control](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/access-control)
- [Verified decryption](https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-tx)
- [Fhenix Fellowship](https://www.fhenix.io/ecosystem/fellowship)

MIT licensed. Built with Solidity, Hardhat, `@cofhe/sdk` and `@cofhe/hardhat-plugin` 0.7.1, and `@fhenixprotocol/cofhe-contracts` 0.2.0.
