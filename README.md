# PortalModeler Portaldot Proof

Phase 1 proof repo for **PortalModeler — Model-driven Contract & Action Builder for Portaldot**.

Tagline: Turn developer intent into Portaldot-ready contracts and actions.

## What is here

```txt
portaldot-proof/
├─ contract/              # ink! Membership contract
├─ scripts/
│  ├─ deploy.py           # deploy contract artifacts
│  ├─ call.py             # call join/read membership state
│  └─ query.py            # connect and query account balance
├─ model/
│  ├─ membership.json     # tiny PortalModeler contract/action model
│  └─ generate.py         # model -> skeleton/docs/checklist
├─ generated/             # checked-in sample generator output
├─ PAIN_POINTS.md
└─ README.md
```

## Docs used

- Portaldot docs home: https://portaldot-dev.readthedocs.io/en/latest/
- Local development network: https://portaldot-dev.readthedocs.io/en/latest/getting-started/local_test.html
- Chain info: https://portaldot-dev.readthedocs.io/en/latest/chain-info.html
- Python SDK install: https://portaldot-dev.readthedocs.io/en/latest/python-sdk/Install.html
- Create and call ink! contract: https://portaldot-dev.readthedocs.io/en/latest/python-sdk/Examples.html#create-and-call-ink-contract
- ink! contract interfacing: https://portaldot-dev.readthedocs.io/en/latest/python-sdk/usage/ink-contract-interfacing.html
- Contracts extrinsics/events/storage:
  - https://portaldot-dev.readthedocs.io/en/latest/module-interface/extrinsics/contracts.html
  - https://portaldot-dev.readthedocs.io/en/latest/module-interface/events/contracts.html
  - https://portaldot-dev.readthedocs.io/en/latest/module-interface/storage/contracts.html

## Portaldot facts captured

- Mainnet websocket: `wss://mainnet.portaldot.io`
- Local websocket: `ws://127.0.0.1:9944`
- SS58 format: `42`
- Token symbol: `POT`
- Token decimals: `14`

## Setup

For a detailed Windows/WSL setup path, see [LOCAL_SETUP.md](LOCAL_SETUP.md).

Install Python dependencies:

```powershell
cd portaldot-proof
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Install Rust and cargo-contract:

```powershell
winget install Rustlang.Rustup
rustup target add wasm32-unknown-unknown
cargo install cargo-contract --locked
```

For local chain testing, download the Portaldot local development node from the Chain Info docs. On Windows, the docs recommend WSL. Start it with:

```bash
portaldot_dev --dev --alice
```

Set local environment variables:

```powershell
Copy-Item .env.example .env
$env:PORTALDOT_URL="ws://127.0.0.1:9944"
$env:PORTALDOT_SS58="42"
$env:PORTALDOT_SEED="//Alice"
$env:PORTALDOT_TYPE_REGISTRY_PRESET="substrate-node-template"
```

## Phase 1: end-to-end proof

1. Query the chain and signer balance:

```powershell
python scripts/query.py
```

2. Build the Membership contract:

```powershell
cd contract
cargo contract build --release
cd ..
```

3. Deploy:

```powershell
python scripts/deploy.py --fee 100000000000000
```

By default, deploy first runs a `ContractsApi.instantiate` dry-run and uses the returned `gas_required` for the real extrinsic. To inspect gas without submitting, run:

```powershell
python scripts/deploy.py --fee 100000000000000 --dry-run-only
```

If a local runtime does not expose the dry-run API, you can fall back to explicit gas flags:

```powershell
python scripts/deploy.py --fee 100000000000000 --no-dry-run-gas --gas-ref-time 500000000000 --gas-proof-size 1000000
```

4. Call `join()` with one POT-like base unit amount:

```powershell
python scripts/call.py --action join --value 100000000000000
```

5. Read membership state:

```powershell
python scripts/call.py --action is_member
python scripts/call.py --action joined_at
```

## Phase 2: model to skeleton

Regenerate the checked-in sample output:

```powershell
python model/generate.py model/membership.json --out generated
```

Current model:

```json
{
  "contract": "Membership",
  "actors": ["User", "Admin"],
  "states": ["is_member", "joined_at"],
  "actions": [
    {
      "name": "join",
      "actor": "User",
      "requires": "pay POT",
      "emits": "MemberJoined"
    }
  ]
}
```

## Go/no-go checklist

- [ ] Kết nối được Portaldot
- [ ] Deploy được contract mẫu
- [ ] Call được action và đọc được result/event

Do not spend time on polished UI before these three boxes are checked.
