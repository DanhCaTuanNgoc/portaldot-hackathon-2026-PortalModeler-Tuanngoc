from __future__ import annotations

import argparse
from pathlib import Path

from substrateinterface.contracts import ContractInstance

from common import add_common_args, connect, find_artifact, keypair_from_seed, metadata_for_substrate_interface, print_json, run_cli


def read_address(explicit: str | None) -> str:
    if explicit:
        return explicit
    address_file = Path(__file__).resolve().parents[1] / "contract-address.txt"
    if not address_file.exists():
        raise FileNotFoundError("Pass --address or deploy first to create contract-address.txt")
    return address_file.read_text(encoding="utf-8").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Call/read the Membership ink! contract.")
    add_common_args(parser)
    parser.add_argument("--address", help="Deployed contract address.")
    parser.add_argument("--metadata", help="Path to generated contract metadata JSON.")
    parser.add_argument(
        "--action",
        choices=["join", "is_member", "joined_at", "join_fee"],
        default="is_member",
        help="Contract message to execute/read.",
    )
    parser.add_argument("--member", help="Account to query for is_member/joined_at. Defaults to signer.")
    parser.add_argument("--value", type=int, default=0, help="Value transferred for payable calls.")
    parser.add_argument("--dry-run-only", action="store_true", help="Dry-run a payable call and do not submit an extrinsic.")
    args = parser.parse_args()

    portaldot = connect(args.url, args.ss58, args.type_registry_preset)
    keypair = keypair_from_seed(args.seed, args.ss58)
    metadata = find_artifact(args.metadata, ".json")
    contract_metadata = metadata_for_substrate_interface(metadata)
    address = read_address(args.address)

    contract_info = portaldot.query("Contracts", "ContractInfoOf", [address])
    if not contract_info.value:
        raise RuntimeError(f"No contract found on chain at {address}")

    contract = ContractInstance.create_from_address(
        contract_address=address,
        metadata_file=str(contract_metadata),
        substrate=portaldot,
    )

    if args.action == "join":
        dry_run = contract.read(keypair, "join", args={}, value=args.value)
        print_json("Dry-run", dry_run.value)
        print(f"Dry-run gas required: {dry_run.gas_required}")
        if args.dry_run_only:
            print("Dry-run only; no extrinsic submitted.")
            return
        receipt = contract.exec(keypair, "join", args={}, value=args.value, gas_limit=dry_run.gas_required)
        if receipt.is_success:
            print(f"Success. Extrinsic: {receipt.extrinsic_hash}")
            print_json("Contract events", receipt.contract_events)
        else:
            print_json("Error", receipt.error_message)
            raise RuntimeError(f"join failed: {receipt.error_message}")
        return

    call_args = {}
    if args.action in {"is_member", "joined_at"}:
        call_args = {"account": args.member or keypair.ss58_address}

    result = contract.read(keypair, args.action, args=call_args)
    print_json("Read result", result.value)
    print(f"Decoded value: {result.contract_result_data}")


if __name__ == "__main__":
    raise SystemExit(run_cli(main))
