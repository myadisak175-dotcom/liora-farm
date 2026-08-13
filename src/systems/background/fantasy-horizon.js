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

function makeMountainRing({ count, radiusMin, radiusMax, baseY, color, seed, heightMin, heightMax, widthMin, widthMax }) {
  const random = seededRandom(seed);
  const geometry = new THREE.ConeGeometry(1, 1, 6, 1, false);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshBasicMaterial({ color, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = `DistantMountains-${seed}`;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + (random() - 0.5) * 0.24;
    const radius = THREE.MathUtils.lerp(radiusMin, radiusMax, random());
    const height = THREE.MathUtils.lerp(heightMin, heightMax, random());
    const width = THREE.MathUtils.lerp(widthMin, widthMax, random());
    setInstance(
      mesh,
      i,
      new THREE.Vector3(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius),
      new THREE.Vector3(width, height, width * THREE.MathUtils.lerp(0.8, 1.25, random())),
      random() * TAU
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

function makeCloudSea() {
  const count = 58;
  const random = seededRandom(4242);
  const geometry = new THREE.SphereGeometry(1, 8, 5);
  const material = new THREE.MeshBasicMaterial({
    color: 0xeaf8ff,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "CloudSea";
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;

  for (let i = 0; i < count; i += 1) {
    const angle = random() * TAU;
    const radius = THREE.MathUtils.lerp(21, 67, Math.sqrt(random()));
    const y = THREE.MathUtils.lerp(-9.2, -5.6, random());
    const width = THREE.MathUtils.lerp(4.5, 9.5, random());
    const depth = THREE.MathUtils.lerp(3.2, 7.2, random());
    const height = THREE.MathUtils.lerp(0.7, 1.8, random());
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
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  group.position.set(x, y, z);
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

export function createFantasyHorizon() {
  const group = new THREE.Group();
  group.name = "FantasyHorizon";

  const cloudSea = makeCloudSea();
  group.add(cloudSea.mesh);

  const farMountains = makeMountainRing({
    count: 15,
    radiusMin: 69,
    radiusMax: 77,
    baseY: -8,
    color: 0x9ca7c4,
    seed: 91,
    heightMin: 17,
    heightMax: 29,
    widthMin: 7,
    widthMax: 12,
  });
  group.add(farMountains.mesh);

  const nearMountains = makeMountainRing({
    count: 12,
    radiusMin: 55,
    radiusMax: 64,
    baseY: -6.5,
    color: 0x7d7eaa,
    seed: 17,
    heightMin: 14,
    heightMax: 25,
    widthMin: 6,
    widthMax: 10,
  });
  group.add(nearMountains.mesh);

  const islands = [
    makeFloatingIsland({ angle: 0.72, radius: 45, y: 8.5, scale: 1.05, phase: 0.2 }),
    makeFloatingIsland({ angle: 2.82, radius: 51, y: 13.5, scale: 0.78, phase: 2.0 }),
    makeFloatingIsland({ angle: 4.72, radius: 47, y: 6.5, scale: 0.92, phase: 4.1 }),
  ];
  for (const island of islands) group.add(island.group);

  const baseNear = new THREE.Color(0x7476a2);
  const baseFar = new THREE.Color(0x99a5c2);
  const baseCloud = new THREE.Color(0xf4fbff);
  const baseTop = new THREE.Color(0x779b72);
  const baseRock = new THREE.Color(0x6b6273);

  function setAtmosphere(horizonColor, lowerColor) {
    nearMountains.material.color.copy(baseNear).lerp(horizonColor, 0.34);
    farMountains.material.color.copy(baseFar).lerp(horizonColor, 0.58);
    cloudSea.material.color.copy(baseCloud).lerp(horizonColor, 0.12);
    for (const island of islands) {
      island.topMaterial.color.copy(baseTop).lerp(horizonColor, 0.16);
      island.rockMaterial.color.copy(baseRock).lerp(lowerColor, 0.24);
      island.nubMaterial.color.copy(baseCloud).lerp(horizonColor, 0.2);
    }
  }

  return {
    group,
    update() {
      const time = performance.now() * 0.001;
      cloudSea.mesh.rotation.y = time * 0.0022;
      for (const island of islands) {
        island.group.position.y = island.group.userData.baseY + Math.sin(time * 0.45 + island.group.userData.phase) * 0.28;
        island.group.rotation.y = Math.sin(time * 0.08 + island.group.userData.phase) * 0.035;
      }
    },
    setAtmosphere,
    dispose() {
      cloudSea.geometry.dispose();
      cloudSea.material.dispose();
      nearMountains.geometry.dispose();
      nearMountains.material.dispose();
      farMountains.geometry.dispose();
      farMountains.material.dispose();
      for (const island of islands) {
        island.group.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) object.material.dispose();
        });
      }
    },
  };
}
