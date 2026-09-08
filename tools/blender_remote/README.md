# Blender Remote B

Goal: control a real Blender session from a phone-first ChatGPT workflow without exposing Blender's raw control socket to the internet.

## Architecture

```text
Phone / ChatGPT
      |
      | natural-language request
      v
GitHub command queue
      |
      | git pull (about every 5s)
      v
queue_worker.py  -- localhost TCP -->  BlenderMCP addon  -->  Blender
      |
      | result JSON + optional preview image
      v
GitHub results
      |
      v
ChatGPT can inspect the result and send the next command
```

The important design choice is that BlenderMCP stays bound to `127.0.0.1:9876`. The public control plane is GitHub, where normal repository authentication and history apply.

## Why this route

As of August 2026, full custom MCP write/modify support in ChatGPT is not available to personal Plus accounts and custom MCP apps are web-only. This bridge lets the existing GitHub connection act as the remote command channel instead.

## Upstream engine

Use the maintained BlenderMCP project:

- Repository: `MCPBlender/blender-mcp`
- Blender side: `addon.py`
- Default local socket: `127.0.0.1:9876`
- Protocol: JSON over TCP using `{ "type": "...", "params": {...} }`

Do not expose port 9876 directly to the public internet. BlenderMCP's `execute_code` handler can execute arbitrary Python inside the Blender process.

## Host setup

Recommended baseline for Liora assets: Blender 4.5 LTS. Blender 5.2 LTS is newer, but 4.5 is a conservative compatibility target for the current asset pipeline.

On the machine that will run Blender:

1. Install Blender.
2. Install the BlenderMCP `addon.py` from the upstream project.
3. Enable **Interface: Blender MCP** in Blender Preferences.
4. Start BlenderMCP on port `9876`, listening only on localhost.
5. Clone this repository and check out the branch that contains Blender Remote.
6. Make sure that clone can `git pull` and `git push` to GitHub.
7. Start the worker:

```bash
python tools/blender_remote/queue_worker.py
```

Default worker settings:

```text
BLENDER_HOST=127.0.0.1
BLENDER_PORT=9876
BLENDER_REMOTE_POLL=5
BLENDER_REMOTE_ALLOW_CODE=0
```

For advanced editing through generated `bpy` code, intentionally enable:

```bash
BLENDER_REMOTE_ALLOW_CODE=1 python tools/blender_remote/queue_worker.py
```

Only enable that on a host you control. It grants queued commands full Python access inside Blender.

## Command format

Scene inspection:

```json
{
  "type": "get_scene_info",
  "params": {}
}
```

Viewport preview:

```json
{
  "type": "get_viewport_screenshot",
  "params": {
    "max_size": 900,
    "format": "png"
  }
}
```

Advanced Blender edit (disabled by default):

```json
{
  "type": "execute_code",
  "params": {
    "code": "import bpy\nprint(len(bpy.context.scene.objects))"
  }
}
```

Put requests in `tools/blender_remote/queue/<request-id>.json`.

After processing, the worker moves the request to `processed/`, writes `results/<request-id>.json`, saves a PNG/JPG when BlenderMCP returns a viewport screenshot, commits those files, and pushes them to GitHub.

## Intended Liora workflow

Once a Blender host is attached, the user should not have to write JSON. Typical interaction becomes:

```text
User: ลดบ้านนี้เหลือประมาณ 100k tris แต่รักษา UV กับขอบหน้าต่าง
Assistant: inspect scene -> inspect mesh -> execute controlled bpy edit -> request preview -> verify -> export GLB
```

The queue is implementation detail; normal use remains conversational.

## Security

- Keep BlenderMCP on localhost.
- Do not commit API keys or GitHub tokens.
- Keep arbitrary `execute_code` disabled until required.
- Use a dedicated Blender/cloud host rather than a machine containing unrelated sensitive files when enabling arbitrary code.
- Review queued commands and Git history if anything unexpected happens.
