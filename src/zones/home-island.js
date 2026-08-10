import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createFarmPlot } from "../systems/farming/plot.js";
import { createGroundMaterial } from "../systems/ground/ground-material.js";

export async function createHomeIsland({ scene, textureLoader, config, assets }) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  const island = createFloatingIsland(config.island);
  group.add(island);

  // Ground textures are non-fatal: createGroundMaterial falls back to built-in
  // placeholder colours when a texture is missing or the request fails.
  const ground = await createGroundMaterial({
    textureLoader,
    paths: assets.ground ?? {
      grass: assets.grass,
      dirt: assets.dirtPath,
      sand: null,
      rock: null,
      tileAtlas: null,
    },
    worldSize: config.worldSize,
    gridSize: config.worldSize,
  });

  const terrain = createTerrain({
    material: ground.material,
    config: config.terrain,
  });
  group.add(terrain.mesh);

  const farmPlot = createFarmPlot(config.farmPlot);
  farmPlot.group.position.y += terrain.getHeight(
    config.farmPlot.position.x,
    config.farmPlot.position.z
  );
  group.add(farmPlot.group);

  scene.add(group);

  return {
    group,
    ground,
    groundMesh: terrain.mesh,
    terrain,
    farmPlot,
    getGroundHeight: terrain.getHeight,
    dispose() {
      farmPlot.dispose();
      terrain.dispose();
      ground.dispose();
      scene.remove(group);
    },
  };
}
