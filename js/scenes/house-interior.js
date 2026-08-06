import { camera } from "../camera.js";
import { interactions } from "../interactions.js";
import { houseInteriorMap } from "../maps/house-interior-map.js";
import { player } from "../player.js";
import { createSpawnAnchors } from "../spawn-anchors.js";

const SPAWNS = createSpawnAnchors({
  default: { x: 450, y: 525, facingX: 0, facingY: -1 },
  entry: { x: 450, y: 525, facingX: 0, facingY: -1 },
});

export function createHouseInteriorScene({ requestSceneChange } = {}) {
  const requestTransition = typeof requestSceneChange === "function"
    ? requestSceneChange
    : () => false;

  function enter({ state, spawnId } = {}) {
    player.configure({
      space: "house-interior",
      bounds: { width: houseInteriorMap.WIDTH, height: houseInteriorMap.HEIGHT },
      defaultPosition: SPAWNS.resolve(),
      getColliders: houseInteriorMap.getColliders,
    });
    player.setState(state?.player, spawnId ? SPAWNS.resolve(spawnId) : null);

    camera.setBounds(houseInteriorMap.WIDTH, houseInteriorMap.HEIGHT);
    interactions.clear();
    interactions.register({
      id: "house-exit-door",
      x: houseInteriorMap.DOOR_CENTER_X,
      y: houseInteriorMap.ROOM.y + houseInteriorMap.ROOM.height - 8,
      radius: 82,
      priority: 10,
      highlightRadius: 31,
      label: "ออกจากบ้าน",
      action: () => requestTransition("farm-exterior", { spawnId: "farmhouse-exit" }),
    });

    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.snapTo(position.x, position.y);
  }

  function exit() {
    interactions.clear();
  }

  function update(deltaTime, { movementEnabled = true } = {}) {
    const moved = player.update(deltaTime, movementEnabled);
    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.update(position.x, position.y, deltaTime);
    return moved;
  }

  function draw(ctx) {
    ctx.save();
    camera.apply(ctx);
    houseInteriorMap.drawGround(ctx);
    interactions.drawWorld(ctx);

    const position = player.getPosition();
    houseInteriorMap.drawBefore(ctx, position.y);
    player.draw(ctx);
    houseInteriorMap.drawAfter(ctx, position.y);
    ctx.restore();
  }

  function drawUI(ctx) {
    interactions.drawMessage(ctx);
  }

  function handleAction() {
    return interactions.activateCurrent();
  }

  function getActionLabel() {
    return interactions.getPromptLabel();
  }

  function getSaveState() {
    return { player: player.getState() };
  }

  return {
    id: "house-interior",
    title: "บ้านของ Liora",
    enter,
    exit,
    update,
    draw,
    drawUI,
    handleAction,
    getActionLabel,
    getSaveState,
  };
}
