// rocks-layout.js  —  the rocks of the rock test map (rocks-level.js) as placed by hand in the rock editor (rock-editor.js).
//
// null = nothing placed by hand: the map lays its rocks out itself (the cliff dressed by code, the loose rocks, the stones on
// the paths). Once set, this list is the map's rocks instead, all of them.
//
// To make what was placed on a phone the game's for everyone: in the rock editor, ⋯ → "คัดลอกข้อมูล" copies it as text; put
// that object here. (On the device it was placed on it is also kept in the browser, and that copy is used first.)
//
// { v: 1, rocks: [[type, seed, x, z, height above the ground, turn, tip forward, tip sideways, size], ...] }   (metres, degrees)
export const ROCKS_MAP_LAYOUT = null;
