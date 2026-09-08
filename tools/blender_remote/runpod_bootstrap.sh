#!/usr/bin/env bash
set -euo pipefail

# Liora Blender Remote B - RunPod bootstrap
# Designed for an Ubuntu 24.04 Pod with a persistent /workspace volume.
# No Blender/MCP/network port is exposed. GitHub is the only remote control plane.

REPO_URL="${LIORA_REPO_URL:-https://github.com/myadisak175-dotcom/liora-farm.git}"
BRANCH="${LIORA_REMOTE_BRANCH:-feature/blender-remote-b}"
WORKDIR="${LIORA_WORKDIR:-/workspace/liora-farm}"
POLL="${BLENDER_REMOTE_POLL:-5}"

export DISABLE_TELEMETRY="${DISABLE_TELEMETRY:-true}"
export BLENDER_REMOTE_ALLOW_CODE="${BLENDER_REMOTE_ALLOW_CODE:-0}"
export BLENDER_HOST="127.0.0.1"
export BLENDER_PORT="9876"
export BLENDER_REMOTE_POLL="$POLL"

if [[ -z "${LIORA_GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: LIORA_GITHUB_TOKEN is required so the worker can push results back." >&2
  echo "Store it as a RunPod Secret; do not hardcode it into this script." >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  blender \
  xvfb \
  git \
  curl \
  ca-certificates \
  python3
rm -rf /var/lib/apt/lists/*

# Install uv in the Pod user's home. The BlenderMCP package bundles the matching
# addon, so the server and addon stay on the same release.
if ! command -v uvx >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

mkdir -p /workspace
if [[ -d "$WORKDIR/.git" ]]; then
  git -C "$WORKDIR" fetch origin "$BRANCH"
  git -C "$WORKDIR" checkout "$BRANCH"
  git -C "$WORKDIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$WORKDIR"
fi

git -C "$WORKDIR" config user.name "Liora Blender Remote"
git -C "$WORKDIR" config user.email "blender-remote@users.noreply.github.com"

BLENDER_MM="$(blender --version | awk 'NR==1 {split($2,v,"."); print v[1]"."v[2]}')"
ADDONS_DIR="$HOME/.config/blender/$BLENDER_MM/scripts/addons"
mkdir -p "$ADDONS_DIR"
BLENDERMCP_ADDONS_DIR="$ADDONS_DIR" uvx blender-mcp install-addon

STARTUP_PY="/workspace/liora_blender_remote_startup.py"
cat > "$STARTUP_PY" <<'PY'
import bpy
import addon_utils

MODULE = "blender_mcp"


def configure_remote():
    try:
        _default, loaded = addon_utils.check(MODULE)
        if not loaded:
            addon_utils.enable(MODULE, default_set=True, persistent=True)

        addon = bpy.context.preferences.addons.get(MODULE)
        if addon and hasattr(addon.preferences, "telemetry_consent"):
            # Liora Remote defaults to private operation. Upstream telemetry is
            # opt-in for this deployment even though the addon default is true.
            addon.preferences.telemetry_consent = False

        scene = bpy.context.scene
        if hasattr(scene, "blendermcp_auto_start_server"):
            scene.blendermcp_auto_start_server = True

        running = bool(getattr(scene, "blendermcp_server_running", False))
        if not running and hasattr(bpy.ops, "blendermcp"):
            try:
                bpy.ops.blendermcp.start_server()
            except Exception as exc:
                print(f"Liora Remote: MCP start operator reported: {exc}", flush=True)

        try:
            bpy.ops.wm.save_userpref()
        except Exception:
            pass

        print("Liora Remote: BlenderMCP configured; telemetry consent disabled.", flush=True)
    except Exception as exc:
        print(f"Liora Remote startup error: {type(exc).__name__}: {exc}", flush=True)
    return None


# Wait for the GUI workspace and View3D context to exist before touching the addon.
bpy.app.timers.register(configure_remote, first_interval=2.0)
PY

# Worker stays separate from Blender. BlenderMCP itself is reachable only on
# localhost:9876 and is never published by RunPod.
cd "$WORKDIR"
python3 tools/blender_remote/queue_worker.py \
  > /workspace/liora-blender-worker.log 2>&1 &
WORKER_PID=$!

echo "$WORKER_PID" > /workspace/liora-blender-worker.pid

echo "Liora Blender Remote starting"
echo "  branch: $BRANCH"
echo "  Blender: $(blender --version | head -n1)"
echo "  worker PID: $WORKER_PID"
echo "  arbitrary code: $BLENDER_REMOTE_ALLOW_CODE"
echo "  telemetry disabled: $DISABLE_TELEMETRY"

cleanup() {
  kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# BlenderMCP explicitly requires a GUI/virtual display rather than `blender -b`.
# Xvfb provides that display without exposing a remote desktop to the internet.
exec xvfb-run -a -s "-screen 0 1920x1080x24" \
  blender --python "$STARTUP_PY"
