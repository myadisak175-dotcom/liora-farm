export const INTERACTION_TYPES = Object.freeze({
  CHOP: "chop",
  ENTER: "enter",
  SIT: "sit",
  INSPECT: "inspect",
  PICK_UP: "pick-up",
  TALK: "talk",
});

const DEFINITIONS = {
  tree: {
    type: INTERACTION_TYPES.CHOP,
    label: "ตัดต้นไม้",
    range: 2.6,
    priority: 20,
    animationKey: "hammer",
  },
  pine: {
    type: INTERACTION_TYPES.CHOP,
    label: "ตัดต้นสน",
    range: 2.6,
    priority: 20,
    animationKey: "hammer",
  },
  palm: {
    type: INTERACTION_TYPES.CHOP,
    label: "ตัดต้นปาล์ม",
    range: 2.6,
    priority: 20,
    animationKey: "hammer",
  },
  house: {
    type: INTERACTION_TYPES.ENTER,
    label: "เข้าบ้าน",
    range: 3.2,
    priority: 30,
  },
  house2: {
    type: INTERACTION_TYPES.ENTER,
    label: "เข้าบ้าน",
    range: 3.2,
    priority: 30,
  },
  blue_cottage: {
    type: INTERACTION_TYPES.ENTER,
    label: "เข้ากระท่อม",
    range: 3.0,
    priority: 30,
  },
  bench: {
    type: INTERACTION_TYPES.SIT,
    label: "นั่ง",
    range: 2.0,
    priority: 15,
    animationKey: "walkToSit",
  },
  crate: {
    type: INTERACTION_TYPES.INSPECT,
    label: "ตรวจดู",
    range: 1.8,
    priority: 10,
  },
  crate_set: {
    type: INTERACTION_TYPES.INSPECT,
    label: "ตรวจดูกองลัง",
    range: 2.0,
    priority: 10,
  },
  wine_barrel: {
    type: INTERACTION_TYPES.INSPECT,
    label: "ตรวจดูถังไม้",
    range: 1.8,
    priority: 10,
  },
};

export const INTERACTION_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFINITIONS).map(([assetId, definition]) => [
      assetId,
      Object.freeze({ assetId, ...definition }),
    ])
  )
);

export function getInteractionDefinition(assetId) {
  return INTERACTION_DEFINITIONS[assetId] ?? null;
}
