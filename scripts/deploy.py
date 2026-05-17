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


def metadata_version(metadata: dict[str, Any]) -> int:
    version = metadata.get("version", 0)
    try:
        return int(version)
    except (TypeError, ValueError):
        return 0


def ink_language_version(metadata: dict[str, Any]) -> int:
    source = metadata.get("source", {})
    language = str(source.get("language", ""))
    if "ink!" not in language:
        return 0

    tokens = language.replace("!", " ").replace(".", " ").split()
    for index, token in enumerate(tokens):
        if token.lower() == "ink" and index + 1 < len(tokens):
            try:
                return int(tokens[index + 1])
            except ValueError:
                return 0
    return 0


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


def call_field_names(call_function: Any) -> list[str]:
    call_value = call_function.value
    fields = call_value.get("args") or call_value.get("fields") or []
    return [field["name"] for field in fields]


def preflight_runtime_compatibility(
    portaldot: Any,
    metadata: dict[str, Any],
    legacy_no_selector: bool,
) -> None:
    call_function = portaldot.get_metadata_call_function("Contracts", "instantiate_with_code")
    call_arg_names = call_field_names(call_function)
    supports_modern_instantiate = "endowment" in call_arg_names
    artifact_version = metadata_version(metadata)
    artifact_ink_version = ink_language_version(metadata)

    if not supports_modern_instantiate:
        print(
            "Preflight: legacy Contracts.instantiate_with_code detected; deploy will fall back to selector-stripping compatibility mode if needed."
        )
    else:
        print(
            "Preflight: modern Contracts.instantiate_with_code detected; deploy will try the standard constructor payload first."
        )

    print(f"Preflight: contract artifact ink! {artifact_ink_version}.x (metadata version {artifact_version})")


def constructor_payload_variants(constructor_data: ScaleBytes, allow_legacy_fallback: bool) -> list[tuple[str, ScaleBytes]]:
    variants: list[tuple[str, ScaleBytes]] = [("modern", constructor_data)]
    if allow_legacy_fallback:
        legacy_data = strip_constructor_selector(constructor_data)
        if legacy_data.to_hex() != constructor_data.to_hex():
            variants.append(("legacy", legacy_data))
    return variants


def is_constructor_decode_error(exc: Exception) -> bool:
    message = str(exc)
    return "Input buffer has still data left after decoding" in message or "Bad input data provided to instantiate" in message


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
        "--legacy-no-selector",
        action="store_true",
        help="Send constructor args without the 4-byte selector for older local runtimes.",
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
    preflight_runtime_compatibility(portaldot, code.metadata.metadata_dict, args.legacy_no_selector)
    call_function = portaldot.get_metadata_call_function("Contracts", "instantiate_with_code")
    call_arg_names = set(call_field_names(call_function))
    uses_weight_v2 = "endowment" not in call_arg_names
    allow_legacy_fallback = args.legacy_no_selector or (not uses_weight_v2 and metadata_version(code.metadata.metadata_dict) < 5)
    payload_variants = constructor_payload_variants(constructor_data, allow_legacy_fallback)

    last_error: Exception | None = None
    receipt = None
    for index, (payload_label, payload_data) in enumerate(payload_variants, start=1):
        if payload_label == "legacy":
            print("Legacy constructor payload selected as fallback; stripping the 4-byte selector.")

        gas_limit = make_fallback_gas(args, uses_weight_v2)

        if not args.no_dry_run_gas:
            try:
                dry_run = dry_run_instantiate(portaldot, keypair, code, payload_data, args, uses_weight_v2)
                gas_limit = dry_run["gas_required"]
                print(f"Dry-run gas_required: {gas_limit}")
                if dry_run["storage_deposit"] is not None:
                    print(f"Dry-run storage_deposit: {dry_run['storage_deposit']}")
                if args.dry_run_only:
                    print("Dry-run only; no extrinsic submitted.")
                    return
            except Exception as exc:  # noqa: BLE001 - fallback is intentional for runtime/API variance.
                last_error = exc
                if args.dry_run_only:
                    raise
                if payload_label == "modern" and len(payload_variants) > index:
                    if is_constructor_decode_error(exc):
                        print("Modern constructor payload was rejected; retrying with selector-stripped legacy payload.")
                        continue
                print(f"Dry-run gas unavailable, using fallback gas flags. Reason: {exc}")
        elif args.dry_run_only:
            raise RuntimeError("--dry-run-only cannot be combined with --no-dry-run-gas.")

        if "endowment" in call_arg_names:
            call_params = {
                "endowment": args.value,
                "gas_limit": gas_limit,
                "code": f"0x{code.wasm_bytes.hex()}",
                "data": payload_data.to_hex(),
                "salt": args.salt,
            }
        else:
            call_params = {
                "value": args.value,
                "gas_limit": gas_limit,
                "storage_deposit_limit": None,
                "code": f"0x{code.wasm_bytes.hex()}",
                "data": payload_data.to_hex(),
                "salt": args.salt,
            }

        call = portaldot.compose_call(
            call_module="Contracts",
            call_function="instantiate_with_code",
            call_params=call_params,
        )
        extrinsic = portaldot.create_signed_extrinsic(call=call, keypair=keypair)
        receipt = portaldot.submit_extrinsic(extrinsic, wait_for_inclusion=True)

        if receipt.is_success:
            break

        if payload_label == "modern" and len(payload_variants) > index and is_constructor_decode_error(receipt.error_message if isinstance(receipt.error_message, Exception) else Exception(str(receipt.error_message))):
            print("Modern submit payload was rejected; retrying with selector-stripped legacy payload.")
            continue

        raise RuntimeError(f"Deploy failed: {describe_receipt_failure(receipt)}")

    if receipt is None:
        if last_error is not None:
            raise RuntimeError(f"Deploy failed before submission: {last_error}")
        raise RuntimeError("Deploy failed before submission: no payload variants were available")

    contract_address = extract_contract_address(receipt)

    if not contract_address:
        raise RuntimeError("Deploy succeeded, but no Contracts.Instantiated event was found")

    Path(args.out).write_text(contract_address, encoding="utf-8")
    print(f"Deployed @ {contract_address}")
    print(f"Extrinsic: {receipt.extrinsic_hash}")
    print(f"Wrote address to {args.out}")


if __name__ == "__main__":
    raise SystemExit(run_cli(main))
