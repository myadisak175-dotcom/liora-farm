/* The buildings of Loria, made by hand (the user, 28 Nov 2026: "ช่วยออกแบบสิ่งก่อสร้างใหม่ค่ะ ไม่ต้องเยอะมาก แต่ใช้ได้จริงๆ
   ใน loria"; asked, she chose homes, a shop and a smithy, an inn, a barn and a pen for animals, more to be added later; to be
   stood in the village as they are, seen from outside; shown on a page of their own first: loria-buildings.html).

   One job: what each building is. Every wall, window, door, chimney and thing of each is set here by hand: no dice, so a
   building is the same every time and has been looked at from every side. kit-houses.js puts them together from the pieces of
   Quaternius' Medieval Village MegaKit (CC0), each piece used as it was made (roofs at their own pitch, the kit's upstairs
   walls upstairs, a stair's landings turned to its flights).

     BUILDINGS                      [{ id, name, about, foot: [x0, z0, x1, z1], door: [x, z, yaw], make() }]: foot is the ground a
                                    building stands on in its own frame, steps, porch and yard and all (the level makes that
                                    much ground flat under it); door: where she stands before its main door, and the way it faces
     buildingDesign(id)             → a design for kit-houses.js:
                                        const kit = await loadKitHouses(), b = kit.builder();
                                        b.house(buildingDesign('inn'), x, y, z, yaw); scene.add(b.build());
                                        kit.measure(buildingDesign('inn'))   → { top, solids: [[x, z, r]] } for her to walk round

   A building's own frame: x to its right, z to its front (its ridge runs front to back), metres; walls stand on a 2 m grid. */
import { ST, EXTRAS as X, paintOf, mulberry } from './kit-houses.js';

const D90 = Math.PI / 2;

// ---- colours: each building one of these (multiplied into the kit's pictures; `grey` lays a tint over grey tiles, `tiles` over
// the kit's own red ones)
const PAINT = {
  red: { name: 'red', plaster: [1.2, 1.12, 0.98], wood: [0.95, 0.9, 0.86], stone: [1.26, 1.22, 1.14], tiles: [1.0, 0.98, 0.96] },
  rose: { name: 'rose', plaster: [1.2, 1.05, 1.0], wood: [0.86, 0.78, 0.74], stone: [1.28, 1.2, 1.14], tiles: [0.9, 0.78, 0.74] },
  brown: { name: 'brown', plaster: [1.18, 1.06, 0.86], wood: [0.84, 0.76, 0.68], stone: [1.28, 1.22, 1.1], grey: [0.84, 0.62, 0.46] },
  blue: { name: 'blue', plaster: [1.12, 1.14, 1.16], wood: [0.78, 0.72, 0.7], stone: [1.2, 1.22, 1.26], grey: [0.58, 0.7, 0.9] },
  green: { name: 'green', plaster: [1.12, 1.14, 1.0], wood: [0.88, 0.82, 0.74], stone: [1.2, 1.22, 1.14], grey: [0.64, 0.8, 0.58] },
  slate: { name: 'slate', plaster: [1.16, 1.12, 1.06], wood: [0.7, 0.64, 0.6], stone: [1.14, 1.14, 1.14], grey: [0.5, 0.52, 0.58] },
};
const start = (paint, seed) => ({ paint: paintOf(mulberry(seed), PAINT[paint]), blocks: [], extras: [], seed });
// a storey: its walls' stuff ('plaster' or 'stone'), each side's walls word by word (kit-houses.js, planOf: from each side's left
// end as seen from outside), and how far it juts out over the storey below ({ f, b, r, l }, on braces)
const S = (mat, plan, jet = null, style = 'brace') => ({ ...ST(mat, jet, style), plan });

export const BUILDINGS = [
  // ------------------------------------------------------------------ homes
  { id: 'cottage', name: 'กระท่อมชาวบ้าน', about: 'บ้านชั้นเดียวหลังเล็ก ประตูอยู่หน้าจั่ว มีหลังคากันสาดกระเบื้อง',
    foot: [-2.8, -3.2, 2.8, 4.8], door: [-1, 4.9, 0],
    make() {
      const D = start('rose', 11);
      const B = { x: 0, z: 0, w: 4, l: 6,
        storeys: [S('plaster', { f: 'D1 t', r: 'to - to', b: 'to to', l: '- wo -' })],
        door: { side: 'f', k: 0, kind: 'round', leaf: 'Door_1_Round' }, shelter: 'canopy',
        roof: { kind: 'gable', supports: true, gables: { b: 'shut' }, chimneys: [{ side: 'right', at: -1.4, kind: 1 }] } };
      D.blocks.push(B);
      D.extras.push(X.apron(B, ['f']));
      return D;
    } },
  { id: 'house', name: 'บ้านสองชั้น', about: 'ชั้นล่างหิน ชั้นบนปูนโครงไม้ยื่นออกหน้า–หลังบนค้ำยัน',
    foot: [-2.6, -4.2, 2.6, 4.2], door: [-1, 4.4, 0],
    make() {
      const D = start('blue', 12);
      const B = { x: 0, z: 0, w: 4, l: 6, quoins: true,
        storeys: [S('stone', { f: 'D8 t', r: '- t -', b: '- -', l: 't - t' }),
          S('plaster', { f: 'to to', r: '- vo - -', b: 'tc tc', l: '- - vo -' }, { f: 1, b: 1 })],
        door: { side: 'f', k: 0, kind: 'round', leaf: 'Door_8_Round' },
        roof: { kind: 'gable', supports: true, gables: { f: 'shut', b: 'none' }, chimneys: [{ side: 'left', at: 1.6, kind: 2 }] } };
      D.blocks.push(B);
      return D;
    } },
  { id: 'longhouse', name: 'บ้านยาวมีชาน', about: 'บ้านชั้นเดียวหลังกว้าง มีชานไม้ใต้ชายคาด้านข้าง หน้าต่างหลังคาสองช่อง',
    foot: [-3.6, -4.9, 3.6, 4.9], door: [3.6, 1, D90],
    make() {
      const D = start('green', 13);
      const B = { x: 0, z: 0, w: 6, l: 8, veranda: { side: 'r', d: 2 },
        storeys: [S('plaster', { f: 'to to', r: 'to D1 to to', b: 'to to', l: '- wo - tc' })],
        door: { side: 'r', k: 1, kind: 'flat', leaf: 'Door_1_Flat' },
        roof: { kind: 'gable', supports: true, gables: { f: 'open', b: 'shut' }, dormers: [[-1, -1.6], [-1, 1.6]], chimneys: [{ side: 'right', at: -2.2, kind: 1 }] } };
      D.blocks.push(B);
      return D;
    } },
  // ------------------------------------------------------------------ trades
  { id: 'shop', name: 'ร้านค้า', about: 'ร้านใต้ซุ้มโค้ง ชั้นบนยื่นคลุมทางเดินหน้าร้าน ลังสินค้าวางหน้าร้าน',
    foot: [-2.6, -4.4, 2.6, 4.4], door: [-1, 4.6, 0],
    make() {
      const D = start('brown', 14);
      const B = { x: 0, z: -1, w: 4, l: 6, quoins: true,
        storeys: [S('stone', { f: 'D1 w', r: '- t -', b: '- -', l: '- - -' }),
          S('plaster', { f: 'rh rh', r: '- vo - -', b: 'tc -', l: '- - vo -' }, { f: 2 }, 'arcade')],
        door: { side: 'f', k: 0, kind: 'round', leaf: 'Door_1_Round' },
        roof: { kind: 'gable', supports: true, gables: { f: 'open', b: 'none' }, chimneys: [{ side: 'right', at: -2, kind: 2 }] } };
      D.blocks.push(B);
      D.extras.push(X.thing('Prop_Crate', 1.3, 0.02, 2.75, 0.2, 0.75), X.thing('Prop_Crate', 0.45, 0.02, 2.65, -0.25, 0.6), X.thing('Prop_Crate', 1.3, 0.85, 2.72, 0.7, 0.55));
      return D;
    } },
  { id: 'smithy', name: 'โรงตีเหล็ก', about: 'อาคารหินหน้ากว้าง ปล่องไฟสองปล่อง ประตูเหล็กดุนกลางหน้าจั่ว มีเพิงทำงานเปิดโล่งด้านหลัง',
    foot: [-3.7, -5.4, 3.7, 3.4], door: [0, 3.5, 0],
    make() {
      const D = start('slate', 15);
      // (six metres across: under a gable that wide the shelter's roof stands clear below the tiles that reach out over the
      // back wall; under a gable four across its corners came up through them)
      const B = { x: 0, z: 0, w: 6, l: 6, quoins: true,
        storeys: [S('stone', { f: 't D4 t', r: 't - -', b: '- d8 -', l: '- - t' })],
        door: { side: 'f', k: 1, kind: 'round', leaf: 'Door_4_Round' },
        roof: { kind: 'gable', supports: true, gables: { f: 'shut', b: 'none' }, chimneys: [{ side: 'right', at: -1.2, kind: 1 }, { side: 'left', at: 1.4, kind: 2 }] } };
      // the work shelter against the back gable: boards on posts, open on three sides, the back door under it
      const F = { x: 0, z: -4, yaw: Math.PI, w: 4, l: 2, open: true, storeys: [S('plaster', { f: '0 0', r: '0', b: '0 0', l: '0' })], roof: { kind: 'lean', rise: 1 } };
      D.blocks.push(B, F);
      D.extras.push(X.thing('Prop_Crate', 1.35, 0, -3.6, 0.2, 0.8), X.thing('Prop_Crate', 1.3, 0.88, -3.62, 0.9, 0.55));
      return D;
    } },
  { id: 'inn', name: 'โรงเตี๊ยม', about: 'อาคารใหญ่สองชั้น ชั้นบนยื่นสองข้าง ระเบียงหน้าจั่ว หน้าต่างหลังคาสี่ช่อง ปล่องไฟคู่',
    foot: [-4.4, -5.4, 4.4, 6.6], door: [0, 6.7, 0],
    make() {
      const D = start('red', 16);
      const B = { x: 0, z: 0, w: 6, l: 10, quoins: true,
        storeys: [S('stone', { f: 'r D2 r', r: 't - t - t', b: '- d8 -', l: 't - t - t' }),
          S('plaster', { f: 'v v d1 v', r: '- vo - vo -', b: 'tc - - tc', l: '- vo - vo -' }, { r: 1, l: 1 })],
        door: { side: 'f', k: 1, kind: 'round', leaf: 'Door_2_Round' },
        balcony: { s: 1, side: 'f', from: 0, to: 3, rail: 'cross' },
        roof: { kind: 'gable', supports: true, gables: { f: 'open', b: 'shut' }, dormers: [[1, -2.5], [1, 2.5], [-1, -2.5], [-1, 2.5]],
          chimneys: [{ side: 'right', at: 0, kind: 1 }, { side: 'left', at: 0, kind: 2 }] } };
      D.blocks.push(B);
      D.extras.push(X.apron(B, ['f']));
      return D;
    } },
  // ------------------------------------------------------------------ the farm's
  { id: 'barn', name: 'ยุ้งฉาง', about: 'ชั้นล่างหิน ชั้นลอยผนังระแนง ประตูใหญ่หน้าจั่ว ประตูยกของชั้นบน',
    foot: [-3.6, -5.4, 3.6, 5.4], door: [0, 5.5, 0],
    make() {
      const D = start('brown', 17);
      const B = { x: 0, z: 0, w: 6, l: 10,
        storeys: [S('stone', { f: '- D4 -', r: '- t - t -', b: '- - -', l: '- t - t -' }),
          S('plaster', { f: 'x d8 x', r: 'x x - x x', b: 'x - x', l: 'x x - x x' })],
        door: { side: 'f', k: 1, kind: 'round', leaf: 'Door_4_Round' },
        roof: { kind: 'gable', supports: true, gables: { f: 'none', b: 'shut' } } };      // (no wooden ridge: its ends stood up over the gables as open boxes, the tiles' own ridge coming out under them)
      D.blocks.push(B);
      D.extras.push(({ at }) => at(null, 'Window_Roof_Wide', 0, 3.4, 5, 0, 1.2, 1, 1.2));      // a hood over the loft's door
      return D;
    } },
  { id: 'pen', name: 'คอกสัตว์', about: 'โรงเรือนเปิดด้านข้างเป็นซุ้มโค้งสามช่อง มีลานรั้วไม้ติดตัวโรงเรือน',
    foot: [-2.7, -3.6, 6.6, 3.6], door: [6.5, 0, D90],
    make() {
      const D = start('brown', 18);
      const B = { x: 0, z: 0, w: 4, l: 6,
        storeys: [S('plaster', { f: '- t', r: 'a a a', b: '- -', l: '- tc -' })],
        roof: { kind: 'gable', supports: true, gables: { f: 'shut', b: 'none' } } };
      D.blocks.push(B);
      D.extras.push(({ at }) => { for (let x = -1; x <= 1; x += 2) for (let z = -2; z <= 2; z += 2) at(null, 'Floor_WoodDark', x, 0.04, z, 0); },
        X.ceiling(-2, -3, 2, 3, 3), X.thing('Prop_Crate', -1.3, 0.04, -2.3, 0.3, 0.9), X.thing('Prop_Crate', -1.35, 0.04, -1.2, 1.2, 0.7),
        X.yardFence(B, 'r', 4, { gap: [[1, 1]] }));
      return D;
    } },
];

// a building's design, new each time (kit-houses.js writes into it as it builds)
export function buildingDesign(id) {
  const b = BUILDINGS.find(q => q.id === id) || BUILDINGS[0], D = b.make();
  D.blocks.forEach((B, i) => { if (!B.seed) B.seed = 101 + i; });
  D.id = b.id;
  return D;
}
