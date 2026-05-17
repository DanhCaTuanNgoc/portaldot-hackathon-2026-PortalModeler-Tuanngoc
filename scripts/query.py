from __future__ import annotations

import argparse

from common import add_common_args, connect, keypair_from_seed, print_json, run_cli


def main() -> None:
    parser = argparse.ArgumentParser(description="Query Portaldot chain/account state.")
    add_common_args(parser)
    parser.add_argument("--account", help="SS58 account address to query. Defaults to signer.")
    args = parser.parse_args()

    portaldot = connect(args.url, args.ss58, args.type_registry_preset)
    keypair = keypair_from_seed(args.seed, args.ss58)
    account = args.account or keypair.ss58_address

    print(f"Connected chain: {portaldot.chain}")
    print(f"Endpoint: {args.url}")
    print(f"Account: {account}")
    print(f"Token: {portaldot.properties.get('tokenSymbol', 'UNIT')}")

    result = portaldot.query("System", "Account", [account])
    print_json("System.Account", result.value)

    decimals = int(portaldot.properties.get("tokenDecimals", 14))
    free = int(result.value["data"]["free"])
    print(f"Free balance: {free / 10**decimals:.6f} {portaldot.properties.get('tokenSymbol', 'POT')}")


if __name__ == "__main__":
    raise SystemExit(run_cli(main))
