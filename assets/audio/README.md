# Liora Farm — Audio Foundation v4

Short footsteps are decoded into Web Audio buffers. The longer music and ambience files stream through native media-element output, which avoids both keeping several minutes of decoded audio in mobile RAM and the silent `MediaElementSource` path seen on some Android devices. Morning/day birds and evening/night forest ambience crossfade from the in-game clock; synthesized calls remain only as a fallback if an ambience stream cannot start.

| Runtime file | Supplied source filename | Use |
|---|---|---|
| `music_lanternfields_overture.mp3` | `Lanternfields Overture (1).mp3` | Looped background music |
| `ambience_morning_birdsong.mp3` | `creative_spark-morning-birdsong-246402.mp3` | Morning and daytime bird ambience |
| `ambience_forest_night.mp3` | `eryliaa-forest-wind-with-crickets-and-cuckoo-355613.mp3` | Evening and night forest ambience; source level raised for mobile playback |
| `footstep_grass_soft.mp3` | `freesounds123-walking-on-grass-363353.mp3` | Soft grass walking impact used by the game |
| `footstep_grass_run_clean.mp3` | `freesound_community-running-in-grass-6237.mp3` | Grass running sequence used by the game |
| `ambience_night_crickets_clean.mp3` | `freesound_community-city-night-crickets-24013.mp3` | Retained legacy source/reference |
| `ambience_morning_birds_clean.mp3` | `creative_spark-morning-birdsong-246402.mp3` | Retained legacy encode/reference |

`footstep_forest_leaves.mp3` is retained as the original supplied file only; it is not a valid MP3 and must not be loaded by the runtime. Keep the original source filenames/creator names when reviewing attribution or licence requirements. This directory is the compressed runtime set, not the archival masters.
