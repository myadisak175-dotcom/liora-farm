import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createTerrainHeight } from "../systems/terrain-height.js";
import { createWorldBoundary } from "../systems/world-boundary.js";
import { createOuterWorldGround } from "../systems/outer-world-ground.js";
import { createMountainBackdrop } from "../systems/mountain-backdrop.js";
import { createTerrainField } from "../systems/terrain-field.js";
import { createGroundPaint } from "../systems/ground-paint.js";
import { createCloudShadows } from "../systems/cloud-shadows.js";
import { createGroundLayers } from "../systems/ground-layers.js";
import { createGroundTextureArray } from "../systems/ground-texture-array.js";
import { createBrushCursor } from "../systems/brush-cursor.js";
import { createAnimatedWater } from "../systems/water.js";
import { createFarmPlot } from "../systems/farming/plot.js";
import { createCrops } from "../systems/farming/crops.js";

function tile(texture, repeat, anisotropy = 1) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

export async function createHomeIsland({
  scene,
  textureLoader,
  config,
  assets,
  anisotropy = 1,
  reservedAreas = [],
  onCropsChange,
}) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  let mountainBackdrop = createMountainBackdrop(config.mountainBackdrop);
  group.add(mountainBackdrop.group);

  const ridgeEnabled = config.worldBoundary?.enabled !== false
    && config.worldBoundary?.type === "ridge";
  const boundaryTopY = ridgeEnabled ? Number(config.worldBoundary?.height || 0) : 0;

  const openWorldVisual = !ridgeEnabled && config.outerWorld?.enabled !== false;
  if (!openWorldVisual) {
    const island = createFloatingIsland({ ...config.island, topY: boundaryTopY });
    group.add(island);
  }

  const layers = createGroundLayers(
    config.groundPaint.layers.map((layer) => ({
      ...layer,
      texture: `${assets.textureDir}/${layer.texture}`,
    })),
    { maxLayers: config.groundPaint.maxLayers }
  );

  const repeat = config.groundPaint.textureRepeat;
  const groundTextures = await createGroundTextureArray({
    layers,
    textureLoader,
    tileSize: config.groundPaint.tileSize,
    anisotropy,
  });

  const baseMap = tile(
    new THREE.Texture(groundTextures.images.get(layers.base.key)),
    repeat,
    anisotropy
  );
  baseMap.needsUpdate = true;

  let waterTexture = null;
  if (config.water.texture) {
    try {
      waterTexture = await textureLoader.loadAsync(`${assets.textureDir}/${config.water.texture}`);
      waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
      waterTexture.colorSpace = THREE.SRGBColorSpace;
      waterTexture.anisotropy = anisotropy;
    } catch (error) {
      console.warn(`Water texture missing: ${config.water.texture}`, error);
    }
  }

  const baseHeight = createTerrainHeight({
    config: config.sculpt,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    reservedAreas,
  });
  const worldBoundary = createWorldBoundary({
    config: config.worldBoundary,
    baseHeight,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    renderOrder: config.terrain.renderOrder,
  });
  const height = worldBoundary.height;

  const terrainField = createTerrainField({
    height: worldBoundary.heightView,
    worldSize: config.terrain.size,
    config: { ...config.terrainField, waterLevel: config.water.level },
  });

  const terrain = createTerrain({ texture: baseMap, config: config.terrain, height: baseHeight, anisotropy });

  const paint = createGroundPaint({
    config: config.groundPaint,
    worldSize: config.terrain.size,
    layers,
    layerArray: groundTextures.texture,
    terrainField,
    autoSurfaceConfig: config.terrainField,
  });
  paint.applyTo(terrain.material);

  // Keep the rendered world visually continuous while gameplay still ends
  // inside the terrain. A tiny overlap/depth bias prevents a precision crack
  // without reading as the raised square slab seen with the old 1.5 m / 8 cm seam.
  const buildOuterWorld = (outerConfig) => {
    const terrainHalf = Math.max(1, Number(config.terrain.size) / 2);
    const seamOverlap = 0.35;
    const seamDrop = 0.015;
    return createOuterWorldGround({
      config: {
        ...outerConfig,
        innerRadius: Math.max(1, terrainHalf - seamOverlap),
        innerY: boundaryTopY - seamDrop,
      },
      texture: baseMap,
      textureWorldSize: config.terrain.size,
    });
  };

  // Applied after paint.applyTo above: both hook onBeforeCompile, and the
  // cloud layer composes onto whatever it finds rather than replacing it.
  const cloudShadows = createCloudShadows(config.cloudShadows, config.wind);
  cloudShadows.applyTo(terrain.material);

  let outerWorld = buildOuterWorld(config.outerWorld);
  if (outerWorld.material) {
    // Distance shading is installed by createOuterWorldGround first; paint
    // composes onto that hook, then clouds compose last. This preserves the
    // existing far fade while extending the island's edge paint via clamp.
    paint.applyTo(outerWorld.material, { distanceGate: true });
    cloudShadows.applyTo(outerWorld.material);
  }
  group.add(outerWorld.group);

  // Remembered so rebuilding from the horizon panel does not snap the far
  // ground back to its authored daytime tint in the middle of a sunset.
  let lastHorizonColor = null;

  const water = createAnimatedWater({
    size: config.terrain.size,
    config: config.water,
    terrainField,
    texture: waterTexture,
  });

  group.add(water.mesh);
  group.add(terrain.mesh);
  const boundaryMesh = worldBoundary.createMesh(terrain.material);
  if (boundaryMesh) group.add(boundaryMesh);

  const farmPlot = createFarmPlot(config.farmPlot);
  group.add(farmPlot.group);
  scene.add(group);

  const brushCursor = createBrushCursor({
    scene,
    getGroundHeight: (x, z) => height.sample(x, z),
    config: config.brushCursor,
  });

  const crops = createCrops({
    plot: farmPlot,
    config: config.farming,
    onChange: onCropsChange,
  });

  return {
    group,
    ground: terrain.mesh,
    terrain,
    layers,
    missingTextures: groundTextures.missing,
    height,
    terrainField,
    worldBoundary,
    get outerWorld() { return outerWorld; },
    get mountainBackdrop() { return mountainBackdrop; },
    /**
     * The sky's current horizon colour, pushed into the far ground so the two
     * always dissolve into each other. Called by the day/night cycle.
     */
    setAtmosphere(horizonColor) {
      if (!horizonColor) return;
      lastHorizonColor = horizonColor;
      outerWorld.setAtmosphere?.(horizonColor);
      mountainBackdrop.setAtmosphere?.(horizonColor);
    },
    rebuildHorizon({ outerWorld: outerConfig, mountainBackdrop: backdropConfig } = {}) {
      if (outerConfig) {
        group.remove(outerWorld.group);
        paint.releaseMaterial(outerWorld.material);
        outerWorld.dispose();
        outerWorld = buildOuterWorld(outerConfig);
        if (outerWorld.material) {
          // Horizon rebuilds replace the material, so the paint binding must
          // be restored before cloud shadows are composed onto the new hook.
          paint.applyTo(outerWorld.material, { distanceGate: true });
          cloudShadows.applyTo(outerWorld.material);
        }
        if (lastHorizonColor) outerWorld.setAtmosphere?.(lastHorizonColor);
        group.add(outerWorld.group);
      }
      if (backdropConfig) {
        group.remove(mountainBackdrop.group);
        mountainBackdrop.dispose();
        mountainBackdrop = createMountainBackdrop(backdropConfig);
        if (lastHorizonColor) mountainBackdrop.setAtmosphere?.(lastHorizonColor);
        group.add(mountainBackdrop.group);
      }
    },
    water,
    paint,
    brushCursor,
    farmPlot,
    crops,
    getGroundHeight: (x, z) => height.sample(x, z),
    cloudShadows,
    setQuality(preset = {}) {
      terrain.setDetailNormalEnabled(preset.detailNormals !== false);
    },
    refresh(delta = 0) {
      cloudShadows.update(delta);
      water.update();
      const changed = terrain.refresh();
      if (changed) {
        worldBoundary.refresh();
        terrainField.refresh();
        brushCursor.refresh();
      }
      return changed;
    },
    dispose() {
      cloudShadows.dispose();
      brushCursor.dispose();
      crops.dispose();
      farmPlot.dispose();
      paint.dispose();
      height.dispose();
      worldBoundary.dispose();
      outerWorld.dispose();
      mountainBackdrop.dispose();
      terrain.dispose();
      water.dispose();
      terrainField.dispose();
      groundTextures.dispose();
      baseMap.dispose();
      scene.remove(group);
    },
  };
}
