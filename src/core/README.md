# Liora Engine runtime boundary

`src/core/` is reserved for runtime-wide orchestration that is shared by gameplay zones.

Production rule:
- Runtime systems (`entities`, `systems`, `zones`, `animation`) must not import Editor UI modules.
- The Builder may import runtime systems to preview the world.
- The Builder writes stable map/layout data; gameplay reads that data.
- Three.js object references never belong in persisted map data.

This keeps the playable game lightweight while allowing the Builder to evolve independently.
