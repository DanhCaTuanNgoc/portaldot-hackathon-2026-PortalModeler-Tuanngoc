# PortalModeler DEV Account Thread

Use this as the basis for a developer-facing post or Discord thread. The tone should be practical: what a builder can learn, reproduce, or adapt.

## Hook

```txt
PortalModeler is a visual Portaldot builder workbench. One node can connect to a local chain, estimate a POT fee, submit a real transfer, and return the extrinsic, block, and event evidence.
```

## Technical Breakdown

```txt
User clicks Transfer POT
-> React workbench sends { kind: "transferPot", config } to /api/run-node
-> Vite middleware validates the node kind
-> safe runner maps the node to scripts/transfer.py
-> script connects to ws://127.0.0.1:9944
-> script estimates fee with payment_queryInfo
-> script submits Balances.transfer_keep_alive
-> workbench displays stdout, extrinsic hash, block hash, and events
```

Code paths worth showing:

- `front-end/src/App.tsx`: visual node definitions, command preview, logs, evidence panel.
- `front-end/vite.config.ts`: safe runner middleware and node-kind whitelist.
- `scripts/transfer.py`: fee estimate plus local transfer submission.
- `scripts/query.py`: account and POT balance query.
- `scripts/doctor.py`: local RPC and runtime readiness checks.

## Smart Contract And Builder Examples

The repo also includes an extended ink! Membership workflow:

- `contract/src/lib.rs` and `contract/src/membership_contract.rs`: sample Membership contract.
- `scripts/deploy.py`: deploy helper for local contract artifacts.
- `scripts/call.py`: call/read helper for contract messages.
- `model/membership.json`: structured model for a contract/action workflow.
- `model/generate.py`: model-to-docs and model-to-ink-skeleton generator.

Best snippet themes:

- How to estimate a transaction fee before submit.
- How to keep browser actions behind a whitelist.
- How to export runnable commands from a visual workflow.
- How metadata can become a builder-facing interaction surface.

## Security Choices

PortalModeler is intentionally not a general shell runner.

- The browser cannot execute arbitrary shell commands.
- The frontend sends a node kind and config, not a raw command string.
- The Vite middleware accepts only approved node kinds.
- Each approved node maps to a known local script or browser-only helper.
- Command preview shows what the node is expected to run.
- Write actions require a confirmation modal in the workbench.
- Workflow exports avoid private seeds by default.
- Evidence logs expose fee, extrinsic hash, block hash, stdout, stderr, and events.

## Real Core Versus Local Helpers

Real onchain/local-chain proof:

- Local RPC connection to `ws://127.0.0.1:9944`.
- `System.Account` balance query.
- `payment_queryInfo` fee estimate.
- `Balances.transfer_keep_alive` submission.
- Included extrinsic result.
- Block hash and emitted chain events.

Local helper features:

- Visual canvas layout and node editing.
- Command sheet export.
- Markdown report export.
- Flow JSON and PortalModel JSON export.
- Generated ink! skeleton.
- Event timeline helper views.
- AI-generated workflow JSON, when configured.

This boundary should be stated clearly in demos and posts. It makes the proof more credible.

## Dev Diary Angle

```txt
Dev Diary #1
We started with a contract lifecycle workbench, then found the current local Membership deploy path was less stable than the core chain action path.

Dev Diary #2
We trimmed the demo to the smallest reliable builder proof: balance -> fee estimate -> Transfer POT -> events.

Dev Diary #3
We added a safe runner so a browser-based visual node can execute a real local Portaldot action without becoming an arbitrary shell.

Dev Diary #4
We added confirmation before write actions so builders can inspect endpoint, value, command, and node type before changing chain state.
```

## Thread Draft

```md
PortalModeler DEV note:

We are building a visual execution workbench for Portaldot builders.

The current proof is intentionally small and real:
Connect local RPC -> query balance -> estimate fee with payment_queryInfo -> submit Balances.transfer_keep_alive -> show extrinsic, block, and events.

Technical path:
React node -> /api/run-node -> safe runner whitelist -> scripts/transfer.py -> Portaldot RPC -> evidence back to the UI.

Security choice:
The browser never sends arbitrary shell. It sends an approved node kind. The local middleware maps that kind to a fixed script, and write actions require confirmation.

Real proof:
- RPC connection
- System.Account balance query
- payment_queryInfo fee estimate
- included Balances.transfer_keep_alive
- extrinsic hash
- block hash
- chain events

Local helpers:
- visual canvas
- command export
- evidence markdown
- graph JSON
- generated ink! skeleton

The goal is practical builder value: make local chain actions visible, repeatable, inspectable, and easy to turn into docs or commands.
```
