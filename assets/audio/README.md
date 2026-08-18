# Liora Farm — Audio Foundation v8

Short footsteps are decoded into Web Audio buffers. The longer music and ambience files stream through native media-element output, which avoids both keeping several minutes of decoded audio in mobile RAM and the silent `MediaElementSource` path seen on some Android devices. Morning/day birds and evening/night forest ambience crossfade from the in-game clock; synthesized calls remain only as a fallback if an ambience stream cannot start.

**Levels.** iOS ignores writes to `HTMLMediaElement.volume`, so on an iPhone every long track used to play at full level at once and mute left them audible. The runtime probes once whether a volume write sticks: if it does the crossfade stays on element volume (Android, desktop), and if it does not the elements are routed through Web Audio gain nodes instead. A track the mix has faded out is also stopped outright rather than left running at zero, which is the only way to silence one where volume is read-only — and it stops a silent night track from streaming all day on someone's data.

**Recovery.** If Android blocks the first media start, later game touches retry the long tracks. A track the browser refused, or that a phone call or another app paused, is picked up by a retry pass a few seconds later without waiting for the player to find the sound button; a file that is genuinely missing is retried a few times and then left alone.

**The player's choice sticks.** Turning sound off is remembered across a world switch — switching worlds is a full page reload, and it used to bring the music back every time. Ordinary game touches never override that choice, and the music resumes near where it left off instead of restarting the same opening bars.

Every world-switch URL carries the current release revision so returning to the default world cannot revive an older cached audio bootstrap. The ground-paint splat map selects grass, dirt or hard-ground running banks at each foot plant; water depth selects a compact eight-splash bank. Tree wind remains a low, slowly breathing native stream.

The decisions behind all of this — hour weights, crossfade timing, when a track is quiet enough to stop, footstep cadence — live in `src/systems/audio-mix.js` with no DOM attached, and are covered by `tools/test/audio-mix.test.html`. `src/audio-bootstrap-v8.js` owns only the wiring.

| Runtime file | Supplied source filename | Use |
|---|---|---|
| `music_lanternfields_overture.mp3` | `Lanternfields Overture (1).mp3` | Looped background music |
| `ambience_morning_birdsong.mp3` | `creative_spark-morning-birdsong-246402.mp3` | Morning and daytime bird ambience |
| `ambience_forest_night.mp3` | `eryliaa-forest-wind-with-crickets-and-cuckoo-355613.mp3` | Evening and night forest ambience; source level raised for mobile playback |
| `ambience_tree_wind.mp3` | `ลมพัดต้นไม้.mp3` | Low continuous tree-wind layer; compact 46-second crossfaded loop |
| `footstep_grass_soft.mp3` | `freesounds123-walking-on-grass-363353.mp3` | Soft grass walking impact used by the game |
| `footstep_grass_run_clean.mp3` | `freesound_community-running-in-grass-6237.mp3` | Grass running sequence used by the game |
| `footstep_run_dirt.mp3` | `วิ่งบนพื้นดิน.mp3` | Running bank for dirt, sand and cracked dirt |
| `footstep_run_ground.mp3` | `วิ่งบนพื้น.mp3` | Running bank for rock and cobblestone paths |
| `footstep_water_wade_bank.mp3` | `เดินลุยน้ำ.mp3` | Eight selected splashes packed into 4.5 seconds for depth-aware water steps |
| `footstep_grass_walk.mp3`, `footstep_grass_run.mp3` | earlier grass encodes | Fallbacks only: used if a clean grass file fails to decode |

Every file here is loaded by the runtime. The retained legacy encodes and the
corrupt `footstep_forest_leaves.mp3` were deleted once nothing referenced them —
git history still has them if a source encode is ever needed again. Keep the
original source filenames/creator names above when reviewing attribution or
licence requirements. This directory is the compressed runtime set, not the
archival masters.
