# Clean v6.25 Migration Plan

## Source of truth

Golden reference: `golden-builder-v625` at `239ab09551f178580eea2892312dc0190307160e`.

The approved Builder v6.25 currently depends on a historical wrapper chain. The clean migration removes that chain while preserving behavior.

## Why the current repository feels messy

The repository contains several generations at once:

- production game modules under `src/`
- modular editor experiments under `src/editor/`
- historical Builder wrappers (`v624.html`, `v625.html`)
- camera tests, home tests and smooth-paint tests under `builder/`
- older experiments preserved in Git history

These files are not all part of the same runtime generation. Mixing them directly is the main risk.

## Migration phases

### Phase 0 — Freeze
- Keep `golden-builder-v625` unchanged.
- Work only on `clean-v625-base`.
- No UI redesign yet.

### Phase 1 — Camera + input
Extract the exact approved Play camera behavior:
- one-finger orbit
- pinch zoom
- reset
- follow behavior
- camera-relative joystick movement

Acceptance: camera feel matches Golden v6.25 on mobile.

### Phase 2 — Liora
Extract:
- model loading
- 1.7 m calibration
- idle/walk/run switching
- rotation toward movement
- grounding/depth/shadow behavior

Acceptance: Liora movement looks and feels the same as Golden.

### Phase 3 — Builder core
Extract only behavior, not appearance:
- enter/leave build mode
- asset catalog
- placement
- selection
- move
- rotate
- free scale
- delete
- undo

Acceptance: transforms behave like Golden and no asset sinks.

### Phase 4 — Gameplay metadata
Move v6.24/v6.25 gameplay data into direct modules:
- tree/palm/pine colliders
- crate/barrel/set colliders
- bench sit markers
- fence vault marker
- house compound colliders
- door interaction markers

Acceptance: Liora cannot walk through solid assets and interaction markers stay aligned after transforms.

### Phase 5 — Storage
Define one explicit versioned layout schema and migrate Golden placement data into it.

Acceptance: save/reload gives the same world layout.

### Phase 6 — Ground
First reproduce the Golden ground behavior. Then replace it with the approved Smooth Splat Paint without changing other systems.

Acceptance: smooth edges, no square tiles, undo/save stable.

### Phase 7 — UI
Only after runtime parity:
- build a new mobile UI
- UI imports public APIs from runtime modules
- UI must not contain world/camera/collision logic

## Dependency direction

```text
ui -> game/builder public APIs
builder -> assets + storage + collision
player -> camera/input only through game coordination
camera -> no builder/UI dependency
ground -> no UI dependency
storage -> plain serializable data only
```

## Hard rules

1. No `document.write()` runtime patch chain in the clean version.
2. No fetching old HTML from Git history at runtime.
3. No version-specific behavior patches embedded in UI HTML.
4. No feature work while a subsystem is being migrated.
5. One subsystem = one checkpoint before continuing.
6. Every accepted checkpoint can receive its own backup branch/tag.
