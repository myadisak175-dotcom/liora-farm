import * as THREE from "three";

const TAU = Math.PI * 2;

function seededRandom(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function setInstance(mesh, index, position, scale, rotationY = 0) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

/**
 * One instanced ring of cone peaks. Unlit on purpose: at 200 m-plus the only
 * thing that should shape these is atmosphere, and a flat silhouette tinted
 * toward the sky is exactly how distance reads.
 *
 * `baseY` sits well below the visual ground so a peak always rises out of the
 * land; the cone's own base is buried and never seen.
 */
function makePeakRing(spec = {}) {
  const count = Math.max(0, Math.round(Number(spec.count) || 0));
  const random = seededRandom(Number(spec.seed) || 1337);
  const geometry = new THREE.ConeGeometry(1, 1, 6, 1, false);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshBasicMaterial({ color: spec.color ?? 0x9ca7c4, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = `DistantPeaks-${spec.seed ?? 0}`;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -30;

  for (let i = 0; i < count; i += 1) {
    const angle = (i / Math.max(1, count)) * TAU + (random() - 0.5) * 0.34;
    const radius = THREE.MathUtils.lerp(spec.radiusMin ?? 200, spec.radiusMax ?? 240, random());
    const height = THREE.MathUtils.lerp(spec.heightMin ?? 50, spec.heightMax ?? 75, random());
    const width = THREE.MathUtils.lerp(spec.widthMin ?? 20, spec.widthMax ?? 34, random());
    setInstance(
      mesh,
      i,
      new THREE.Vector3(Math.cos(angle) * radius, spec.baseY ?? -16, Math.sin(angle) * radius),
      new THREE.Vector3(width, height, width * THREE.MathUtils.lerp(0.8, 1.25, random())),
      random() * TAU
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

/**
 * Low translucent slabs that pool around the base of the ranges.
 *
 * This is the old `cloudSea`, which sat at y -9 — underneath the visual ground,
 * where it was 58 instances of invisible geometry. Sitting on the land instead,
 * it does the job atmospheric haze does in a real landscape: it separates the
 * foothills from the range behind them so the eye reads depth rather than one
 * flat cut-out.
 */
function makeHazeBand(spec = {}) {
  const count = Math.max(0, Math.round(Number(spec.count) || 0));
  const random = seededRandom(Number(spec.seed) || 4242);
  const geometry = new THREE.SphereGeometry(1, 8, 5);
  const material = new THREE.MeshBasicMaterial({
    color: spec.color ?? 0xeaf8ff,
    transparent: true,
    opacity: spec.opacity ?? 0.26,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "HorizonHaze";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Drawn before the near transparents (water is renderOrder 1) so the far
  // mist never paints over the pond in front of the player.
  mesh.renderOrder = -5;

  for (let i = 0; i < count; i += 1) {
    const angle = random() * TAU;
    const radius = THREE.MathUtils.lerp(
      spec.radiusMin ?? 130,
      spec.radiusMax ?? 250,
      Math.sqrt(random())
    );
    const y = THREE.MathUtils.lerp(spec.yMin ?? 1.5, spec.yMax ?? 11, random());
    const width = THREE.MathUtils.lerp(spec.widthMin ?? 26, spec.widthMax ?? 58, random());
    const depth = THREE.MathUtils.lerp(spec.depthMin ?? 18, spec.depthMax ?? 40, random());
    const height = THREE.MathUtils.lerp(spec.heightMin ?? 1.4, spec.heightMax ?? 3.4, random());
    setInstance(
      mesh,
      i,
      new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
      new THREE.Vector3(width, height, depth),
      random() * TAU
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

function makeFloatingIsland({ angle, radius, y, scale, phase }) {
  const group = new THREE.Group();
  group.name = "DistantFloatingIsland";
  group.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  group.scale.setScalar(scale);
  group.userData.baseY = y;
  group.userData.phase = phase;

  const topMaterial = new THREE.MeshLambertMaterial({ color: 0x779b72, fog: true });
  const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x6b6273, fog: true });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.85, 0.48, 8), topMaterial);
  top.position.y = 0.08;
  top.castShadow = false;
  top.receiveShadow = false;
  group.add(top);

  const rock = new THREE.Mesh(new THREE.ConeGeometry(1.85, 3.5, 8, 1), rockMaterial);
  rock.rotation.x = Math.PI;
  rock.position.y = -1.72;
  rock.castShadow = false;
  rock.receiveShadow = false;
  group.add(rock);

  const nubMaterial = new THREE.MeshBasicMaterial({ color: 0xdff4ff, fog: true });
  const nub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), nubMaterial);
  nub.scale.set(4.2, 0.8, 1.8);
  nub.position.set(0.2, 1.0, 0);
  group.add(nub);

  return { group, topMaterial, rockMaterial, nubMaterial };
}

/**
 * The furthest scenery layer: instanced peaks, a haze band, and the optional
 * fantasy floating islands.
 *
 * Everything is world-space decoration. It is never sampled for ground height,
 * never collided with, never saved, and never placed by the Builder. Turning
 * the whole thing off with `enabled: false` changes nothing a player can walk
 * into.
 */
export function createFantasyHorizon(config = {}) {
  const group = new THREE.Group();
  group.name = "FantasyHorizon";

  if (config.enabled === false) {
    return {
      group,
      stats: { meshes: 0, drawCalls: 0 },
      update() {},
      setAtmosphere() {},
      dispose() {},
    };
  }

  const peakSpecs = Array.isArray(config.peaks) ? config.peaks : [];
  const peaks = peakSpecs.filter((spec) => (Number(spec?.count) || 0) > 0).map(makePeakRing);
  for (const ring of peaks) group.add(ring.mesh);

  const hazeSpec = config.haze ?? {};
  const haze = hazeSpec.enabled === false || !(Number(hazeSpec.count) > 0)
    ? null
    : makeHazeBand(hazeSpec);
  if (haze) group.add(haze.mesh);

  const islandSpec = config.floatingIslands ?? {};
  const islands = islandSpec.enabled === true && Array.isArray(islandSpec.items)
    ? islandSpec.items.map(makeFloatingIsland)
    : [];
  for (const island of islands) group.add(island.group);

  const bobAmplitude = Number(islandSpec.bobAmplitude) || 0.28;
  const bobSpeed = Number(islandSpec.bobSpeed) || 0.45;
  const hazeDrift = Number(hazeSpec.driftSpeed) || 0;

  const basePeaks = peaks.map((ring) => ring.material.color.clone());
  const baseHaze = haze ? haze.material.color.clone() : null;
  const baseTop = new THREE.Color(0x779b72);
  const baseRock = new THREE.Color(0x6b6273);
  const baseNub = new THREE.Color(0xf4fbff);

  /**
   * Aerial perspective: the further a ring is, the harder it is pulled toward
   * the current sky colour. This is what keeps the layers separated at noon
   * and lets the whole horizon go warm at sunset and blue at night for free.
   */
  function setAtmosphere(horizonColor, lowerColor) {
    for (let i = 0; i < peaks.length; i += 1) {
      const blend = peaks.length === 1 ? 0.5 : 0.4 + (i / (peaks.length - 1)) * 0.34;
      peaks[i].material.color.copy(basePeaks[i]).lerp(horizonColor, blend);
    }
    if (haze) haze.material.color.copy(baseHaze).lerp(horizonColor, 0.35);
    for (const island of islands) {
      island.topMaterial.color.copy(baseTop).lerp(horizonColor, 0.42);
      island.rockMaterial.color.copy(baseRock).lerp(lowerColor, 0.46);
      island.nubMaterial.color.copy(baseNub).lerp(horizonColor, 0.3);
    }
  }

  return {
    group,
    stats: {
      meshes: peaks.length + (haze ? 1 : 0) + islands.length,
      drawCalls: peaks.length + (haze ? 1 : 0) + islands.length * 3,
    },
    update() {
      const time = performance.now() * 0.001;
      if (haze && hazeDrift) haze.mesh.rotation.y = time * hazeDrift;
      for (const island of islands) {
        island.group.position.y =
          island.group.userData.baseY +
          Math.sin(time * bobSpeed + island.group.userData.phase) * bobAmplitude;
        island.group.rotation.y = Math.sin(time * 0.08 + island.group.userData.phase) * 0.035;
      }
    },
    setAtmosphere,
    dispose() {
      for (const ring of peaks) {
        ring.geometry.dispose();
        ring.material.dispose();
      }
      if (haze) {
        haze.geometry.dispose();
        haze.material.dispose();
      }
      for (const island of islands) {
        island.group.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) object.material.dispose();
        });
      }
    },
  };
}
