# Blender Remote Queue

This directory is intentionally empty during normal idle operation.

Commands are JSON files named `<request-id>.json`. The Blender host worker processes them, moves them to `../processed/`, and writes responses to `../results/`.
