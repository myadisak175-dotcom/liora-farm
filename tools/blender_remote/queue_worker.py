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
GITHUB_TOKEN = os.getenv("LIORA_GITHUB_TOKEN", "")
GIT_ASKPASS = REMOTE_DIR / ".git-askpass.sh"

# Direct commands confirmed in the current upstream BlenderMCP add-on.
# Provider commands remain allowlisted for later opt-in integrations.
SAFE_TYPES = {
    "ping",
    "get_scene_info",
    "get_world_state_snapshot",
    "get_addon_info",
    "get_object_info",
    "get_viewport_screenshot",
    "get_telemetry_consent",
    "set_telemetry_consent",
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


def git_env() -> dict[str, str]:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    if GITHUB_TOKEN:
        GIT_ASKPASS.write_text(
            "#!/bin/sh\n"
            "case \"$1\" in\n"
            "  *Username*) echo x-access-token ;;\n"
            "  *) echo \"$LIORA_GITHUB_TOKEN\" ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        GIT_ASKPASS.chmod(0o700)
        env["GIT_ASKPASS"] = str(GIT_ASKPASS)
    return env


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=check,
        env=git_env(),
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


def extract_preview(request_id: str, request: dict, response: dict) -> str | None:
    """Persist a viewport screenshot as a normal image in results/."""
    if not isinstance(response, dict):
        return None

    result = response.get("result")
    if isinstance(result, dict):
        # Some forks/providers return screenshot bytes inline.
        image_b64 = result.pop("image_base64", None) or result.pop("image_data", None)
        if image_b64:
            image_format = str(result.get("format", "png")).lower()
            extension = "jpg" if image_format in {"jpg", "jpeg"} else "png"
            preview_path = RESULT_DIR / f"{request_id}.{extension}"
            preview_path.write_bytes(base64.b64decode(image_b64))
            return str(preview_path.relative_to(ROOT))

    # Current upstream direct socket screenshot writes to the caller-supplied
    # filepath; the MCP stdio server normally reads that file afterward. Our
    # queue worker is the caller, so copy it into the repository ourselves.
    if request.get("type") == "get_viewport_screenshot":
        params = request.get("params", {})
        source_value = params.get("filepath") if isinstance(params, dict) else None
        if source_value:
            source = Path(str(source_value)).expanduser()
            if source.is_file():
                fmt = str(params.get("format", "png")).lower()
                extension = "jpg" if fmt in {"jpg", "jpeg"} else "png"
                preview_path = RESULT_DIR / f"{request_id}.{extension}"
                preview_path.write_bytes(source.read_bytes())
                try:
                    source.unlink()
                except OSError:
                    pass
                return str(preview_path.relative_to(ROOT))

    return None


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
        output["preview"] = extract_preview(request_id, payload, response)
        output["response"] = response
        output["status"] = "success"
    except Exception as exc:
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
        rebase = run_git("pull", "--rebase", check=False)
        if rebase.returncode != 0:
            print(rebase.stderr, file=sys.stderr)
            return
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
        f"poll={POLL_SECONDS}s, arbitrary_code={'on' if ALLOW_CODE else 'off'}, "
        f"git_push={'on' if GITHUB_TOKEN else 'read-only'}"
    )
    while True:
        sync_repo()
        for path in sorted(QUEUE_DIR.glob("*.json")):
            process_file(path)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
