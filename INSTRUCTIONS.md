
# ── INSTALL RUST (skip if already installed) ─────────────────────────────
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify Rust
rustc --version   # rustc 1.87.0
cargo --version   # cargo 1.87.0

# ── ADD WASM TARGET (required for ink! compilation) ───────────────────────
rustup target add wasm32-unknown-unknown

# ── INSTALL cargo-contract (ink! build + deploy tool) ────────────────────
cargo install --force --locked cargo-contract

# Verify
cargo contract --version  # cargo-contract 5.0.3

# ── OPTIONAL: install binaryen (for manual wasm-opt, usually bundled) ─────
# Ubuntu:  sudo apt install binaryen
# macOS:   brew install binaryen
# ══════════════════════════════════════════════════════════════════════════
#  UBUNTU
# ══════════════════════════════════════════════════════════════════════════
wget https://github.com/portaldotVolunteer/Portaldot-node/raw/main/portaldot-testnet-ubuntu.tar.gz
tar -xzvf portaldot-testnet-ubuntu.tar.gz
cd portaldot-testnet-ubuntu
chmod 755 portaldot_dev
./portaldot_dev --dev --alice


# ══════════════════════════════════════════════════════════════════════════
#  MACOS
# ══════════════════════════════════════════════════════════════════════════
curl -L https://github.com/portaldotVolunteer/Portaldot-node/raw/main/portaldot-testnet-macos.tar.gz \
     -o portaldot-testnet-macos.tar.gz
tar -xzvf portaldot-testnet-macos.tar.gz
cd portaldot-testnet-macos
chmod 755 portaldot_dev

# macOS Gatekeeper — remove quarantine attribute before running:
xattr -cr portaldot_dev
./portaldot_dev --dev --alice


# ══════════════════════════════════════════════════════════════════════════
#  WINDOWS  (everything runs inside WSL)
# ══════════════════════════════════════════════════════════════════════════

# Step 1 — install WSL (PowerShell as Administrator):
wsl --install
# Restart your PC, then open the WSL Ubuntu terminal.

# Step 2 — inside WSL terminal, install build deps + Rust if needed:
sudo apt update && sudo apt install -y build-essential curl
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Step 3 — download the Ubuntu binary inside WSL:
wget https://github.com/portaldotVolunteer/Portaldot-node/raw/main/portaldot-testnet-ubuntu.tar.gz
tar -xzvf portaldot-testnet-ubuntu.tar.gz
cd portaldot-testnet-ubuntu
chmod 755 portaldot_dev
./portaldot_dev --dev --alice


# ══════════════════════════════════════════════════════════════════════════
#  EXPECTED OUTPUT (all platforms)
# ══════════════════════════════════════════════════════════════════════════
# 🎶 Starting Portaldot...
# Local node identity is: 12D3KooW...
# Imported #0 (genesis)
# Listening for new connections on 127.0.0.1:9944.
#
# Leave this terminal open — the node must keep running.
# ── CREATE PROJECT ────────────────────────────────────────────────────────
cargo contract new flipper
cd flipper

# Edit src/lib.rs with the Flipper contract:

#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod flipper {

    #[ink(storage)]
    pub struct Flipper {
        value: bool,
    }

    impl Flipper {
        /// Initializes the contract with a given boolean value.
        #[ink(constructor)]
        pub fn new(init_value: bool) -> Self {
            Self { value: init_value }
        }

        /// Initializes the contract to false.
        #[ink(constructor)]
        pub fn new_default() -> Self {
            Self::new(false)
        }

        /// Flips the current boolean value.
        #[ink(message)]
        pub fn flip(&mut self) {
            self.value = !self.value;
        }

        /// Returns the current boolean value (read-only, no fee).
        #[ink(message)]
        pub fn get(&self) -> bool {
            self.value
        }
    }
}

# ── PROJECT STRUCTURE ─────────────────────────────────────────────────────
# flipper/
# ├── Cargo.toml
# └── lib.rs      ← paste the contract above here
cd flipper

# ── COMPILE ────────────────────────────────────────────────────────────────
cargo contract build

# Expected output (abridged):
#   Compiling flipper v0.1.0
#   Finished release [optimized] target(s)
#   Original wasm size: 12.3K, Optimized: 4.1K
#
#   Your contract artifacts are ready. You can find them in:
#   target/ink/
#   - flipper.contract  ← upload this to Portaldot UI
#   - flipper.wasm
#   - flipper.json      ← ABI / metadata

ls target/ink/
# flipper.contract  flipper.json  flipper.wasm

# ── DEBUG BUILD (faster, larger output, for development) ──────────────────
cargo contract build --debug

# ── CHECK METADATA (inspect ABI without building) ─────────────────────────
cargo contract check
// ── STEP BY STEP IN THE PORTALDOT EXPLORER ───────────────────────────────
//
// 1. Open https://www.portaldot.io/
//    · Top-right: click the network selector (shows "Portaldot Mainnet")
//    · Select "Local Node"  →  ws://127.0.0.1:9944
//    · Wait for the green dot — node is connected
//
// 2. Navigate to: Developer → Contracts
//    (in the top navigation bar)
//
// 3. Click "Upload & Instantiate Contract"
//    · Drag & drop  target/ink/flipper.contract
//    · The UI reads the ABI and shows all constructors automatically
//
// 4. Configure the deployment:
//    · Constructor: select "new"
//      init_value: false  (or true — your choice for initial state)
//    · Endowment: 1,000  (covers the Existential Deposit for the contract)
//    · Max Gas: leave at auto-estimated (~200,000,000,000)
//    · Signer: select Alice  (she has tokens in --dev mode)
//
// 5. Click "Deploy" → approve the transaction in the wallet popup
//
// 6. Contract deployed! ✓
//    · Copy the contract address (5D... format) — you'll need it to interact
//    · It appears in the "Contracts" list on the same page
//    · Click the address → "Execute" tab → call flip() or get()
//
// ── CONNECT YOUR OWN WALLET ─────────────────────────────────────────────
//
// If you want to use your own account instead of Alice:
// · Import Alice's dev seed in the Portaldot Extension:
//   seed phrase: "bottom drive obey lake curtain smoke basket hold race lonely fit walk"
// · Or create a new account and fund it from Alice via the UI Transfer page
// npm install @polkadot/api @polkadot/api-contract
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { ContractPromise }                 from '@polkadot/api-contract';
import fs from 'fs';

const ABI              = JSON.parse(fs.readFileSync('./target/ink/flipper.json', 'utf8'));
const CONTRACT_ADDRESS = '5D...'; // paste your deployed address from the UI

async function interactWithFlipper() {
  const api = await ApiPromise.create({
    provider: new WsProvider('ws://127.0.0.1:9944'),
  });

  const contract = new ContractPromise(api, ABI, CONTRACT_ADDRESS);
  const keyring  = new Keyring({ type: 'sr25519' });
  const alice    = keyring.addFromUri('//Alice');

  // ── READ current state (dry-run, costs no fee) ────────────────────────
  const { result, output } = await contract.query.get(
    alice.address,
    { gasLimit: -1 }   // -1 = estimate automatically
  );

  if (result.isOk) {
    console.log('Current value:', output.toHuman()); // false
  }

  // ── WRITE: flip the boolean (state-changing tx) ───────────────────────
  const gasLimit = api.registry.createType('WeightV2', {
    refTime:   3_000_000_000n,
    proofSize: 500_000n,
  });

  await new Promise((resolve, reject) => {
    contract.tx
      .flip({ gasLimit })
      .signAndSend(alice, ({ status, events, dispatchError }) => {
        if (dispatchError) {
          reject(new Error(dispatchError.toString()));
        } else if (status.isInBlock) {
          console.log('Flipped! In block:', status.asInBlock.toString());
          resolve();
        }
      });
  });

  // ── READ again after flip ─────────────────────────────────────────────
  const { output: output2 } = await contract.query.get(alice.address, { gasLimit: -1 });
  console.log('New value:', output2.toHuman()); // true ✓

  await api.disconnect();
}

interactWithFlipper().catch(console.error);
# ── INSTALL ────────────────────────────────────────────────────────────────
pip install substrate-interface

# ── DEPLOY + INTERACT ─────────────────────────────────────────────────────
from substrateinterface import SubstrateInterface, Keypair
from substrateinterface.contracts import ContractCode, ContractInstance

portaldot = SubstrateInterface(
    url="ws://127.0.0.1:9944",   # local --dev node
    # url="wss://mainnet.portaldot.io",  # or mainnet
    ss58_format=42,
    type_registry_preset='default',
)

keypair = Keypair.create_from_uri("//Alice")

# ── UPLOAD + DEPLOY ────────────────────────────────────────────────────────
code = ContractCode.create_from_contract_files(
    metadata_file="./target/ink/flipper.json",
    wasm_file="./target/ink/flipper.wasm",
    substrate=portaldot,
)

contract = code.deploy(
    keypair=keypair,
    constructor="new",
    args={"init_value": False},
    endowment=0,                        # per official Portaldot SDK docs
    gas_limit=1000000000000,            # single integer — per official docs
    upload_code=True,
)

print(f"Deployed at: {contract.contract_address}")

# ── READ STATE (no fee) ────────────────────────────────────────────────────
result = contract.read(keypair, "get")
print("Current value:", result.contract_result_data)  # False

# ── FLIP (estimate gas via dry-run first, then exec) ──────────────────────
dry_run = contract.read(keypair, "flip")
print("Gas estimate:", dry_run.gas_required)

receipt = contract.exec(keypair, "flip", args={}, gas_limit=dry_run.gas_required)

if receipt.is_success:
    print("Flip success ✓")
    print("Events:", receipt.contract_events)
else:
    print("Error:", receipt.error_message)

# ── READ AGAIN ────────────────────────────────────────────────────────────
result2 = contract.read(keypair, "get")
print("New value:", result2.contract_result_data)  # True ✓

portaldot.close()