from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCAL_NODE = ROOT / ".local-node" / "latest-node" / "portaldot_dev"


def default_command() -> str:
    if LOCAL_NODE.is_file():
        return f'"{LOCAL_NODE}" --dev --alice'
    return "portaldot_dev --dev --alice"


DEFAULT_COMMAND = default_command()
DEFAULT_LOG_FILE = ROOT / "front-end" / "public" / "node-log.json"


def classify_level(line: str) -> str:
    lowered = line.lower()
    if any(keyword in lowered for keyword in ("error", "panic", "fatal", "failed", "unable")):
        return "error"
    if any(keyword in lowered for keyword in ("warn", "deprecated")):
        return "warning"
    if any(keyword in lowered for keyword in ("listening", "started", "running in --dev", "highest known block")):
        return "success"
    return "info"


def write_log_file(log_file: Path, command: str, lines: list[dict[str, str]]) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "command": command,
        "lines": lines,
    }
    temp_file = log_file.with_suffix(".tmp")
    temp_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    os.replace(temp_file, log_file)


def stamp_line(line: str) -> dict[str, str]:
    return {
        "time": datetime.now().strftime("%H:%M:%S"),
        "level": classify_level(line),
        "text": line,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a Portaldot local node and mirror its logs to a JSON file.")
    parser.add_argument("--command", default=DEFAULT_COMMAND, help="Shell command used to launch the node.")
    parser.add_argument("--log-file", default=str(DEFAULT_LOG_FILE), help="Path to the JSON log snapshot for the UI.")
    args = parser.parse_args()

    log_file = Path(args.log_file)
    captured_lines: list[dict[str, str]] = []

    print(f"Launching node command: {args.command}")
    print(f"Writing live log snapshot to: {log_file}")
    print("Test POT tip: open https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A9944#/accounts")
    print("Use ALICE -> Send -> paste your address -> enter amount -> Sign (no password needed).")
    print("ALICE has millions of POT, so you can top up as often as needed.")
    write_log_file(log_file, args.command, captured_lines)

    process = subprocess.Popen(
        args.command,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None

    try:
        for raw_line in process.stdout:
            line = raw_line.rstrip("\r\n")
            if not line:
                continue
            stamped = stamp_line(line)
            captured_lines.append(stamped)
            print(f"[{stamped['time']}] {line}")
            write_log_file(log_file, args.command, captured_lines)
    except KeyboardInterrupt:
        process.terminate()
        raise
    finally:
        return_code = process.wait()
        write_log_file(log_file, args.command, captured_lines)
        print(f"Node process exited with code {return_code}")

    return return_code


if __name__ == "__main__":
    raise SystemExit(main())