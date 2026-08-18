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

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function hash(a, b) {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * One snow-capped summit, built rather than coned.
 *
 * A `ConeGeometry` in a single flat colour is a paper cut-out: straight
 * flanks, a perfectly round base, and the same grey from foot to summit. This
 * gives it the three things that read as a mountain at distance: flanks that
 * steepen toward the top, ridgelines running down the sides, and snow above a
 * ragged line.
 *
 * It is not free. A 6-sided cone is about 12 triangles; this is 9 x 6 x 2 =
 * 108, so the two rings go from roughly 290 triangles to 3,500. That is still
 * nothing next to one tree, and the draw calls — one per ring — do not change,
 * which is the budget the horizon tests actually guard.
 */
function makePeakGeometry(spec = {}) {
  const radial = Math.max(5, Math.round(Number(spec.radialSegments) || 9));
  const rows = Math.max(3, Math.round(Number(spec.heightSegments) || 6));
  const seed = Number(spec.seed) || 1337;
  const ridge = clamp01(Number(spec.ridge ?? 0.26));
  const snowLine = clamp01(Number(spec.snowLine ?? 0.55));
  const snowRoughness = clamp01(Number(spec.snowRoughness ?? 0.12));
  const rock = [0.3, 0.35, 0.44];
  const rockShadow = [0.17, 0.21, 0.3];
  const snow = [1, 1, 1];

  const positions = [];
  const colors = [];
  const indices = [];

  for (let row = 0; row <= rows; row += 1) {
    const u = row / rows;
    // Concave flanks: a straight cone rises linearly, a mountain leaves its
    // base wide and pulls in sharply near the summit.
    const radius = Math.pow(1 - u, 1.45);
    for (let step = 0; step <= radial; step += 1) {
      const angle = (step % radial) / radial * TAU;
      // Two spur terms: one broad enough to carve a ridgeline down the whole
      // flank, one finer so the silhouette breaks up instead of reading as a
      // cone someone dented.
      const index = step % radial;
      const spur = 1
        + (hash(seed, index) - 0.5) * 2 * ridge * (1 - u * 0.3)
        + (hash(seed * 3.1, index * 2.7 + u * 9) - 0.5) * ridge * 0.45 * (1 - u);
      const x = Math.cos(angle) * radius * spur;
      const z = Math.sin(angle) * radius * spur;
      const line = snowLine + (hash(seed * 1.7, step % radial) - 0.5) * 2 * snowRoughness;
      const cover = clamp01((u - line) / Math.max(0.05, 1 - line));
      // The side facing away from the light stays in shadow all the way up,
      // which is what separates one summit from the next behind it.
      const lit = 0.5 + 0.5 * Math.cos(angle - 0.9);
      const base = lerpColor(rockShadow, rock, lit);
      const color = lerpColor(base, snow, cover * cover * (3 - 2 * cover));
      positions.push(x, u, z);
      colors.push(color[0], color[1], color[2]);
    }
  }

  const stride = radial + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let step = 0; step < radial; step += 1) {
      const a = row * stride + step;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One instanced ring of peaks. Unlit on purpose: at 200 m-plus the only thing
 * that should shape these is atmosphere, and a silhouette tinted toward the
 * sky is exactly how distance reads.
 *
 * `baseY` sits well below the visual ground so a peak always rises out of the
 * land; the peak's own base is buried and never seen.
 */
function makePeakRing(spec = {}) {
  const count = Math.max(0, Math.round(Number(spec.count) || 0));
  const random = seededRandom(Number(spec.seed) || 1337);
  const geometry = makePeakGeometry(spec);
  // vertexColors carries the rock/snow gradient; material.color is the
  // aerial-perspective tint for this whole ring, so a far range reads bluer
  // than the one in front of it without rebuilding the geometry.
  const material = new THREE.MeshBasicMaterial({
    color: spec.color ?? 0x9ca7c4,
    vertexColors: true,
    // Scene fog would be a second haze on top of setAtmosphere's, and two
    // blends toward a near-white horizon is what turned these summits into
    // pale glass. Distance is expressed once, by the tint below.
    fog: false,
  });
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

  const driftSpeed = Math.max(0, Number(spec.driftSpeed) || 0);
  const flowSpeed = Math.max(0.01, Number(spec.flowSpeed) || 0.28);
  const radialDrift = Math.max(0, Number(spec.radialDrift) || 0);
  const lift = Math.max(0, Number(spec.lift) || 0);
  const breathe = THREE.MathUtils.clamp(Number(spec.breathe) || 0, 0, 0.16);
  const banks = [];

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
    banks.push({
      angle,
      radius,
      y,
      width,
      depth,
      height,
      rotationY: random() * TAU,
      phase: random() * TAU,
      drift: THREE.MathUtils.lerp(0.68, 1.32, random()),
      flow: THREE.MathUtils.lerp(0.72, 1.28, random()),
    });
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  /**
   * Move every bank at a slightly different rate. A single rotating ring made
   * the old haze look like scenery on a turntable; independent tangential,
   * radial and vertical motion reads as fog flowing around the distant land.
   */
  function update(time = 0) {
    for (let i = 0; i < banks.length; i += 1) {
      const bank = banks[i];
      const flowPhase = bank.phase + time * flowSpeed * bank.flow;
      const angle = bank.angle + time * driftSpeed * bank.drift;
      const radius = bank.radius + Math.sin(flowPhase) * radialDrift;
      position.set(
        Math.cos(angle) * radius,
        bank.y + Math.sin(flowPhase * 0.83) * lift,
        Math.sin(angle) * radius
      );
      euler.x = 0;
      euler.y = bank.rotationY + Math.sin(flowPhase * 0.41) * 0.14;
      euler.z = 0;
      quaternion.setFromEuler(euler);
      const breath = Math.sin(flowPhase * 0.71) * breathe;
      scale.set(
        bank.width * (1 + breath),
        bank.height * (1 + Math.cos(flowPhase * 0.89) * breathe * 0.7),
        bank.depth * (1 - breath * 0.6)
      );
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return { mesh, geometry, material, update };
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
      // Enough tint to sit back in the air, not so much that rock and snow
      // both arrive at the same pale grey.
      const blend = peaks.length === 1 ? 0.2 : 0.16 + (i / (peaks.length - 1)) * 0.2;
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
    update(timeSeconds = null) {
      const time = Number.isFinite(timeSeconds) ? timeSeconds : performance.now() * 0.001;
      haze?.update(time);
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
