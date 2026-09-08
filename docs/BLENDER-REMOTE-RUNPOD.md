# Liora Blender Remote B — RunPod Host

This is the phone-first Blender host for Liora. Blender runs on a cloud Pod under a virtual display; the BlenderMCP TCP socket is localhost-only and is never exposed to the internet. Commands and results travel through the GitHub queue in `tools/blender_remote/`.

## Recommended first host

- Provider: RunPod Pod
- Image: `ubuntu:24.04`
- GPU: RTX A5000 Community Cloud (or any available low-cost GPU)
- Persistent volume: 20 GB mounted at `/workspace`
- Exposed HTTP ports: none
- Exposed TCP ports: none required by Blender Remote
- Arbitrary Blender Python: disabled for the first smoke test

The GPU is intentionally modest: mesh inspection, decimation, UV-safe processing and viewport previews do not need a high-end accelerator. A larger GPU can be selected later for rendering or AI model generation.

## One secret required

Create a fine-grained GitHub token scoped only to `myadisak175-dotcom/liora-farm` with repository **Contents: Read and write**. Do not paste this token into chat or commit it to GitHub.

In RunPod, create a Secret named `liora_github_token`, then expose it to the Pod as:

```text
LIORA_GITHUB_TOKEN={{ RUNPOD_SECRET_liora_github_token }}
```

## Pod environment variables

```text
LIORA_GITHUB_TOKEN={{ RUNPOD_SECRET_liora_github_token }}
LIORA_REMOTE_BRANCH=feature/blender-remote-b
BLENDER_REMOTE_ALLOW_CODE=0
BLENDER_REMOTE_POLL=5
DISABLE_TELEMETRY=true
```

`BLENDER_REMOTE_ALLOW_CODE=0` keeps arbitrary `bpy` execution locked while the transport is being verified.

## Start command

Use this as the Pod start command:

```bash
bash -lc 'apt-get update && apt-get install -y curl ca-certificates && curl -fsSL https://raw.githubusercontent.com/myadisak175-dotcom/liora-farm/feature/blender-remote-b/tools/blender_remote/runpod_bootstrap.sh | bash'
```

The bootstrap will:

1. Install Blender, Xvfb, Git, Python and `uv`.
2. Clone the Blender Remote branch into `/workspace/liora-farm`.
3. Install the matching BlenderMCP addon.
4. Start the GitHub queue worker.
5. Start GUI Blender inside Xvfb — not Blender background mode.
6. Enable BlenderMCP and disable telemetry consent.
7. Keep BlenderMCP bound to `127.0.0.1:9876` only.

## Automatic first test

Three safe requests are already staged in the queue:

- `0001-ping.json`
- `0002-scene-info.json`
- `0003-viewport.json`

When the host is healthy it will move each request to `processed/`, create a JSON result in `results/`, and create a PNG for the viewport test. The worker then pushes those files back to the same GitHub branch.

## After the smoke test passes

The next gate is to enable controlled Blender editing. Do not flip `BLENDER_REMOTE_ALLOW_CODE=1` until the read-only smoke test has passed. Once enabled, ChatGPT can enqueue carefully scoped `execute_code` operations for tasks such as:

- inspect mesh topology and UV layers;
- import GLB/GLTF;
- apply conservative Decimate modifiers;
- create LOD variants;
- resize/pack textures;
- fix transforms/origins;
- export GLB;
- capture a viewport preview for visual review.

The final workflow becomes:

```text
Phone / ChatGPT
      ↓
GitHub command queue
      ↓
RunPod Blender + BlenderMCP (localhost only)
      ↓
JSON result + viewport preview + exported assets
      ↓
GitHub
      ↓
Liora / Three.js
```

## Security rules

- Never expose port `9876` publicly.
- Keep the GitHub token in RunPod Secrets only.
- Keep the token repository-scoped and grant only the permissions the worker needs.
- Leave telemetry disabled unless explicitly chosen otherwise.
- Leave arbitrary code disabled until the transport and identity are verified.
- Stop the Pod when not in use to avoid unnecessary cloud charges.
