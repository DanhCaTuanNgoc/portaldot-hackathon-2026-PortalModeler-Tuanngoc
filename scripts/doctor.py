from __future__ import annotations

import argparse
import json
import importlib.util
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "ws://127.0.0.1:9944"
DEFAULT_SS58 = 42
DEFAULT_TYPE_REGISTRY_PRESET = "substrate-node-template"
ASSETS_DIR = ROOT / "contract" / "target" / "ink"
DEFAULT_ADDRESS_FILE = ROOT / "contract-address.txt"


def status(ok: bool, label: str, detail: str) -> bool:
    marker = "OK" if ok else "FAIL"
    print(f"[{marker}] {label}: {detail}")
    return ok


def check_python_dependency(module_name: str, package_name: str | None = None) -> bool:
    package = package_name or module_name
    found = importlib.util.find_spec(module_name) is not None
    return status(found, package, "installed" if found else f"missing; run `pip install -r requirements.txt`")


def check_command(command: str, install_hint: str) -> bool:
    try:
        result = subprocess.run(
            [command, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except FileNotFoundError:
        return status(False, command, install_hint)
    except subprocess.TimeoutExpired:
        return status(False, command, "version command timed out")

    version = (result.stdout or result.stderr).strip().splitlines()
    return status(result.returncode == 0, command, version[0] if version else f"exited with {result.returncode}")


def artifact_matches(suffix: str) -> list[Path]:
    if not ASSETS_DIR.exists():
        return []
    return sorted(path for path in ASSETS_DIR.glob(f"*{suffix}") if path.is_file() and not path.name.startswith("."))


def check_artifacts() -> bool:
    wasm_files = artifact_matches(".wasm")
    metadata_files = artifact_matches(".json")

    ok_wasm = status(
        bool(wasm_files),
        "WASM artifact",
        str(wasm_files[0].relative_to(ROOT)) if wasm_files else "missing; run `cargo contract build --release` in contract/",
    )
    ok_metadata = status(
        bool(metadata_files),
        "Metadata JSON",
        str(metadata_files[0].relative_to(ROOT))
        if metadata_files
        else "missing; run `cargo contract build --release` in contract/",
    )
    return ok_wasm and ok_metadata


def metadata_version(metadata: dict[str, object]) -> int:
    version = metadata.get("version", 0)
    try:
        return int(version)
    except (TypeError, ValueError):
        return 0


def ink_language_version(metadata: dict[str, object]) -> int:
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


def call_field_names(call_function: object) -> list[str]:
    call_value = call_function.value
    fields = call_value.get("args") or call_value.get("fields") or []
    return [field["name"] for field in fields]


def check_runtime_compatibility(url: str, timeout: float) -> bool:
    metadata_files = artifact_matches(".json")
    if not metadata_files:
        return status(
            False,
            "Runtime compatibility",
            "missing metadata JSON; build the contract first with `cargo contract build --release`",
        )

    try:
        from common import connect  # Imported lazily so the doctor still reports dependency issues cleanly.
    except Exception as exc:  # noqa: BLE001
        return status(False, "Runtime compatibility", f"cannot import deploy helpers ({exc})")

    metadata = json.loads(metadata_files[0].read_text(encoding="utf-8-sig"))
    artifact_version = metadata_version(metadata)
    artifact_ink_version = ink_language_version(metadata)

    try:
        portaldot = connect(url, DEFAULT_SS58, DEFAULT_TYPE_REGISTRY_PRESET)
        call_function = portaldot.get_metadata_call_function("Contracts", "instantiate_with_code")
        call_arg_names = call_field_names(call_function)
        supports_modern_instantiate = "endowment" in call_arg_names
    except Exception as exc:  # noqa: BLE001
        return status(False, "Runtime compatibility", f"could not inspect Contracts metadata ({exc})")

    if not supports_modern_instantiate and artifact_ink_version >= 4:
        return status(
            True,
            "Runtime compatibility",
            "legacy Contracts.instantiate_with_code detected against ink! "
            f"{artifact_ink_version}.x artifact (metadata version {artifact_version}); deploy will auto-strip the constructor selector",
        )

    signature = "endowment, Compact<Weight>, code, data, salt" if supports_modern_instantiate else ", ".join(call_arg_names)
    return status(
        True,
        "Runtime compatibility",
        f"Contracts.instantiate_with_code = {signature}; artifact ink! {artifact_ink_version}.x (metadata version {artifact_version})",
    )


def check_address_file(path: Path) -> bool:
    if not path.exists():
        return status(False, "Contract address file", f"missing at {path.relative_to(ROOT)}; deploy first")

    address = path.read_text(encoding="utf-8").strip()
    return status(bool(address), "Contract address file", address if address else "file is empty")


def check_rpc(url: str, timeout: float) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)

    if not host:
        return status(False, "RPC endpoint", f"invalid URL: {url}")

    try:
        with socket.create_connection((host, port), timeout=timeout):
            return status(True, "RPC endpoint", f"{host}:{port} is reachable")
    except OSError as exc:
        return status(False, "RPC endpoint", f"{host}:{port} is not reachable ({exc})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Phase 0 readiness for the Portaldot proof repo.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Portaldot websocket URL. Default: {DEFAULT_URL}")
    parser.add_argument("--ss58", type=int, default=DEFAULT_SS58, help="Expected SS58 format.")
    parser.add_argument(
        "--type-registry-preset",
        default=DEFAULT_TYPE_REGISTRY_PRESET,
        help="Expected substrate-interface type registry preset.",
    )
    parser.add_argument(
        "--address-file",
        default=str(DEFAULT_ADDRESS_FILE),
        help="Path to contract-address.txt generated by deploy.py.",
    )
    parser.add_argument("--skip-rpc", action="store_true", help="Skip local RPC reachability check.")
    parser.add_argument("--timeout", type=float, default=2.0, help="RPC TCP timeout in seconds.")
    args = parser.parse_args()

    print("PortalModeler Phase 0 doctor")
    print(f"Repo: {ROOT}")
    print(f"RPC: {args.url}")
    print(f"SS58: {args.ss58}")
    print(f"Type registry preset: {args.type_registry_preset}")
    print()

    checks = [
        status(sys.version_info >= (3, 10), "Python", sys.version.split()[0]),
        check_python_dependency("substrateinterface", "substrate-interface"),
        check_command("rustc", "missing; install Rust via rustup"),
        check_command("cargo", "missing; install Rust via rustup"),
    ]

    try:
        result = subprocess.run(
            ["cargo", "contract", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        version = (result.stdout or result.stderr).strip().splitlines()
        checks.append(
            status(
                result.returncode == 0,
                "cargo contract",
                version[0] if version else f"exited with {result.returncode}; install with `cargo install --force --locked cargo-contract`",
            )
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        checks.append(
            status(
                False,
                "cargo contract",
                "missing; install with `cargo install --force --locked cargo-contract`",
            )
        )

    checks.append(check_artifacts())
    checks.append(check_address_file(Path(args.address_file)))

    if not args.skip_rpc:
        checks.append(check_rpc(args.url, args.timeout))
        checks.append(check_runtime_compatibility(args.url, args.timeout))

    print()
    if all(checks):
        print("Phase 0 foundation looks ready.")
        return 0

    print("Phase 0 foundation has missing pieces. Fix the FAIL items above, then rerun this doctor.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
