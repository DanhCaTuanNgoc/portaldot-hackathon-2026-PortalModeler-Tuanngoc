# Local Build/Deploy Setup

This guide installs the missing toolchain pieces needed to build and deploy the local Membership proof:

- Rust compiler: `rustc`
- Rust package/build tool: `cargo`
- ink! contract CLI: `cargo-contract`
- Portaldot local development node

The recommended path for this repo is: run Python scripts from Windows PowerShell if you want, but run the Portaldot node and Rust contract build from WSL/Linux. Portaldot docs recommend WSL for Windows local node usage.

## 1. Install WSL

From an elevated PowerShell:

```powershell
wsl --install -d Ubuntu
```

Restart if Windows asks you to. Open Ubuntu from the Start menu and create your Linux username/password.

Update packages:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential curl clang pkg-config libssl-dev protobuf-compiler
```

## 2. Install Rust and Cargo in WSL

Rust's official installer is `rustup`; installing Rust this way also installs `cargo`.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Verify:

```bash
rustc --version
cargo --version
rustup --version
```

If the commands are not found after installation, close and reopen the WSL terminal, or run:

```bash
source "$HOME/.cargo/env"
```

## 3. Add the Wasm target

ink! contracts compile to Wasm, so add the target:

```bash
rustup target add wasm32-unknown-unknown
```

Verify:

```bash
rustup target list --installed
```

You should see:

```txt
wasm32-unknown-unknown
```

## 4. Install cargo-contract

Install the ink! contract CLI:

```bash
cargo install --force --locked cargo-contract
```

Verify:

```bash
cargo contract --version
```

If this fails on OpenSSL or linker errors, re-check that these WSL packages are installed:

```bash
sudo apt install -y build-essential clang pkg-config libssl-dev protobuf-compiler
```

## 5. Open the repo from WSL

Your Windows repo is available under `/mnt/d`:

```bash
cd /mnt/d/Coding/PortalPot-Hackathon/portaldot-proof
```

Build the contract:

```bash
cd contract
cargo contract build --release
cd ..
```

Expected artifacts are under:

```txt
contract/target/ink/
```

The Python deploy script can auto-discover the generated `.json` metadata and `.wasm` file there.

## 6. Install Python dependencies

Use either WSL Python or Windows Python. Keeping everything in WSL is simpler for local chain testing.

```bash
cd /mnt/d/Coding/PortalPot-Hackathon/portaldot-proof
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Verify:

```bash
python scripts/query.py --help
```

## 7. Run the Portaldot local node

Download the Portaldot local development node from the Chain Info docs, using the Ubuntu package in WSL.

Example flow after download:

```bash
tar -xzvf portaldot-testnet-ubuntu.tar.gz
cd portaldot-testnet-ubuntu
chmod 755 portaldot_dev
./portaldot_dev --dev --alice
```

Keep this terminal open. The local websocket should be:

```txt
ws://127.0.0.1:9944
```

If you need test POT on the local node, open Polkadot.js Apps against the local websocket:

```txt
https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A9944#/accounts
```

Then use ALICE -> Send, paste your wallet address, enter any amount, and sign without a password. ALICE has millions of POT, so you can top up as many times as you need.

## 8. Query, deploy, call

Open a second WSL terminal:

```bash
cd /mnt/d/Coding/PortalPot-Hackathon/portaldot-proof
source .venv/bin/activate
export PORTALDOT_URL="ws://127.0.0.1:9944"
export PORTALDOT_SS58="42"
export PORTALDOT_SEED="//Alice"
export PORTALDOT_TYPE_REGISTRY_PRESET="substrate-node-template"
```

Query local chain/account:

```bash
python scripts/query.py
```

Deploy the Membership contract:

```bash
python scripts/deploy.py --fee 100000000000000
```

Deploy runs a constructor dry-run first and uses the returned `gas_required`. To test gas only:

```bash
python scripts/deploy.py --fee 100000000000000 --dry-run-only
```

If the runtime API is unavailable on a given node, use the fallback path:

```bash
python scripts/deploy.py --fee 100000000000000 --no-dry-run-gas --gas-ref-time 500000000000 --gas-proof-size 1000000
```

Call `join()`:

```bash
python scripts/call.py --action join --value 100000000000000
```

Read state:

```bash
python scripts/call.py --action is_member
python scripts/call.py --action joined_at
```

## 9. Windows-only Rust option

If you want Rust directly in Windows PowerShell instead of WSL:

```powershell
winget install Rustlang.Rustup
```

Then install Microsoft C++ Build Tools with the "Desktop development with C++" workload if Rust asks for MSVC linker support.

Restart PowerShell and verify:

```powershell
rustc --version
cargo --version
rustup target add wasm32-unknown-unknown
cargo install --force --locked cargo-contract
cargo contract --version
```

This can build the contract, but the Portaldot docs still recommend running the local node in WSL on Windows.

## 10. Quick health checklist

```txt
[ ] wsl --version works
[ ] rustc --version works
[ ] cargo --version works
[ ] rustup target list --installed includes wasm32-unknown-unknown
[ ] cargo contract --version works
[ ] portaldot_dev --dev --alice is running
[ ] python scripts/query.py connects to ws://127.0.0.1:9944
[ ] cargo contract build --release creates contract/target/ink artifacts
[ ] python scripts/deploy.py writes contract-address.txt
[ ] python scripts/call.py --action join returns success and events
```

## Common fixes

If `rustc` or `cargo` is not found:

```bash
source "$HOME/.cargo/env"
```

If `cargo contract build` says the Wasm target is missing:

```bash
rustup target add wasm32-unknown-unknown
```

If Python cannot connect:

- Check that `portaldot_dev --dev --alice` is still running.
- Confirm `PORTALDOT_URL=ws://127.0.0.1:9944`.
- If running Python from Windows and the node from WSL, `127.0.0.1` usually forwards correctly on modern WSL, but restart the WSL node if the port is stale.

If deploy fails with balance or account errors:

- Use local `//Alice` only on a local `--dev` node.
- Do not use `//Alice` on mainnet.
- Run `python scripts/query.py` first and inspect the free balance.
