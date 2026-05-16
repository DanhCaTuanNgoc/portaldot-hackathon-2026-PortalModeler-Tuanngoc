from __future__ import annotations

import argparse
import json
from pathlib import Path
from string import Template


CONTRACT_TEMPLATE = Template(
    """#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod ${module_name} {
    #[ink(storage)]
    pub struct ${contract_name} {
        // TODO: replace with generated state mappings.
    }

    impl ${contract_name} {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {}
        }

${messages}
    }
}
"""
)


README_TEMPLATE = Template(
    """# ${contract_name}

Generated from `${model_path}`.

## Actors

${actors}

## States

${states}

## Actions

${actions}

## Events

${events}

## Deploy Checklist

- [ ] Run `cargo contract build --release`
- [ ] Run `python scripts/query.py` and confirm the signer has POT
- [ ] Run `python scripts/deploy.py --metadata <metadata.json> --wasm <contract.wasm>`
- [ ] Run `python scripts/call.py --action join --value <join_fee>`
- [ ] Run `python scripts/call.py --action is_member`
"""
)


def bullet(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) or "- None"


def render_messages(actions: list[dict]) -> str:
    blocks = []
    for action in actions:
        name = action["name"]
        blocks.append(
            f"""        #[ink(message)]
        pub fn {name}(&mut self) {{
            // actor: {action.get("actor", "Unknown")}
            // requires: {action.get("requires", "None")}
            // emits: {action.get("emits", "None")}
            todo!("implement {name}");
        }}"""
        )
    return "\n\n".join(blocks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a minimal ink! skeleton from a PortalModeler JSON model.")
    parser.add_argument("model", type=Path)
    parser.add_argument("--out", type=Path, default=Path("generated"))
    args = parser.parse_args()

    model = json.loads(args.model.read_text(encoding="utf-8"))
    contract_name = model["contract"]
    module_name = contract_name.lower()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    states = model.get("states", [])
    actions = model.get("actions", [])
    events = model.get("events", [])

    (out / "lib.rs").write_text(
        CONTRACT_TEMPLATE.substitute(
            module_name=module_name,
            contract_name=contract_name,
            messages=render_messages(actions),
        ),
        encoding="utf-8",
    )

    (out / "ACTIONS.md").write_text(
        "# Actions\n\n"
        + bullet(
            [
                f"`{action['name']}`: {action.get('actor', 'Unknown')} -> requires {action.get('requires', 'None')} -> emits {action.get('emits', 'None')}"
                for action in actions
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    (out / "EVENTS.md").write_text(
        "# Events\n\n"
        + bullet([f"`{event['name']}` fields: {', '.join(event.get('fields', []))}" for event in events])
        + "\n",
        encoding="utf-8",
    )

    (out / "DEPLOY_CHECKLIST.md").write_text(
        "# Deploy Checklist\n\n"
        "- [ ] Build contract artifacts\n"
        "- [ ] Query signer balance\n"
        "- [ ] Deploy contract\n"
        "- [ ] Call action\n"
        "- [ ] Read result and events\n",
        encoding="utf-8",
    )

    (out / "README.md").write_text(
        README_TEMPLATE.substitute(
            contract_name=contract_name,
            model_path=args.model.as_posix(),
            actors=bullet(model.get("actors", [])),
            states=bullet([f"`{state['name']}`: {state.get('type', 'unknown')}" for state in states]),
            actions=bullet([f"`{action['name']}` by {action.get('actor', 'Unknown')}" for action in actions]),
            events=bullet([f"`{event['name']}`" for event in events]),
        ),
        encoding="utf-8",
    )

    print(f"Generated files in {out}")


if __name__ == "__main__":
    main()
