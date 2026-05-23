from __future__ import annotations

import argparse

from common import add_common_args, connect, keypair_from_seed, run_cli


PORTALDOT_TOKEN_SYMBOL = "POT"
PORTALDOT_TOKEN_DECIMALS = 14
DEFAULT_RECIPIENT_SEED = "//Bob"


def format_pot(value: int, decimals: int = PORTALDOT_TOKEN_DECIMALS) -> str:
    return f"{value / 10**decimals:.6f} {PORTALDOT_TOKEN_SYMBOL}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit a small local Portaldot POT transfer proof.")
    add_common_args(parser)
    parser.add_argument(
        "--to",
        help=f"Recipient SS58 address. Defaults to {DEFAULT_RECIPIENT_SEED}, which exists on --dev chains.",
    )
    parser.add_argument(
        "--amount",
        type=int,
        default=1_000_000_000_000,
        help="Transfer amount in base units. Default: 0.01 POT when decimals=14.",
    )
    parser.add_argument("--dry-run-only", action="store_true", help="Estimate fee without submitting the transfer.")
    args = parser.parse_args()

    portaldot = connect(args.url, args.ss58, args.type_registry_preset)
    sender = keypair_from_seed(args.seed, args.ss58)
    recipient = args.to or keypair_from_seed(DEFAULT_RECIPIENT_SEED, args.ss58).ss58_address

    call = portaldot.compose_call(
        call_module="Balances",
        call_function="transfer_keep_alive",
        call_params={"dest": recipient, "value": args.amount},
    )
    extrinsic = portaldot.create_signed_extrinsic(call=call, keypair=sender)
    fee_info = portaldot.rpc_request("payment_queryInfo", [extrinsic.data.to_hex()])["result"]
    partial_fee = int(fee_info["partialFee"])

    print(f"Endpoint: {args.url}")
    print(f"Sender: {sender.ss58_address}")
    print(f"Recipient: {recipient}")
    print(f"Amount: {args.amount} base units ({format_pot(args.amount)})")
    print(f"Estimated fee: {partial_fee} base units ({format_pot(partial_fee)})")
    print("Fee source: payment_queryInfo RPC; token symbol/decimals use Portaldot docs defaults.")

    if args.dry_run_only:
        print("Dry-run only; no extrinsic submitted.")
        return

    receipt = portaldot.submit_extrinsic(extrinsic, wait_for_inclusion=True)
    print(f"Success: {receipt.is_success}")
    print(f"Extrinsic: {receipt.extrinsic_hash}")
    print(f"Block hash: {getattr(receipt, 'block_hash', '')}")

    if not receipt.is_success:
        print(f"Error: {receipt.error_message}")
        raise RuntimeError(f"Transfer failed: {receipt.error_message}")

    print("Events:")
    for event in receipt.triggered_events:
        value = getattr(event, "value", {})
        event_data = value.get("event", {}) if isinstance(value, dict) else {}
        module = event_data.get("module_id", "")
        event_id = event_data.get("event_id", "")
        attributes = event_data.get("attributes", [])
        if module or event_id:
            print(f"- {module}.{event_id}: {attributes}")
        else:
            print(f"- {value}")


if __name__ == "__main__":
    raise SystemExit(run_cli(main))
