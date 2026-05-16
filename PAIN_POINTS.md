# Phase 1 Pain Points

## Observed on this machine

- Python is available: `Python 3.13.2`.
- Rust tools are not available in PATH yet: `rustc`, `cargo`, and `cargo contract` were not found.
- Portaldot docs recommend WSL for Windows node/client usage.
- Added a setup path in `LOCAL_SETUP.md` for Rust, cargo-contract, and local Portaldot build/deploy.

## Likely user-facing friction

- The docs spell the section as "Geting Started"; this is easy to miss in search.
- Contract deployment requires artifacts from `cargo contract build --release`; Python scripts cannot help until `.wasm` and metadata JSON exist.
- Gas values may need dry-run based tuning per chain/runtime. The deploy script exposes fallback gas flags.
- Local dev keys like `//Alice` are only appropriate for a local `--dev` node, not mainnet.
- Reading contract events means checking both runtime `Contracts.ContractEmitted` events and decoded `contract_events` from the SDK receipt.

## Model-worthy steps

- Generate a deploy checklist from the contract model.
- Generate a script command matrix for query/deploy/call/read.
- Encode action requirements like "pay POT" as payable methods plus CLI `--value`.
- Surface events as first-class outputs in generated docs and scripts.
