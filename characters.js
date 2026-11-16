// characters.js
// The playable characters: VRoid Studio's sample avatars (pixiv, CC0), made playable for this game. Each one is three files
// in assets/characters/: <id>.glb (the model, by tools/prep-vroid.py), <id>.springs.json (hair and cloth that swing, by
// tools/bake-character-springs.py) and <id>.webp (the face shown in the picker). All of them move with the same clips
// (character-anim.js), fitted to each model's own proportions by stylized-character.js.
//
//   CHARACTERS                                     [{ id, name }], in the picker's order
//   faceOf(id)                                     the face picture's URL
//   const ch = await loadPlayable(id, CHARACTER_ANIM, { height: 1.75 })   // loaded, springs attached, sized

import { loadCharacter } from './stylized-character.js';
import { createSprings } from './character-springs.js';

export const CHARACTERS = [
  { id: 'vivi', name: 'Vivi' },
  { id: 'shino', name: 'Shino' },
  { id: 'shibu', name: 'Shibu' },
  { id: 'darkness-shibu', name: 'Darkness Shibu' },
  { id: 'vita', name: 'Vita' },
  { id: 'victoria', name: 'Victoria' },
  { id: 'fumiriya', name: 'Fumiriya' },
  { id: 'hairsample-f', name: 'HairSample F' },
  { id: 'hairsample-m', name: 'HairSample M' },
];
export const DEFAULT_CHARACTER = 'vivi';

const DIR = 'assets/characters/';
const VERSION = '1';                                  // bump when the files in assets/characters/ are remade
export const faceOf = id => `${DIR}${id}.webp?v=${VERSION}`;

export async function loadPlayable(id, anim, { height = 1.75 } = {}) {
  if (!CHARACTERS.some(c => c.id === id)) throw new Error(`no character "${id}"`);
  const [model, springs] = await Promise.all([
    fetch(`${DIR}${id}.glb?v=${VERSION}`).then(r => { if (!r.ok) throw new Error(`${id}.glb: ${r.status}`); return r.arrayBuffer(); }),
    fetch(`${DIR}${id}.springs.json?v=${VERSION}`).then(r => (r.ok ? r.json() : null)).catch(() => null),   // no springs: stiff hair, still playable
  ]);
  const ch = await loadCharacter(model, anim);
  if (springs) ch.attachSprings(createSprings(ch.model, springs));
  ch.setSize(height / ch.baseHeight);
  ch.id = id;
  return ch;
}
