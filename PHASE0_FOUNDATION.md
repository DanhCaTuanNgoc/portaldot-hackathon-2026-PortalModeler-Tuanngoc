# Phase 0 Foundation Checklist

This file is the stable verification path before building the visual node board.

## Goal

Make sure the current repo has reliable scripts and docs for the manual Portaldot flow:

```txt
query -> build contract -> deploy -> call join -> read is_member/joined_at
```

## Automated Doctor

Run from the repo root:

```powershell
python scripts/doctor.py
```

If the local node is not running yet:

```powershell
python scripts/doctor.py --skip-rpc
```

The doctor checks:

- Python version.
- `substrate-interface` dependency.
- `rustc`.
- `cargo`.
- `cargo contract`.
- Contract `.wasm` artifact.
- Contract metadata `.json` artifact.
- `contract-address.txt`.
- Local RPC reachability, unless `--skip-rpc` is used.

## Manual Command Flow

### 1. Start Local Node

Run the Portaldot local development node in WSL/Linux:

```bash
./portaldot_dev --dev --alice
```

Expected websocket:

```txt
ws://127.0.0.1:9944
```

### 2. Query Chain

```powershell
python scripts/query.py
```

Expected result:

- Connected chain name.
- Endpoint.
- Signer/account address.
- `System.Account`.
- Free balance.

### 3. Build Contract

```powershell
cd contract
cargo contract build --release
cd ..
```

Expected artifacts:

```txt
contract/target/ink/membership.wasm
contract/target/ink/membership.json
```

### 4. Dry-run Deploy Gas

```powershell
python scripts/deploy.py --fee 100000000000000 --dry-run-only
```

Expected result:

- Metadata path.
- WASM path.
- Constructor dry-run result.
- `gas_required`.

### 5. Deploy Contract

```powershell
python scripts/deploy.py --fee 100000000000000
```

Expected result:

- Successful extrinsic hash.
- Contract address.
- `contract-address.txt` written at repo root.

### 6. Call `join`

```powershell
python scripts/call.py --action join --value 100000000000000
```

Expected result:

- Successful extrinsic hash.
- Contract events.
- `MemberJoined` event if decoded by the SDK/runtime.

### 7. Read State

```powershell
python scripts/call.py --action is_member
python scripts/call.py --action joined_at
```

Expected result:

- `is_member` returns true for the joined signer.
- `joined_at` returns a block/timestamp-like value depending on contract logic.

## Current Machine Status

Last checked with:

```powershell
python scripts/doctor.py --url ws://127.0.0.1:9944
python scripts/query.py --url ws://127.0.0.1:9944
python scripts/deploy.py --url ws://127.0.0.1:9944 --fee 100000000000000
python scripts/call.py --url ws://127.0.0.1:9944 --action join --value 100000000000000
python scripts/call.py --url ws://127.0.0.1:9944 --action is_member
python scripts/call.py --url ws://127.0.0.1:9944 --action joined_at
python -m py_compile scripts/doctor.py scripts/common.py scripts/query.py scripts/deploy.py scripts/call.py scripts/run_node.py
python model/generate.py model/membership.json --out generated
```

Observed:

- Python 3.13.2 is available.
- `substrate-interface` is installed.
- Python scripts compile.
- Model generator runs.
- Existing WASM artifact is present at `contract/target/ink/membership.wasm`.
- Existing metadata artifact is present at `contract/target/ink/membership.json`.
- Local RPC is reachable at `ws://127.0.0.1:9944`.
- `contract-address.txt` is present and points to a deployed local Membership contract.
- `join()` succeeds with value `100000000000000`.
- `is_member` returns `true` for Alice after joining.
- `joined_at` returns a timestamp-like value after joining.
- The working local runtime is `substrate-contracts-node v0.42.0` under `.local-node/contracts-node-v0.42.0`.
- Portaldot's bundled local node still appears runtime-incompatible for this ink! 5.x artifact; keep it as reference, not the primary Phase 0 runtime.

## Phase 0 Exit Criteria

- [x] `python scripts/doctor.py` passes with the local node running.
- [x] `python scripts/query.py` connects to `ws://127.0.0.1:9944`.
- [x] `cargo contract build --release` creates both `.wasm` and metadata `.json`.
- [x] `python scripts/deploy.py --fee 100000000000000` writes `contract-address.txt`.
- [x] `python scripts/call.py --action join --value 100000000000000` succeeds.
- [x] `python scripts/call.py --action is_member` returns the expected state.
- [x] `python scripts/call.py --action joined_at` returns the expected state.

Once these pass, the command flow is stable enough for the visual node board to generate and orchestrate.
