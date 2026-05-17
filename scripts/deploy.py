from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from scalecodec import ScaleBytes
from substrateinterface.contracts import ContractCode

from common import add_common_args, connect, find_artifact, keypair_from_seed, metadata_for_substrate_interface, run_cli


FALLBACK_GAS_REF_TIME = 500_000_000_000
FALLBACK_GAS_PROOF_SIZE = 1_000_000


def find_nested(value: Any, key: str) -> Any:
    if hasattr(value, "value"):
        value = value.value
    if isinstance(value, dict):
        if key in value:
            return value[key]
        for item in value.values():
            found = find_nested(item, key)
            if found is not None:
                return found
    if isinstance(value, list):
        for item in value:
            found = find_nested(item, key)
            if found is not None:
                return found
    return None


def make_fallback_gas(args: argparse.Namespace, weight_v2: bool) -> int | dict[str, int]:
    if weight_v2:
        return {"ref_time": args.gas_ref_time, "proof_size": args.gas_proof_size}
    return args.gas_ref_time


def strip_constructor_selector(constructor_data: ScaleBytes) -> ScaleBytes:
    data = constructor_data.to_hex()
    if len(data) <= 10:
        return ScaleBytes("0x")
    return ScaleBytes(f"0x{data[10:]}")


def constructor_args(metadata: dict[str, Any], constructor_name: str, fee: int) -> dict[str, Any]:
    for constructor in metadata["spec"]["constructors"]:
        if constructor["label"] != constructor_name:
            continue

        args: dict[str, Any] = {}
        for arg in constructor["args"]:
            if arg["label"] == "join_fee":
                args["join_fee"] = fee
            else:
                raise ValueError(f"Unsupported constructor argument: {arg['label']}")
        return args

    raise ValueError(f'Constructor "{constructor_name}" not found')


def dry_run_instantiate(
    portaldot: Any,
    keypair: Any,
    code: ContractCode,
    constructor_data: Any,
    args: argparse.Namespace,
    uses_weight_v2: bool,
) -> dict[str, Any]:
    gas_limit = make_fallback_gas(args, uses_weight_v2)
    base_params = {
        "origin": keypair.ss58_address,
        "value": args.value,
        "gas_limit": gas_limit,
        "storage_deposit_limit": None,
        "code": {"Upload": f"0x{code.wasm_bytes.hex()}"},
        "salt": args.salt,
    }

    last_error = None
    for data_key in ("input_data", "data"):
        try:
            result = portaldot.runtime_call(
                "ContractsApi",
                "instantiate",
                {**base_params, data_key: constructor_data.to_hex()},
            )
            error = find_nested(result, "Error")
            if error is not None:
                raise RuntimeError(f"ContractsApi.instantiate dry-run failed: {error}")

            gas_required = find_nested(result, "gas_required")
            storage_deposit = find_nested(result, "storage_deposit")
            if gas_required is None:
                raise RuntimeError(f"Dry-run did not return gas_required: {result.value}")

            return {"gas_required": gas_required, "storage_deposit": storage_deposit, "raw": result.value}
        except Exception as exc:  # noqa: BLE001 - fallback is intentional for runtime/API variance.
            last_error = exc

    raise RuntimeError(f"Could not dry-run ContractsApi.instantiate: {last_error}")


def extract_contract_address(receipt: Any) -> str | None:
    for event in receipt.triggered_events:
        decoded_event = getattr(event, "event", None)
        if getattr(decoded_event, "name", None) == "Instantiated":
            return event.params[1]["value"]

        value = getattr(event, "value", {})
        event_data = value.get("event", {}) if isinstance(value, dict) else {}
        if event_data.get("event_id") == "Instantiated":
            return event_data["attributes"]["contract"]

    return None


def describe_receipt_failure(receipt: Any) -> str:
    details = []
    for event in receipt.triggered_events:
        value = getattr(event, "value", None)
        if isinstance(value, dict) and value.get("event", {}).get("event_id") == "ExtrinsicFailed":
            details.append(str(value.get("event", {}).get("attributes")))
            continue

        decoded_event = getattr(event, "event", None)
        if getattr(decoded_event, "name", None) == "ExtrinsicFailed":
            details.append(str(getattr(event, "params", [])))

    if not details:
        return str(receipt.error_message)
    return f"{receipt.error_message}; events: {'; '.join(details)}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy the Membership ink! contract to Portaldot.")
    add_common_args(parser)
    parser.add_argument("--metadata", help="Path to generated contract metadata JSON.")
    parser.add_argument("--wasm", help="Path to generated contract WASM.")
    parser.add_argument("--fee", type=int, default=0, help="Join fee in Planck-like base units.")
    parser.add_argument("--value", type=int, default=0, help="Initial value transferred to the contract.")
    parser.add_argument(
        "--gas-ref-time",
        type=int,
        default=FALLBACK_GAS_REF_TIME,
        help="Fallback constructor gas ref_time.",
    )
    parser.add_argument(
        "--gas-proof-size",
        type=int,
        default=FALLBACK_GAS_PROOF_SIZE,
        help="Fallback constructor gas proof_size.",
    )
    parser.add_argument("--salt", default="", help="Optional deployment salt.")
    parser.add_argument(
        "--no-dry-run-gas",
        action="store_true",
        help="Skip ContractsApi.instantiate dry-run and use fallback gas flags directly.",
    )
    parser.add_argument(
        "--dry-run-only",
        action="store_true",
        help="Dry-run constructor gas estimation, print the result, and do not submit an extrinsic.",
    )
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parents[1] / "contract-address.txt"),
        help="File to write deployed contract address.",
    )
    args = parser.parse_args()

    portaldot = connect(args.url, args.ss58, args.type_registry_preset)
    keypair = keypair_from_seed(args.seed, args.ss58)
    metadata = find_artifact(args.metadata, ".json")
    wasm = find_artifact(args.wasm, ".wasm")
    contract_metadata = metadata_for_substrate_interface(metadata, wasm)

    print(f"Deploying from {keypair.ss58_address}")
    print(f"Metadata: {metadata}")
    if contract_metadata != metadata:
        print(f"Substrate-interface metadata adapter: {contract_metadata}")
    print(f"WASM: {wasm}")

    code = ContractCode.create_from_contract_files(
        wasm_file=str(wasm),
        metadata_file=str(contract_metadata),
        substrate=portaldot,
    )

    constructor_data = code.metadata.generate_constructor_data(
        name="new",
        args=constructor_args(code.metadata.metadata_dict, "new", args.fee),
    )
    call_function = portaldot.get_metadata_call_function("Contracts", "instantiate_with_code")
    call_arg_names = {arg["name"] for arg in call_function.value["args"]}
    uses_weight_v2 = "endowment" not in call_arg_names
    if not uses_weight_v2:
        constructor_data = strip_constructor_selector(constructor_data)
        print("Legacy Contracts.instantiate_with_code detected; using constructor args without selector.")
    gas_limit = make_fallback_gas(args, uses_weight_v2)

    if not args.no_dry_run_gas:
        try:
            dry_run = dry_run_instantiate(portaldot, keypair, code, constructor_data, args, uses_weight_v2)
            gas_limit = dry_run["gas_required"]
            print(f"Dry-run gas_required: {gas_limit}")
            if dry_run["storage_deposit"] is not None:
                print(f"Dry-run storage_deposit: {dry_run['storage_deposit']}")
            if args.dry_run_only:
                print("Dry-run only; no extrinsic submitted.")
                return
        except Exception as exc:  # noqa: BLE001 - fallback is intentional for runtime/API variance.
            if args.dry_run_only:
                raise
            print(f"Dry-run gas unavailable, using fallback gas flags. Reason: {exc}")
    elif args.dry_run_only:
        raise RuntimeError("--dry-run-only cannot be combined with --no-dry-run-gas.")

    if "endowment" in call_arg_names:
        call_params = {
            "endowment": args.value,
            "gas_limit": gas_limit,
            "code": f"0x{code.wasm_bytes.hex()}",
            "data": constructor_data.to_hex(),
            "salt": args.salt,
        }
    else:
        call_params = {
            "value": args.value,
            "gas_limit": gas_limit,
            "storage_deposit_limit": None,
            "code": f"0x{code.wasm_bytes.hex()}",
            "data": constructor_data.to_hex(),
            "salt": args.salt,
        }

    call = portaldot.compose_call(
        call_module="Contracts",
        call_function="instantiate_with_code",
        call_params=call_params,
    )
    extrinsic = portaldot.create_signed_extrinsic(call=call, keypair=keypair)
    receipt = portaldot.submit_extrinsic(extrinsic, wait_for_inclusion=True)

    if not receipt.is_success:
        raise RuntimeError(f"Deploy failed: {describe_receipt_failure(receipt)}")

    contract_address = extract_contract_address(receipt)

    if not contract_address:
        raise RuntimeError("Deploy succeeded, but no Contracts.Instantiated event was found")

    Path(args.out).write_text(contract_address, encoding="utf-8")
    print(f"Deployed @ {contract_address}")
    print(f"Extrinsic: {receipt.extrinsic_hash}")
    print(f"Wrote address to {args.out}")


if __name__ == "__main__":
    raise SystemExit(run_cli(main))
