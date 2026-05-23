# PortalModeler - Progress Review Submission

Discord thread title:

```txt
[TBD] Team Name - PortalModeler
```

Note before posting: replace `[TBD] Team Name` with the real team number/name.

## 1. Project Summary

Project name: **PortalModeler**

One-line description: **A visual workbench that turns a Portaldot smart-contract workflow into executable nodes with local health checks, script logs, state cards, event timeline, and exportable commands.**

Smallest demo flow selected for checkpoint:

```txt
Open PortalModeler Workbench
-> connect to local Portaldot node at ws://127.0.0.1:9944
-> query signer balance as POT
-> estimate fee for a transfer through payment_queryInfo
-> submit a real Balances.transfer_keep_alive transaction
-> show POT amount, estimated fee, extrinsic hash, block hash
-> show Balances.Transfer and System.ExtrinsicSuccess events
```

Current checkpoint status: **Green candidate for the smallest onchain action flow.**

Reason: the local Portaldot node was restarted cleanly with `--tmp`, block production is active, the project is connected to the local node, and a real included onchain transfer succeeds from the project runner with POT fee evidence.

Scope note: the Membership ink! contract flow remains in the repo as the extended contract demo, but it is **not** the checkpoint-critical Green flow because the current Portaldot local contracts runtime rejects the ink! 5 constructor/deploy path. The stable MVP flow for checkpoint is the smaller Portaldot action workflow: balance -> fee estimate -> transfer -> events.

## 1A. Eligibility Verdict Against Mandatory Criteria

Current verdict: **Valid Green candidate for the trimmed checkpoint MVP.**

The project now proves local RPC connectivity, project connection, frontend build health, POT balance display, fee estimation, a fresh included onchain transaction, and a closed-loop user-visible result for the smallest stable flow.

| Mandatory proof | Verdict | Why |
|---|---:|---|
| Local Portaldot node can run | Pass | `portaldot_dev --dev --tmp --alice` responds on `ws://127.0.0.1:9944`; block advanced during re-check (`#12 -> #13`). |
| Project is connected to local Portaldot | Pass | `scripts/query.py` connects to the same endpoint and reads account/balance state. |
| At least one real onchain action can be executed | Pass | `scripts/transfer.py` submitted a real `Balances.transfer_keep_alive`; receipt shows `Success: True`, extrinsic hash, block hash, `Balances.Transfer`, and `System.ExtrinsicSuccess`. |
| POT can be shown as gas / fee | Pass with caveat | `payment_queryInfo` returns `partialFee` and the project formats it as POT using official Portaldot docs decimal `14`. Local `system_properties` is empty, so the POT label is documented default rather than chain-exposed metadata. |
| MVP completes one smallest end-to-end core flow | Pass | The selected MVP flow is now balance -> fee estimate -> transfer -> event/result. |
| Demo can be clearly explained and shown on Demo Day | Pass | The demo is a 60-90 sec flow: refresh health, run balance, run Transfer POT, show fee/extrinsic/events. |

Submission classification with current evidence: **Green candidate**, as long as the team clearly labels the contract Membership deploy as extended/unstable and uses Transfer POT as the checkpoint-critical onchain flow.

## 2. Evidence Checked On 2026-05-23

Workspace checked:

```txt
D:\Coding\PortalPot-Hackathon\portaldot-proof
```

Local node process observed:

```txt
./.local-node/latest-node/portaldot_dev --dev --tmp --alice
RPC: ws://127.0.0.1:9944
```

Block production check after clean restart:

```txt
block_before 12
block_after 13
advanced 1
```

Frontend build:

```txt
cd front-end
npm run build
```

Result:

```txt
tsc && vite build completed successfully.
1757 modules transformed.
dist assets generated.
```

Doctor check:

```txt
python scripts/doctor.py --url ws://127.0.0.1:9944
```

Observed result:

```txt
[OK] Python: 3.13.2
[OK] substrate-interface: installed
[OK] rustc: rustc 1.87.0
[OK] cargo: cargo 1.87.0
[OK] cargo contract: cargo-contract-contract 4.1.1
[OK] WASM artifact: contract\target\ink\membership.wasm
[OK] Metadata JSON: contract\target\ink\membership.json
[OK] Contract address file: 5GbykFYgzgWVJxUFa2i1N9YeRu1Fwmrq2n3fQrsSmBk5VmYE
[OK] RPC endpoint: 127.0.0.1:9944 is reachable
[OK] Runtime compatibility: Contracts.instantiate_with_code = endowment, Compact<Weight>, code, data, salt; artifact ink! 5.x (metadata version 5)
Phase 0 foundation looks ready.
```

Balance query:

```txt
python scripts/query.py --url ws://127.0.0.1:9944
```

Observed result:

```txt
Connected chain: Development
Endpoint: ws://127.0.0.1:9944
Account: 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
Token: POT
Token source: Portaldot docs default; local system_properties did not expose token metadata.
Free balance: 49999.978398 POT
```

Polkadot.js Apps endpoint compatibility check:

```txt
URL: https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A9944#/accounts
Browser-origin websocket check: Origin = https://polkadot.js.org
RPC target: ws://127.0.0.1:9944
```

Observed RPC responses:

```txt
system_chain -> Development
system_properties -> {}
```

Meaning:

- Polkadot.js Apps can connect to the same local endpoint from the hosted web app origin.
- The local node does not currently expose token symbol/decimals through `system_properties`.
- Portaldot docs define token name `POT` and decimal `14`, so the project displays POT using this documented default when local `system_properties` is empty.
- For mentor evidence, show both: the Polkadot.js custom endpoint connected to `ws://127.0.0.1:9944`, and the project terminal/UI showing the same endpoint/account/balance converted as POT.

Fee-estimation and real transfer check:

```txt
python scripts/transfer.py --url ws://127.0.0.1:9944
```

Observed result:

```txt
Endpoint: ws://127.0.0.1:9944
Sender: 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY
Recipient: 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty
Amount: 1000000000000 base units (0.010000 POT)
Estimated fee: 1450304861815 base units (0.014503 POT)
Fee source: payment_queryInfo RPC; token symbol/decimals use Portaldot docs defaults.
Success: True
Extrinsic: 0x658303141863e954e3edbb5d9ffe0e20c8a169c63c6923e5d5b77df56f1d21f6
Block hash: 0x5ac987815db312f194833f7d6dc7a5853271a3064c7eafbf13b6f5b1d34f9cd1
Events:
- Balances.Transfer
- Treasury.Deposit
- System.ExtrinsicSuccess
```

Meaning: the runtime estimates transaction fee in base units through RPC and the project submits a real included onchain action with success events.

Frontend safe-runner check:

```txt
POST http://127.0.0.1:5173/api/run-node
kind: transferPot
```

Observed result:

```txt
ok: true
command: python scripts/transfer.py --url ws://127.0.0.1:9944 --amount 1000000000000 --to 5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty
Estimated fee: 1450304860017 base units (0.014503 POT)
Success: True
Extrinsic: 0x6d86ee8edb691337f0c6119dfae454d66408ae4585b10ce9ef89209e543146f2
Block hash: 0x35e786a8b76e3124ad56cc5f308d7b2c7c2ae2f950f7a134b8c6652e5efd2904
Events include Balances.Transfer and System.ExtrinsicSuccess
```

Contract liveness check:

```txt
python scripts/call.py --url ws://127.0.0.1:9944 --action join_fee
python scripts/call.py --url ws://127.0.0.1:9944 --action is_member
python scripts/call.py --url ws://127.0.0.1:9944 --action joined_at
```

Observed result:

```txt
contract-address.txt is absent during the Green transfer demo.
The previous stale address was backed up to contract-address.stale.txt.
```

Meaning: the contract flow is intentionally not active during the checkpoint-critical Green demo. This avoids presenting a stale contract as live.

Deploy check:

```txt
python scripts/deploy.py --url ws://127.0.0.1:9944 --fee 100000000000000
```

Observed result after clean restart with compatibility flag:

```txt
python scripts/deploy.py --url ws://127.0.0.1:9944 --fee 100000000000000 --legacy-no-selector
Deploy failed with runtime dispatch error: System.Other
```

Dry-run gas check:

```txt
python scripts/deploy.py --url ws://127.0.0.1:9944 --fee 100000000000000 --dry-run-only
```

Observed result:

```txt
Error: Could not dry-run ContractsApi.instantiate:
Bad input data provided to instantiate: Input buffer has still data left after decoding!
```

Meaning: contract deployment remains an extended risk; use Transfer POT as the smallest demonstrable action for checkpoint.

## 3. Review Criteria Comparison

| Requirement | Current Status | Evidence / Notes |
|---|---:|---|
| Local Portaldot node runs | Yes | Clean node runs with `./.local-node/latest-node/portaldot_dev --dev --tmp --alice`; block production advanced from `#12` to `#13`. |
| Project connected to local node | Yes | `scripts/query.py` and the Vite safe runner both connect to `ws://127.0.0.1:9944`. |
| At least one real onchain tx works | Yes | `scripts/transfer.py` and `/api/run-node` both produced successful `Balances.transfer_keep_alive` extrinsics with `System.ExtrinsicSuccess`. |
| POT gas / fee can be shown | Yes | Transfer script shows `Estimated fee: ... (0.014503 POT)` from `payment_queryInfo`. POT/14 comes from official Portaldot docs because local `system_properties` is empty. |
| MVP core flow runs end-to-end | Yes | Stable MVP flow: health -> balance -> fee estimate -> Transfer POT -> extrinsic hash/block hash/events. |
| Demo flow fits within 60-90 sec | Yes | Run local node, open workbench, run Check Balance, run Transfer POT, show logs/events. |
| GitHub / README / demo video ready | Partial | README/local setup exist; record demo video using the new Transfer POT flow before final Discord post. |
| Mocked parts do not affect core flow | Yes | Core flow uses real RPC, real fee estimation, and real included transfer. UI export/report/event helper nodes are not required for proof. |

Checkpoint self-assessment: **Green candidate for the Transfer POT MVP flow**.

Important caveat: do not present Membership deploy/join as the checkpoint-critical proof until the Portaldot contracts runtime compatibility issue is fixed.

## 4. What Is Already Implemented

Core repo:

- `contract/`: ink! Membership contract with `join`, `is_member`, `joined_at`, and `join_fee`.
- `scripts/query.py`: connects to local node and reads signer balance.
- `scripts/transfer.py`: estimates fee with `payment_queryInfo`, submits `Balances.transfer_keep_alive`, and prints extrinsic/events.
- `scripts/deploy.py`: deploys Membership contract from local metadata/WASM.
- `scripts/call.py`: calls `join` and reads `is_member`, `joined_at`, `join_fee`.
- `scripts/doctor.py`: checks Python/Rust/cargo-contract/artifacts/address/RPC/runtime compatibility.
- `model/membership.json` and `model/generate.py`: tiny model-to-doc/skeleton generator.

Frontend:

- React/Vite workbench in `front-end/src/App.tsx`.
- `Transfer POT` node for the checkpoint Green flow.
- Visual node board with workflow nodes, dependencies, statuses, logs, health strip, inspector, snapshot cards, command sheet, graph JSON, and markdown export.
- Local-only safe runner in `front-end/vite.config.ts`.
- Runner endpoints:

```txt
GET /api/health
POST /api/run-node
GET /api/snapshot
```

Safe runner behavior:

- Uses a whitelist instead of arbitrary shell execution.
- Maps node kinds to known repo scripts.
- Detects stale contract addresses.
- Skips `join()` when signer is already a member to avoid expected contract assertion.

## 5. Compared With The Workbench Plan

Plan item: reliable workflow engine with node status/dependencies.

Status: mostly implemented. Nodes have `idle`, `blocked`, `ready`, `running`, `success`, `warning`, and `error`; flow can run selected node, run from selected node, and run full workflow.

Plan item: local health and stale address detection.

Status: implemented. `/api/health` and `/api/snapshot` check RPC, artifacts, contract reachability, and stale address state.

Plan item: show real chain/account/state/event evidence.

Status: implemented for the Green flow. Balance/account display works, `Transfer POT` prints fee/extrinsic/block/event evidence, and contract state/event evidence remains extended work.

Plan item: generic metadata-driven contract forms.

Status: not complete. Metadata is read for messages/events, but forms are still mainly tuned for Membership.

Plan item: warning/confirmation before write transactions.

Status: incomplete. The UI shows value/command/logs, but a clear confirmation modal before deploy/call should be added or the demo operator should narrate this carefully.

Plan item: export commands/report.

Status: implemented at UI level. Command sheet, graph JSON, and markdown export are visible in the workbench.

## 6. Mocked Or Non-Onchain Parts

These parts are local/UI helper features and should be labeled as not core onchain execution:

- Event timeline currently combines detected chain state with metadata-declared events. It is useful for the demo, but final proof should still show actual contract call logs.
- `watchEvents`, `decodeEvents`, `exportWorkflow`, `exportCommands`, `saveWorkflow`, `loadWorkflow`, and `generateReport` are browser/local-generated helper nodes.
- The homepage/testimonials/future plan sections are presentation UI, not core chain functionality.

Core flow that must be real before Demo Day:

```txt
local node -> query balance -> estimate transfer fee -> submit Transfer POT tx -> show ExtrinsicSuccess
```

## 7. Must-Fix List Before Demo Day

Priority 1: keep the Green flow stable.

- Start the local node cleanly with `--tmp` before recording.
- Confirm block production advances.
- Run `python scripts/transfer.py --url ws://127.0.0.1:9944` and keep the successful log.

Priority 2: record the exact 60-90 second demo flow.

Run and record either from terminal or the workbench safe runner:

```txt
python scripts/query.py --url ws://127.0.0.1:9944
python scripts/transfer.py --url ws://127.0.0.1:9944
```

Expected final proof:

```txt
POT balance
estimated fee in POT
transfer amount in POT
extrinsic hash
block hash
Balances.Transfer
System.ExtrinsicSuccess
```

Priority 3: keep Membership contract clearly labeled as extended/unstable.

- Do not present stale `contract-address.txt` as live.
- Do not claim Membership `join()` works on the current Portaldot local contracts runtime.
- Keep contract deployment as a follow-up compatibility task.

Priority 4: final evidence package.

- Record one short screen video/GIF after the above is stable.
- Include terminal logs and the workbench UI in the recording.
- Keep demo to one flow only; do not add new features.

## 8. Recommended Discord Message To Paste

```md
## PortalModeler - Progress Review

Project: PortalModeler

Smallest demo flow:
Open Workbench -> connect to local Portaldot node -> query balance/POT -> run Transfer POT -> show estimated fee, extrinsic hash, block hash, Balances.Transfer, and System.ExtrinsicSuccess.

Current status:
Green candidate for the smallest stable MVP flow. Local node, project connection, fee estimation, and a real included onchain action are verified.

Evidence checked:
- Local node process: `./.local-node/latest-node/portaldot_dev --dev --tmp --alice`
- RPC: `ws://127.0.0.1:9944`
- Block production advanced from `#12` to `#13` during re-check.
- `python scripts/query.py --url ws://127.0.0.1:9944` connects and shows POT balance.
- `python scripts/transfer.py --url ws://127.0.0.1:9944` succeeds.
- Transfer evidence: estimated fee `0.014503 POT`, extrinsic `0x658303141863e954e3edbb5d9ffe0e20c8a169c63c6923e5d5b77df56f1d21f6`, block `0x5ac987815db312f194833f7d6dc7a5853271a3064c7eafbf13b6f5b1d34f9cd1`, events `Balances.Transfer` and `System.ExtrinsicSuccess`.
- Frontend safe runner `/api/run-node` with `kind=transferPot` also succeeds and returns a fresh extrinsic.
- Frontend `npm run build` passes.

Known caveat:
- The local node exposes `system_properties -> {}`, so POT symbol/decimals are displayed from official Portaldot docs defaults: POT, decimals 14.
- Membership contract deploy is extended/unstable on the current Portaldot contracts runtime and is not used as the checkpoint-critical flow.

Demo plan:
1. Start local Portaldot node with `--dev --tmp --alice`.
2. Open workbench at `http://127.0.0.1:5173`.
3. Run Check Balance.
4. Run Transfer POT.
5. Show fee, extrinsic, block hash, and success events in Run Logs.

Mocked/local helper parts:
Export/report/event helper views are local UI helpers. The final demo core flow is the real Transfer POT tx on the local Portaldot node.
```
