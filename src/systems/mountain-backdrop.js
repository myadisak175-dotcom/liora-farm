import * as THREE from "three";

const DEG = Math.PI / 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorChannels(hex) {
  const value = Number(hex) >>> 0;
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function pushVertex(positions, colors, x, y, z, color) {
  positions.push(x, y, z);
  colors.push(color[0], color[1], color[2]);
  return positions.length / 3 - 1;
}

function buildLayerGeometry(layer = {}) {
  const chunks = Array.isArray(layer.chunks) ? layer.chunks : [];
  const positions = [];
  const colors = [];
  const indices = [];
  const baseY = Number.isFinite(layer.baseY) ? layer.baseY : -5;
  const shoulderRatio = clamp(Number(layer.shoulderRatio) || 0.64, 0.2, 0.9);
  const defaultRadius = (Number(layer.innerRadius) + Number(layer.outerRadius)) / 2 || 48;
  const depth = Math.max(2, Math.abs(Number(layer.outerRadius) - Number(layer.innerRadius)) || 7);
  const depthJitter = Math.max(0, Number(layer.depthJitter) || 0);
  const low = colorChannels(layer.colorLow ?? 0x70884f);
  const mid = colorChannels(layer.colorMid ?? 0x72805a);
  const peak = colorChannels(layer.colorPeak ?? 0x7a8170);

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const angle = (Number(chunk.angle) || 0) * DEG;
    const radius = Number(chunk.radius) || defaultRadius;
    const span = clamp(Number(chunk.span) || 32, 8, 80) * DEG;
    const peakY = Number.isFinite(chunk.height)
      ? chunk.height
      : (Number(layer.peakMin) + Number(layer.peakMax)) / 2 || 10;
    const rise = Math.max(0.1, peakY - baseY);
    const shoulderY = baseY + rise * shoulderRatio;
    const halfWidth = Math.max(3, radius * Math.sin(span / 2));
    const seed = Math.sin((chunkIndex + 1) * 91.173 + angle * 7.1);
    const peakOffset = seed * depthJitter;

    const radialX = Math.sin(angle);
    const radialZ = Math.cos(angle);
    const tangentX = Math.cos(angle);
    const tangentZ = -Math.sin(angle);

    const point = (side, radialOffset, y) => ({
      x: radialX * (radius + radialOffset) + tangentX * (halfWidth * side),
      y,
      z: radialZ * (radius + radialOffset) + tangentZ * (halfWidth * side),
    });

    // A chunk is a faceted mountain wedge viewed from inside the world ring.
    // Its base extends well below the island so no strip of sky can leak under
    // the silhouette when the camera pitches or orbits.
    const frontLeft = point(-1, -depth * 0.42, baseY);
    const frontRight = point(1, -depth * 0.42, baseY);
    const leftShoulder = point(-0.43, -depth * 0.08, shoulderY);
    const rightShoulder = point(0.43, -depth * 0.08, shoulderY * 0.97 + baseY * 0.03);
    const summit = point(seed * 0.08, peakOffset, peakY);
    const backLeft = point(-1, depth * 0.58, baseY);
    const backRight = point(1, depth * 0.58, baseY);

    const fl = pushVertex(positions, colors, frontLeft.x, frontLeft.y, frontLeft.z, low);
    const ls = pushVertex(positions, colors, leftShoulder.x, leftShoulder.y, leftShoulder.z, mid);
    const pk = pushVertex(positions, colors, summit.x, summit.y, summit.z, peak);
    const rs = pushVertex(positions, colors, rightShoulder.x, rightShoulder.y, rightShoulder.z, mid);
    const fr = pushVertex(positions, colors, frontRight.x, frontRight.y, frontRight.z, low);
    const bl = pushVertex(positions, colors, backLeft.x, backLeft.y, backLeft.z, low);
    const br = pushVertex(positions, colors, backRight.x, backRight.y, backRight.z, low);

    // Front silhouette, rear facets and end caps. DoubleSide is used on the
    // material because the player camera is inside the ring and can orbit 360°.
    indices.push(
      fl, ls, pk,
      fl, pk, fr,
      fr, pk, rs,
      fl, bl, ls,
      bl, pk, ls,
      bl, br, pk,
      br, rs, pk,
      br, fr, rs,
      fl, fr, br,
      fl, br, bl
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createLayer(layer, name, renderOrder) {
  const geometry = buildLayerGeometry(layer);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  material.name = `${name}Material`;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  return { mesh, geometry, material };
}

/**
 * Visual-only 360° mountain ring behind Home Island.
 *
 * The physical ridge remains responsible for gameplay blocking. These two
 * merged meshes exist only to close the horizon: one warmer near ring and one
 * cooler/taller far ring. They never participate in collision, terrain saves,
 * water depth, farming or Builder placement.
 */
export function createMountainBackdrop(config = {}) {
  const group = new THREE.Group();
  group.name = "MountainBackdrop";

  if (config.enabled === false) {
    return {
      group,
      meshes: [],
      stats: { meshes: 0, triangles: 0 },
      dispose() {},
    };
  }

  const layers = [];
  if (config.far?.chunks?.length) {
    layers.push(createLayer(config.far, "FarMountainBackdrop", -21));
  }
  if (config.near?.chunks?.length) {
    layers.push(createLayer(config.near, "NearMountainBackdrop", -20));
  }

  for (const layer of layers) group.add(layer.mesh);

  const triangles = layers.reduce(
    (sum, layer) => sum + (layer.geometry.index?.count ?? 0) / 3,
    0
  );

  return {
    group,
    meshes: layers.map((layer) => layer.mesh),
    stats: { meshes: layers.length, triangles },
    dispose() {
      for (const layer of layers) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
  };
}

export { buildLayerGeometry };
