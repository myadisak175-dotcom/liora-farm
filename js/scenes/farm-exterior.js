import { camera } from "../camera.js";
import { farm } from "../farm.js";
import { interactions } from "../interactions.js";
import { gameMap } from "../map.js";
import { mapInteractions } from "../map-interactions.js";
import { player } from "../player.js";
import { createSpawnAnchors } from "../spawn-anchors.js";
import { world } from "../world.js";

const SPAWNS = createSpawnAnchors({
  default: { x: world.WIDTH / 2, y: 735, facingX: 0, facingY: -1 },
  "farmhouse-exit": { x: 350, y: 468, facingX: 0, facingY: 1 },
});

export function createFarmExteriorScene({ requestSceneChange } = {}) {
  function enter({ state, spawnId } = {}) {
    farm.setState(state?.farm);

    player.configure({
      space: "farm-exterior",
      legacySpaces: ["world"],
      bounds: { width: world.WIDTH, height: world.HEIGHT },
      defaultPosition: SPAWNS.resolve(),
      getColliders: gameMap.getColliders,
    });
    player.setState(state?.player, spawnId ? SPAWNS.resolve(spawnId) : null);

    camera.setBounds(world.WIDTH, world.HEIGHT);
    interactions.clear();
    interactions.registerMany(farm.getInteractions());
    interactions.registerMany(mapInteractions.getEntries({ requestSceneChange }));

    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.snapTo(position.x, position.y);
  }

  function exit() {
    interactions.clear();
  }

  function update(deltaTime, { movementEnabled = true } = {}) {
    farm.update();
    const moved = player.update(deltaTime, movementEnabled);

    const position = player.getPosition();
    interactions.update(position.x, position.y);
    camera.update(position.x, position.y, deltaTime);
    return moved;
  }

  function draw(ctx) {
    ctx.save();
    camera.apply(ctx);
    world.draw(ctx);
    gameMap.drawGround(ctx);
    farm.draw(ctx);
    interactions.drawWorld(ctx);

    const position = player.getPosition();
    gameMap.drawBefore(ctx, position.y);
    player.draw(ctx);
    gameMap.drawAfter(ctx, position.y);
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
    return {
      farm: farm.getState(),
      player: player.getState(),
    };
  }

  return {
    id: "farm-exterior",
    title: "Liora's Farm",
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
