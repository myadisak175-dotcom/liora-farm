# Liora Farm — Clean v6.25 Base

This directory is the clean migration workspace for the approved Builder v6.25 experience.

## Golden reference

- Protected reference branch: `golden-builder-v625`
- Golden checkpoint: `239ab09551f178580eea2892312dc0190307160e`
- Do not refactor or develop directly on the golden branch.

## Goal

Rebuild the approved v6.25 behavior into direct ES modules without the historical HTML patch/wrapper chain.

The clean build must preserve behavior before adding new features.

## Required behavior to preserve

1. Orbit camera: one-finger rotate, pinch zoom, reset.
2. Camera-relative Liora movement.
3. Liora walk/run/idle animation behavior and scale.
4. Play + Build workflow.
5. Asset placement / move / rotate / scale behavior.
6. Grounding so houses, trees and props do not sink.
7. Gameplay collision and interaction data from v6.24/v6.25.
8. Persistent layout/save behavior.
9. Mobile-first touch interaction.

## Clean module boundaries

```text
clean/
├── README.md
└── src/
    ├── game/        # app loop, scene lifecycle, play/build mode
    ├── camera/      # orbit, zoom, follow, reset
    ├── player/      # Liora loading, animation, movement
    ├── builder/     # selection, placement, transforms, undo
    ├── ground/      # ground representation and paint API
    ├── assets/      # catalog, loading, scale metadata, grounding
    ├── collision/   # gameplay colliders and interactions
    ├── storage/     # save/load schema
    └── ui/          # mobile UI only; must not own gameplay logic
```

## Migration rule

Move one subsystem at a time. Do not improve behavior during extraction. First reach parity with Golden v6.25, then make feature/UI changes.

## Feature order after parity

1. Smooth Splat Paint (approved non-square ground paint).
2. New UI layer.
3. World building/content.

Historical experiments under `builder/`, `src/editor/experiments` and other test pages are references only and must not be imported into the clean runtime unless explicitly audited.
