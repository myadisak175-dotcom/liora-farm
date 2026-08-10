import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createFarmPlot } from "../systems/farming/plot.js";

export async function createHomeIsland({ scene, textureLoader, config, assets }) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  const island = createFloatingIsland(config.island);
  group.add(island);

  const grass = await textureLoader.loadAsync(assets.grass);
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(config.grassRepeat, config.grassRepeat);
  grass.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(config.worldSize, config.worldSize),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  ground.receiveShadow = true;
  ground.renderOrder = config.depth.groundOrder;
  group.add(ground);

  // First farming landmark: a compact 3x3 plot on the left/front side.
  // The house, paths and utility props can be composed around this later.
  const farmPlot = createFarmPlot(config.farmPlot);
  group.add(farmPlot.group);

  scene.add(group);

  return {
    group,
    ground,
    farmPlot,
    dispose() {
      farmPlot.dispose();
      grass.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      scene.remove(group);
    },
  };
}
