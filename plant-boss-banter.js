/* ==========================================================================
   plant-boss-banter.js  —  what the plant boss's three heads say in the game while it does not fight: among themselves
   when she is far off, about her when she comes near, and a roar to warn her off when she comes too close. They do
   not strike. One job: direct the talking: who says what to whom, when, in what mood. It moves no head itself:
   plant-boss-talk.js acts each line (each head in its own manner, the skirt's leaves answering), and the words go out
   as events for whatever draws them (speech-bubbles.js).

     const banter = createBossBanter(boss, { howl, clip })   (it makes its own plant-boss-talk.js, with itself directing)
                                               howl: true: coming in too close earns the howl (below); false (as the
                                               game has it for now): a warning roar, as before. clip: the heads talk
                                               as in the talking clip (plant-boss-talk.js's CLIP_MANNERS)
     every frame: banter.update(dt, her)       her: where she stands (her feet, world, a Vector3)
     banter.onSay = e => ...                   a head says something now: { head (0 middle, 1 right, 2 left), text,
                                               lasts (seconds to show it), loud (a roar), cut (it cuts in: whatever
                                               was being said is dropped) }
     banter.zone                               'far' | 'mid' | 'near': how close she is, as the heads see it
     banter.howl                               seconds into the howl, or -1 (for howl-fx.js, which draws its green light)
     banter.howlNow()                          howl at her now (a trial page's button)

   How close she is decides what is said (ZONES, metres from its middle; a zone is left a little further out than it is
   entered, so standing on its edge does not flicker):
     far    they chat among themselves, looking at one another: the heat, the dry ground, who snores
     mid    coming in: they notice her (a start, "who's that?"; coming back, "you again?"); while she stays they gossip about her, rudely, glancing
            at her, and now and then one roars at her for looking at it
     near   too close: a roar to warn her off (the head whose turn it is), the others jeer; again every few seconds while
            she stays. With howl: first all three howl at her (plant-boss-talk.js's move 'howl': they gather themselves,
            the green light goes up out of the middle one, and all three bellow at her, as at the end of the talking
            clip), then the warning roars; coming in again within HOWL_AGAIN seconds of the last howl, a warning roar only
     back   leaving the near zone after a warning: they laugh at her for running
   The heads as in the talking scene: the middle one the leader, curt and cold; the right one hot-headed; the left one a
   sly mocker who giggles (คิคิ). The lines are BANTER: change them there.
   ========================================================================== */
import { createBossTalk, HOWL } from './plant-boss-talk.js';

// [who says it, to whom, mood, words, 'roar' for a roar]. Who: C (middle), R (right), L (left); to: a head, or 'you' (her).
// Moods: plant-boss-talk.js's MOODS (calm, keen, doubt, bored, angry, shock, sad, laugh)
export const BANTER = {
  chat: [
    [['R', 'L', 'angry', 'แดดวันนี้แรงชะมัด ใบข้าจะไหม้แล้ว'], ['L', 'R', 'laugh', 'ไหม้ไปแล้วจ้ะ คิคิ'], ['R', 'L', 'angry', 'เงียบไปเลย!']],
    [['L', 'C', 'keen', 'เมื่อคืนใครกรน'], ['C', 'L', 'doubt', '...ไม่ใช่ข้า'], ['R', 'C', 'angry', 'ก็เอ็งนั่นแหละ!']],
    [['C', 'R', 'sad', 'ดินแห้งขนาดนี้ รากข้าคันไปหมด'], ['L', 'C', 'bored', 'บ่นทุกวันเลยนะ']],
    [['R', 'L', 'bored', 'หิวว่ะ'], ['L', 'R', 'keen', 'กินดินไปก่อนสิ'], ['R', 'L', 'angry', 'ดินมันแห้ง!!']],
    [['L', 'R', 'keen', 'เอ็งว่าฝนจะตกไหม'], ['R', 'L', 'bored', 'ไม่ตกหรอก โดนสาปมาตั้งนาน'], ['C', 'R', 'sad', 'ช่างมันเถอะ']],
  ],
  notice: [
    [['R', 'you', 'shock', 'หือ!? นั่นใคร'], ['L', 'R', 'keen', 'มีแขกมาด้วยแฮะ คิคิ'], ['C', 'you', 'doubt', '...เงียบ ดูไว้ก่อน']],
    [['L', 'you', 'shock', 'ว้าย! คนจริงๆ ด้วย'], ['R', 'you', 'angry', 'อีนี่มาทำอะไรแถวนี้!']],
  ],
  again: [
    [['C', 'you', 'doubt', 'มาอีกแล้วเหรอ'], ['R', 'C', 'angry', 'ไม่เข็ดสักที']],
    [['L', 'R', 'keen', 'ยัยนั่นกลับมาอีกแล้ว คิคิ'], ['R', 'you', 'angry', 'ยังไม่เข็ดอีกเหรอ!']],
  ],
  gossip: [
    [['R', 'L', 'angry', 'อีนี่มาทำอะไรแถวนี้'], ['L', 'R', 'laugh', 'หลงทางมามั้ง คิคิ'], ['C', 'R', 'calm', 'อย่าไปสนใจ']],
    [['L', 'you', 'keen', 'ชุดสวยนะจ๊ะ... เดินมาตายเหรอ'], ['R', 'L', 'angry', 'ตัวเล็กนิดเดียว งับทีเดียวก็หมด'], ['C', 'R', 'doubt', 'อย่าเพิ่ง']],
    [['R', 'you', 'angry', 'จ้องอะไรนักหนา!'], ['L', 'R', 'laugh', 'เขินอะดิ คิคิ'], ['R', 'L', 'angry', 'ใครเขิน!!']],
    [['C', 'you', 'doubt', 'ที่นี่ไม่ใช่ที่ของเจ้า'], ['L', 'you', 'keen', 'กลับบ้านไปซะจ้ะหนู']],
    [['L', 'C', 'keen', 'เอ็งว่าอีนี่อร่อยไหม'], ['C', 'L', 'doubt', '...ผอมไป'], ['R', 'you', 'angry', 'กระดูกล้วนๆ!']],
    [['R', 'C', 'angry', 'ให้ข้าไล่มันไปเลยไหม'], ['C', 'R', 'calm', 'ใจเย็น ดูมันจะทำอะไร']],
    [['R', 'you', 'angry', 'แฮ่!! มองหน้าหาเรื่องเหรอ', 'roar'], ['L', 'R', 'laugh', 'ใจเย็นๆ คิคิ']],
  ],
  warn: [
    [['R', 'you', 'angry', 'แฮ่!! ถอยไปเลยนะ!', 'roar'], ['L', 'you', 'laugh', 'หน้าซีดเลย คิคิ']],
    [['C', 'you', 'angry', 'ข้าเตือนครั้งเดียว... ไปซะ!!', 'roar']],
    [['L', 'you', 'keen', 'อุ๊ย ใกล้ไปแล้วจ้ะ'], ['L', 'you', 'angry', 'แฮ่!!', 'roar']],
    [['R', 'you', 'angry', 'อย่าเข้ามานะ!!', 'roar'], ['C', 'you', 'angry', 'ถอยไป!!', 'roar']],
  ],
  back: [
    [['L', 'R', 'laugh', 'หนีแล้ว คิคิ'], ['R', 'you', 'angry', 'ไปไกลๆ เลย!']],
    [['R', 'C', 'laugh', 'ฮ่าๆ กลัวหัวหดเลย'], ['C', 'you', 'doubt', 'ดีแล้ว']],
  ],
};
// the howl's words: [seconds into it, who, the words, a shout]
export const HOWL_LINES = [[0.12, 'R', 'หือ!?', false], [0.3, 'L', 'อุ๊ย...', false], [HOWL.roar, 'C', 'ไปให้พ้น!!!', true], [HOWL.roar + 0.12, 'R', 'แฮ่!!!', true], [HOWL.roar + 0.24, 'L', 'แฮ่!!!', true]];
const HOWL_AGAIN = 20;                              // seconds before coming in close again earns another howl
// metres from its middle (at size 1): [entered nearer than, left further than]
export const ZONES = { near: [9.5, 11.5], mid: [24, 27] };
// seconds of quiet between one exchange and the next, in each zone; and between warnings while she stays too close
const GAPS = { far: [3, 6], mid: [1.4, 3.2], near: [3.2, 4.2] };
// how each head holds itself between its lines, in each zone (a mood of plant-boss-talk.js's): middle, right, left
const AT_EASE = { far: ['calm', 'bored', 'calm'], mid: ['doubt', 'angry', 'keen'], near: ['angry', 'angry', 'keen'] };
const NAMES = ['C', 'R', 'L'], INDEX = { C: 0, R: 1, L: 2 };
// where they look when nobody is talking, among themselves (far off): each head in turn, now and then away
const IDLE_LOOKS = [['R', 'C', 'away'], ['L', 'away', 'C'], ['away', 'L', 'R'], ['R', 'away', 'away']];

const range = ([a, b]) => a + Math.random() * (b - a);

export function createBossBanter(boss, { howl = false, clip = false } = {}) {
  const size = boss.userData.size || 1, chest = boss.position.clone();
  const bags = {};                                  // each kind's exchanges, shuffled, used up before any comes again
  const pick = kind => {
    if (!bags[kind] || !bags[kind].length) bags[kind] = BANTER[kind].slice().sort(() => Math.random() - 0.5);
    return bags[kind].pop();
  };
  let zone = 'far', queue = [], line = null, lineT = 0, gap = 1.5, quiet = 0, warned = false, seen = false;
  let howlT = -1, lastHowl = -1e9, clock = 0, howlSaid = 0;
  const me = { onSay: null, get zone() { return zone; }, get howl() { return howlT; }, howlNow, update };
  function howlNow() { howlT = 0; howlSaid = 0; lastHowl = clock; queue = []; line = null; warned = true; }

  function next(cut = false) {
    const [who, to, mood, text, kind] = queue.shift();
    const loud = kind === 'roar';
    line = { head: INDEX[who], to, mood, loud, len: loud ? 2.0 : Math.min(3.6, Math.max(1.8, 1.2 + text.length * 0.07)) };
    lineT = 0;
    if (me.onSay) me.onSay({ head: line.head, text, lasts: line.len + 0.5, loud, cut });
  }
  function play(kind, now = false) {
    queue = pick(kind).slice();
    if (now || !line) next(now && !!line);
    if (kind === 'warn') warned = true;
  }

  // what each head does now (for plant-boss-talk.js): [who it looks at, mood, how much it talks, a move]
  function direct() {
    if (howlT >= 0) return { heads: [0, 1, 2].map(() => ['you', 'angry', 0, 'howl']) };
    const ease = AT_EASE[zone], heads = [];
    for (let i = 0; i < 3; i++) {
      if (line && line.head === i) heads.push([line.to, line.mood, line.loud ? 0 : 1, line.loud ? 'roar' : null]);
      else if (line) heads.push([line.to === 'you' && zone !== 'far' ? 'you' : NAMES[line.head], ease[i], 0, null]);      // listening: to who is spoken to, or to who speaks
      else heads.push([zone === 'far' ? IDLE_LOOKS[Math.floor(quiet / 2.6) % IDLE_LOOKS.length][i] : 'you', ease[i], 0, null]);
    }
    return { heads };
  }
  const talk = createBossTalk(boss, { direct, clip });

  function update(dt, her) {
    dt = Math.min(dt, 0.05);
    const d = Math.hypot(her.x - boss.position.x, her.z - boss.position.z) / size;
    // which zone she is in: going in, and coming out (a little further out than going in)
    clock += dt;
    if (zone !== 'near' && d < ZONES.near[0]) { zone = 'near'; if (howl && clock - lastHowl > HOWL_AGAIN) howlNow(); else play('warn', true); gap = range(GAPS.near); }
    else if (zone === 'near' && d > ZONES.near[1]) { zone = 'mid'; if (warned) play('back', true); warned = false; }
    else if (zone === 'far' && d < ZONES.mid[0]) { zone = 'mid'; play(seen ? 'again' : 'notice', true); seen = true; }
    else if (zone === 'mid' && d > ZONES.mid[1]) zone = 'far';
    // the howl: its words as it comes to them; then quiet, then on as the zone calls for
    if (howlT >= 0) {
      howlT += dt;
      while (howlSaid < HOWL_LINES.length && howlT >= HOWL_LINES[howlSaid][0]) {
        const [, who, text, loud] = HOWL_LINES[howlSaid++];
        if (me.onSay) me.onSay({ head: INDEX[who], text, lasts: loud ? 2.0 : 1.2, loud, cut: false });
      }
      if (howlT >= HOWL.length) { howlT = -1; gap = range(GAPS[zone]); quiet = 0; }
      chest.set(her.x, her.y + 1.25, her.z);
      talk.update(dt, chest);
      return;
    }
    // the line being said, then the next, then quiet; after the quiet, the next exchange the zone calls for
    if (line && (lineT += dt) >= line.len) { line = null; if (queue.length) next(); else { gap = range(GAPS[zone]); quiet = 0; } }
    if (!line && !queue.length) {
      quiet += dt;
      if ((gap -= dt) <= 0) play(zone === 'far' ? 'chat' : zone === 'mid' ? 'gossip' : 'warn');
    }
    chest.set(her.x, her.y + 1.25, her.z);
    talk.update(dt, chest);
  }
  return me;
}
