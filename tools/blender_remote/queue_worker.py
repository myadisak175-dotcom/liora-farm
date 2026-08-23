#!/usr/bin/env python3
"""Liora Blender Remote queue worker.

Runs on the same machine as Blender + BlenderMCP. It polls the local git clone,
forwards queued JSON commands to BlenderMCP on localhost, then writes results
back to the repository.

The BlenderMCP TCP port stays private. Git is the cross-device control plane.
"""

from __future__ import annotations

import base64
import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REMOTE_DIR = ROOT / "tools" / "blender_remote"
QUEUE_DIR = REMOTE_DIR / "queue"
RESULT_DIR = REMOTE_DIR / "results"
PROCESSED_DIR = REMOTE_DIR / "processed"

BLENDER_HOST = os.getenv("BLENDER_HOST", "127.0.0.1")
BLENDER_PORT = int(os.getenv("BLENDER_PORT", "9876"))
POLL_SECONDS = max(2, int(os.getenv("BLENDER_REMOTE_POLL", "5")))
ALLOW_CODE = os.getenv("BLENDER_REMOTE_ALLOW_CODE", "0") == "1"

# Commands confirmed by the upstream BlenderMCP add-on plus optional provider
# handlers. Editing through arbitrary bpy is kept behind an explicit host flag.
SAFE_TYPES = {
    "get_scene_info",
    "get_object_info",
    "get_viewport_screenshot",
    "get_polyhaven_status",
    "get_polyhaven_categories",
    "search_polyhaven_assets",
    "download_polyhaven_asset",
    "set_texture",
    "get_hyper3d_status",
    "create_rodin_job",
    "poll_rodin_job_status",
    "import_generated_asset",
    "get_sketchfab_status",
    "search_sketchfab_models",
    "get_sketchfab_model_preview",
    "download_sketchfab_model",
    "get_hunyuan3d_status",
    "create_hunyuan_job",
    "poll_hunyuan_job_status",
    "import_generated_asset_hunyuan",
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

    # The Blender add-on calls this direct socket command `execute_code`.
    if command_type == "execute_code":
        if not ALLOW_CODE:
            raise PermissionError(
                "execute_code is disabled. Set BLENDER_REMOTE_ALLOW_CODE=1 on "
                "the Blender host only if arbitrary bpy execution is intentional."
            )
    elif command_type not in SAFE_TYPES:
        raise PermissionError(f"Command type '{command_type}' is not allowlisted")

    params = payload.get("params", {})
    if not isinstance(params, dict):
        raise ValueError("'params' must be an object")


def send_to_blender(payload: dict, timeout: float = 120.0) -> dict:
    """Forward one BlenderMCP JSON command over its local TCP socket."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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


def extract_preview(request_id: str, response: dict) -> str | None:
    """Persist BlenderMCP screenshot base64 as a normal PNG in results/."""
    if not isinstance(response, dict):
        return None

    result = response.get("result")
    if not isinstance(result, dict):
        return None

    image_b64 = result.pop("image_base64", None)
    if not image_b64:
        return None

    image_format = str(result.get("format", "png")).lower()
    extension = "jpg" if image_format in {"jpg", "jpeg"} else "png"
    preview_path = RESULT_DIR / f"{request_id}.{extension}"
    preview_path.write_bytes(base64.b64decode(image_b64))
    return str(preview_path.relative_to(ROOT))


def process_file(path: Path) -> None:
    request_id = path.stem
    output = {
        "request_id": request_id,
        "started_at": utc_now(),
        "finished_at": None,
        "status": "error",
        "request": None,
        "response": None,
        "preview": None,
        "error": None,
    }

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        output["request"] = payload
        validate_request(payload)
        response = send_to_blender(payload)
        output["preview"] = extract_preview(request_id, response)
        output["response"] = response
        output["status"] = "success"
    except Exception as exc:  # Record failures rather than killing the daemon.
        output["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        output["finished_at"] = utc_now()

    result_path = RESULT_DIR / f"{request_id}.json"
    result_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    path.replace(PROCESSED_DIR / path.name)

    run_git("add", "-A", str(REMOTE_DIR.relative_to(ROOT)))
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
