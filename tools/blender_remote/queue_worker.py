#!/usr/bin/env python3
"""Liora Blender Remote queue worker.

Runs on the same machine as Blender + BlenderMCP. It polls GitHub via the local
git clone, forwards queued JSON commands to BlenderMCP on localhost, then writes
results back to the repository.

This intentionally keeps BlenderMCP's TCP port private. Only the git remote is
used as the cross-device control plane.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUEUE_DIR = ROOT / "tools" / "blender_remote" / "queue"
RESULT_DIR = ROOT / "tools" / "blender_remote" / "results"
PROCESSED_DIR = ROOT / "tools" / "blender_remote" / "processed"

BLENDER_HOST = os.getenv("BLENDER_HOST", "127.0.0.1")
BLENDER_PORT = int(os.getenv("BLENDER_PORT", "9876"))
POLL_SECONDS = max(2, int(os.getenv("BLENDER_REMOTE_POLL", "5")))
ALLOW_CODE = os.getenv("BLENDER_REMOTE_ALLOW_CODE", "0") == "1"

SAFE_TYPES = {
    "get_scene_info",
    "get_object_info",
    "get_viewport_screenshot",
    "create_object",
    "modify_object",
    "delete_object",
    "set_material",
    "set_texture",
    "import_model",
    "export_scene",
}


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=check
    )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    for directory in (QUEUE_DIR, RESULT_DIR, PROCESSED_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def validate_request(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Request must be a JSON object")
    command_type = payload.get("type")
    if not isinstance(command_type, str) or not command_type:
        raise ValueError("Missing non-empty 'type'")
    if command_type == "execute_blender_code":
        if not ALLOW_CODE:
            raise PermissionError(
                "execute_blender_code is disabled. Set BLENDER_REMOTE_ALLOW_CODE=1 "
                "on the Blender host only if you intentionally want arbitrary bpy execution."
            )
    elif command_type not in SAFE_TYPES:
        raise PermissionError(f"Command type '{command_type}' is not allowlisted")

    params = payload.get("params", {})
    if not isinstance(params, dict):
        raise ValueError("'params' must be an object")


def send_to_blender(payload: dict, timeout: float = 120.0) -> dict:
    """Forward one BlenderMCP JSON command over its local TCP socket.

    BlenderMCP documents JSON-over-TCP on port 9876. We keep the socket local
    and read until a complete JSON value is received or the peer closes.
    """
    data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
    chunks: list[bytes] = []

    with socket.create_connection((BLENDER_HOST, BLENDER_PORT), timeout=10) as sock:
        sock.settimeout(timeout)
        sock.sendall(data)
        while True:
            try:
                chunk = sock.recv(65536)
            except socket.timeout:
                break
            if not chunk:
                break
            chunks.append(chunk)
            raw = b"".join(chunks).strip()
            try:
                return json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                continue

    raw = b"".join(chunks).strip()
    if not raw:
        raise RuntimeError("BlenderMCP returned no response")
    return json.loads(raw.decode("utf-8"))


def process_file(path: Path) -> None:
    request_id = path.stem
    started = utc_now()
    output = {
        "request_id": request_id,
        "started_at": started,
        "finished_at": None,
        "status": "error",
        "request": None,
        "response": None,
        "error": None,
    }

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        output["request"] = payload
        validate_request(payload)
        output["response"] = send_to_blender(payload)
        output["status"] = "success"
    except Exception as exc:  # Worker must record failures, not crash the loop.
        output["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        output["finished_at"] = utc_now()

    result_path = RESULT_DIR / f"{request_id}.json"
    result_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    path.replace(PROCESSED_DIR / path.name)

    run_git("add", str(result_path.relative_to(ROOT)), str((PROCESSED_DIR / path.name).relative_to(ROOT)), "-A", str(path.relative_to(ROOT)))
    commit = run_git("commit", "-m", f"Blender remote result: {request_id}", check=False)
    if commit.returncode == 0:
        push = run_git("push", check=False)
        if push.returncode != 0:
            print(push.stderr, file=sys.stderr)
    elif "nothing to commit" not in (commit.stdout + commit.stderr).lower():
        print(commit.stderr, file=sys.stderr)


def sync_repo() -> None:
    pull = run_git("pull", "--ff-only", check=False)
    if pull.returncode != 0:
        print(pull.stderr, file=sys.stderr)


def main() -> int:
    ensure_dirs()
    print(
        f"Blender Remote worker: {BLENDER_HOST}:{BLENDER_PORT}, "
        f"poll={POLL_SECONDS}s, arbitrary_code={'on' if ALLOW_CODE else 'off'}"
    )
    while True:
        sync_repo()
        for path in sorted(QUEUE_DIR.glob("*.json")):
            process_file(path)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
