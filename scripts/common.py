from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from substrateinterface import Keypair, SubstrateInterface

DEFAULT_URL = "ws://127.0.0.1:9944"
DEFAULT_SS58 = 42
DEFAULT_TYPE_REGISTRY_PRESET = "substrate-node-template"


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--url",
        default=os.getenv("PORTALDOT_URL", DEFAULT_URL),
        help=f"Portaldot websocket URL. Default: env PORTALDOT_URL or {DEFAULT_URL}",
    )
    parser.add_argument(
        "--ss58",
        type=int,
        default=int(os.getenv("PORTALDOT_SS58", DEFAULT_SS58)),
        help="SS58 address format. Portaldot docs list 42.",
    )
    parser.add_argument(
        "--seed",
        default=os.getenv("PORTALDOT_SEED", "//Alice"),
        help="Dev seed URI or mnemonic. Default: //Alice for local --dev node.",
    )
    parser.add_argument(
        "--type-registry-preset",
        default=os.getenv("PORTALDOT_TYPE_REGISTRY_PRESET", DEFAULT_TYPE_REGISTRY_PRESET),
        help=f"substrate-interface type registry preset. Default: env PORTALDOT_TYPE_REGISTRY_PRESET or {DEFAULT_TYPE_REGISTRY_PRESET}.",
    )


def connect(url: str, ss58: int, type_registry_preset: str = DEFAULT_TYPE_REGISTRY_PRESET) -> SubstrateInterface:
    return SubstrateInterface(
        url=url,
        ss58_format=ss58,
        type_registry_preset=type_registry_preset,
    )


def keypair_from_seed(seed: str, ss58: int) -> Keypair:
    return Keypair.create_from_uri(seed, ss58_format=ss58)


def assets_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "contract" / "target" / "ink"


def find_artifact(explicit: str | None, suffix: str) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.exists():
            raise FileNotFoundError(path)
        return path

    matches = sorted(path for path in assets_dir().glob(f"*{suffix}") if not path.name.startswith("."))
    if not matches:
        raise FileNotFoundError(
            f"No {suffix} artifact found in {assets_dir()}. Run `cargo contract build --release` first."
        )
    return matches[0]


def print_json(label: str, value: Any) -> None:
    print(f"{label}:")
    print(json.dumps(value, indent=2, default=str))
