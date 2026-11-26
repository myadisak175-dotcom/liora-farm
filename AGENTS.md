# Notes for agents working on this repo

> บันทึกส่งต่องานระหว่าง agent (Claude, Codex หรือตัวไหนก็ตาม): อ่านก่อนเริ่มงาน และเขียนต่อท้ายใน "Log" ทุกครั้งที่ทำงานเสร็จ

Whoever works here, Claude, Codex or anyone else: read this first, the newest entries of the log at the bottom most of all. When you finish a piece of work, add an entry: what you changed, on which branch, what is left. Keep it short. The long story of every part of the game is in `README.md`; this file is what the next agent needs in order to carry on.

## Branches

- `main` is what GitHub Pages serves: the game the user plays, on a phone, at https://myadisak175-dotcom.github.io/liora-farm/ (each trial behind its own `?flag`).
- `backup/main-2026-11-26-farm` is `main` exactly as it stood once the farm went in (`ba64ad6`), kept in case anything goes wrong after it (the user asked for it: "เก็บเมนแยกไว้ก่อน"). To put `main` back as it was there: `git push --force origin backup/main-2026-11-26-farm:main` (only when the user says so: it throws away whatever came after).
- **How work lands** (the user, 26 Nov 2026: "แยกดีกว่าคะ จะได้แก้ง่ายๆ", then "เข้า main ก็ได้"): each piece of work on a branch of its own, named for it (no slash), merged into `main` through a pull request as soon as it is done, so it is in the game's link at once. One pull request for each piece, so a piece that goes wrong is undone by itself (Revert on its pull request), the rest left standing. Note the branch in the log below.
- Branches with work not in `main`, as of 26 Nov 2026: `guild-in-village` and `guild-hall` (25 Nov: the guild where the keep stood, its receptionist NPC; behind `main` now, so it needs `main` merged in first). The `agent/*` branches, the dated ones and the older `backup/*` ones, from Aug–Sep 2026, belong to an older version of the game.

## Not stepping on each other

Two agents can work at once. Git does not let one undo the other by itself (GitHub will not merge a pull request with a conflict), but a conflict settled carelessly can throw away a whole feature. So:

- When you start, open your pull request at once, as a draft, its title saying what you are doing: the open pull requests are what is being worked on now (`gh api repos/myadisak175-dotcom/liora-farm/pulls`). Look at them first: if another agent is in the same files right now, tell the user before you go on. Its line in the log below goes in with it.
- Before you start, and again before you merge: bring `main` into your branch (`git merge origin/main`) and try the game.
- A conflict: keep both sides. Never take one side of `index.html`, `hill-village-level.js` or `README.md` whole: they hold everyone's work. In the import map give the file a number higher than either side had (the same number on both sides with different files behind it, and phones keep the old one).
- The map's files (`assets/heightmaps/*`, `assets/maps/*`) are made by `tools/make-hill-village-heightmap.py` and `tools/make-hill-village-map.py`: when both sides changed the tools or the map, run the tools again after the merge.
- Known now (26 Nov 2026): `guild-in-village` against `main` meets at 7 places, 4 in `index.html` and 3 in `hill-village-level.js`, every one both sides adding lines at the same spot (the import map; the ground's paint, where the farm's cut grass and the guild's trodden earth go; the level's list of what it hands the game; `setSun`; the frame loop). Keep both everywhere; `hill-village-level.js` then a number higher than both sides' (`main` has had 71 since the forest floor's second set: so 72), `village-kit.js` `?v=bridge3guild3`; then run the map tools (`main`'s tools lay paving as a way, the guild's map files were made without that). Nothing of the guild touches taps or the left of the screen, and it stands in the village, away from the farm.

## Working with the user

- Thai, short and plain. They read the game, not the code: say what they will see and where to tap, and give the link.
- Before building something new, ask what they want (a quick question with a few choices works well). "เบรกก่อนนะ" means stop and lay out the tradeoffs before going on.
- Nothing they did not ask for: no extra tools or features. One job per file.
- Character animation holds to the magic jump's standard (`README.md`: "The animation standard").

## How the game is put together

- No build step. `index.html` loads three.js r170 from jsDelivr through its import map, and every module of the game through the same map with `?v=N`: when you change a file, raise its `N` (phones keep the old one otherwise). A page of its own (`soil.html`, `parry.html` …) has its own map.
- Each file does one job; its header comment says what, and how to call it. New things are tried first on a page of their own or behind a `?flag` in the game, and go in for good when the user says so.
- The map the game opens on is the hill village: `hill-village-level.js` lays it out from `assets/heightmaps/hill-village.json` (made by `tools/make-hill-village-heightmap.py`); `index.html` wires the game; `player-moves.js` her moves; `player-input.js` the touch screen (left 45 %: the stick; right: the camera; a quick touch that does not drag, on either side: a tap).
- Two traps:
  - The ground map (`stylized-grassfield.js`, `createGroundMap`: 1280 × 1280, its alpha is how much grass grows) is sent to the GPU whole every time it changes: change it once per change, not every frame. When the sun moves, the level draws its shadows again (`map.beginCast` / `stepCast`) and swaps the whole picture back as it was when that began: anything stamped into it since must be stamped again (`liveOps` for painted ways, `farm.soil.restamp()`).
  - `index.html` gives every material in the scene the clouds' shade and the hour's light once, at `shadows.apply(scene)`. Anything put in the scene after that stays at noon's light all night: add it before, or call `shadows.apply(obj)`.
- Testing without a phone: serve the folder (`python3 -m http.server`) and use Playwright with Chrome and SwiftShader (route `cdn.jsdelivr.net` to a local `three@0.170.0`). The game hands itself to tests as `window.__game` (`level`, `player`, `camera`, `renderer`, `farmTools`, `pathBrush` …); `player.teleport(x, z, yaw)` puts her somewhere; `pathBrush.open()` and its `_state().cam` give a camera from above. A SwiftShader frame takes seconds, so the game's own tap (finger down and up within 320 ms) never counts there: call `farmTools.tap(origin, dir)` with a ray from the camera instead.

## Her farm (in the game behind `?farm=1`; `?farm=new`: from the start)

- Where: south of the road in, about 20 m from where she starts: 22 × 14 squares of a metre, x −73 to −51, z 78 to 92 (`FARM` in `hill-village-level.js`; not yet in the map's plan, nor on the minimap).
- Files: `farm-soil.js` the ground (each square tilled, wet, magic or cursed; painted furrows that stand up); `farm-debris.js` what lies on it before it is dug (weeds, rocks, branches, stumps; drawn together, about 20 draws for 180 things); `farm-tools.js` what she does (the tool bar, taps, the farm as it begins, kept in `localStorage` as `liora.farm.v1`); `hill-village-level.js` lays the ground and the things (`level.farm`); `index.html` wires the tools in (a tap goes to the farm first, then the water). `soil.html` is the trial page for the soil and the debris, every state on show.
- Tools: 🪄 clear (water splash; a stone takes 2 casts, a boulder or a stump 3), ⛏ dig, 💧 water, 🌧 rain (a 1.8 m patch), ✨ magic, 🌱 lift the curse. A tool is used on a square within 7 m of her. The farm begins overgrown, the corner by the road clear, a cursed patch with thorns toward the far corner. A watered square dries in a day of the game (12 minutes).
- Cost: at the farm 379 draws against 350 for the same view without it.
- Not done yet: crops; anything got for what is cleared; her own move when she casts (she does not turn or raise a hand: only the magic shows where it lands; to be made to the magic jump's standard); the farm in the plan and on the minimap; a try on a real phone.

## Log (newest first)

- **26 Nov 2026 · Claude · `forest-floor-path` → `main` (#110)** — The wood's floor in two sets (`tools/make-forest-paint.py path | damp`): in the ways' own earth, the game's (`?forest=1`, `assets/ground/forest-path-paint.webp`), and the first, dark and damp, kept for a zone of ancient ruins (`?forest=damp`, `assets/ground/forest-damp-paint.webp`; the user: too dark here, "แต่ว่าสวย เก็บไว้ใช้ต่อได้ เผื่อทำโซนโบราณสถาน"). `assets/ground/forest-paint.webp` is gone (the dark set under its new name, the same picture).
- **26 Nov 2026 · Claude · `forest-floor` → `main` (#109)** — A wood's floor under the groves, a trial behind `?forest=1`: dark earth, dry leaves, moss in patches, the grass there thinner and shorter. `forest-floor.js` says where (a tree with two others within 7.5 m: 220 of the map's 550), `stylized-terrain.js` (`floor`) paints it, `tools/make-forest-paint.py` made `assets/ground/forest-paint.webp`; the grass thinned in the ground map once the land is built. Not yet: in the game for good (the user says when), a try on a real phone.
- **26 Nov 2026 · Claude · `agents-no-clash` → `main`** — Not stepping on each other (above): the rules, and where `guild-in-village` meets `main` (a merge tried without touching anything).
- **26 Nov 2026 · Claude · `agents-workflow` → `main`** — How work lands, from now on (Branches, above): a branch and a pull request for each piece, merged at once.
- **26 Nov 2026 · Claude · `main`** — This file (`AGENTS.md`, and `CLAUDE.md` pointing at it) and the backup branch `backup/main-2026-11-26-farm` (`main` at `ba64ad6`). From now on every agent adds its work here.
- **26 Nov 2026 · Claude · `main` (`ba64ad6`)** — Her farm in the game, `?farm=1` (above). Also `player-input.js`: a quick touch on the stick's side is a tap now, for the whole game (the stick shows a moment; she does not move).
- **26 Nov 2026 · Claude · `main` (`b2409a7`, `55e64f2`, `57d119e`)** — The farm's soil and what lies on it, tried on `soil.html` first.
- **26 Nov 2026 · Claude · `main` (`753231c`, `2703bc3`, `7a3b2ff`)** — Paving, หินปู: a 🪨 brush in the path painter lays flat stones in the ways, the game's grass and plants coming up between them (`ground-paths.js`, `path-edits.js`, `path-brush.js`; `?pave=demo` paves the market and the yards to look at).
