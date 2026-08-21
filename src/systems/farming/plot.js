import * as THREE from "three";

function roundedRectShape(width, depth, radius) {
  const x = -width / 2;
  const y = -depth / 2;
  const r = Math.min(radius, width / 2, depth / 2);
  const shape = new THREE.Shape();

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + depth - r);
  shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
  shape.lineTo(x + r, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  return shape;
}

function makeFlatShapeGeometry(width, depth, radius) {
  const geometry = new THREE.ShapeGeometry(roundedRectShape(width, depth, radius), 4);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createFarmPlot(config) {
  const group = new THREE.Group();
  group.name = "HomeIslandFarmPlot";
  group.position.set(config.position.x, config.y, config.position.z);
  group.rotation.y = config.rotation;

  const soilTexture = new THREE.TextureLoader().load(
    config.soilTexture ?? "./assets/textures/dirt_ground.webp"
  );
  soilTexture.wrapS = soilTexture.wrapT = THREE.RepeatWrapping;
  const textureRepeat = Number(config.soilTextureRepeat) || 1.15;
  soilTexture.repeat.set(textureRepeat, textureRepeat);
  soilTexture.colorSpace = THREE.SRGBColorSpace;
  soilTexture.anisotropy = Math.max(1, Number(config.anisotropy) || 2);

  // Concept 1: one unified bed. The authored dirt texture lives on one continuous
  // top surface, while individual 3x3 cells are only lightweight state overlays.
  const baseMaterial = new THREE.MeshStandardMaterial({
    map: soilTexture,
    color: config.farmBorderTint ?? 0x8a5a36,
    roughness: 1,
    metalness: 0,
  });

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: soilTexture,
    color: config.plainSoilTint ?? 0xffffff,
    roughness: 1,
    metalness: 0,
  });

  const plainOverlayMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const tilledOverlayMaterial = new THREE.MeshBasicMaterial({
    color: config.tilledOverlayTint ?? 0x7a4d2f,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const wateredOverlayMaterial = new THREE.MeshBasicMaterial({
    color: config.wateredOverlayTint ?? 0x3e2b22,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const gridMaterial = new THREE.MeshBasicMaterial({
    color: config.gridColor ?? 0x5f3f2b,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const furrowMaterial = new THREE.MeshBasicMaterial({
    color: config.furrowColor ?? 0x684127,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });

  const wateredFurrowMaterial = new THREE.MeshBasicMaterial({
    color: config.wateredFurrowColor ?? 0x402a20,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });

  const pebbleMaterial = new THREE.MeshStandardMaterial({
    color: config.farmPebbleColor ?? 0x9d7a5b,
    roughness: 1,
    metalness: 0,
  });

  const visualGap = Math.min(Math.max(Number(config.gap) || 0.08, 0.05), 0.08);
  const cellSize = Number(config.cellSize) || 1;
  const total = config.columns * cellSize + (config.columns - 1) * visualGap;
  const start = -total / 2 + cellSize / 2;

  const borderWidth = Math.max(0.16, cellSize * 0.18);
  const outerWidth = total + borderWidth * 2;
  const outerDepth = total + borderWidth * 2;
  const outerRadius = Math.max(0.24, Number(config.cornerRadius) * 1.7 || 0.26);

  const baseHeight = Math.max(0.045, Number(config.moundHeight) * 0.62 || 0.05);
  const surfaceHeight = 0.022;
  const surfaceInset = Math.max(0.1, borderWidth * 0.58);
  const surfaceWidth = outerWidth - surfaceInset * 2;
  const surfaceDepth = outerDepth - surfaceInset * 2;
  const surfaceRadius = Math.max(0.18, outerRadius - surfaceInset * 0.45);

  const baseGeometry = new THREE.ExtrudeGeometry(
    roundedRectShape(outerWidth, outerDepth, outerRadius),
    {
      depth: baseHeight,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.04,
      bevelThickness: 0.025,
      curveSegments: 5,
    }
  );
  baseGeometry.rotateX(-Math.PI / 2);

  const surfaceGeometry = new THREE.ExtrudeGeometry(
    roundedRectShape(surfaceWidth, surfaceDepth, surfaceRadius),
    {
      depth: surfaceHeight,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.018,
      bevelThickness: 0.01,
      curveSegments: 5,
    }
  );
  surfaceGeometry.rotateX(-Math.PI / 2);

  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.name = "FarmBedBase";
  base.receiveShadow = true;
  base.castShadow = false;
  base.renderOrder = config.renderOrder;
  group.add(base);

  const surfaceBaseY = baseHeight - 0.004;
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  surface.name = "FarmBedSurface";
  surface.position.y = surfaceBaseY;
  surface.receiveShadow = true;
  surface.castShadow = false;
  surface.renderOrder = config.renderOrder + 1;
  group.add(surface);

  const surfaceTopY = surfaceBaseY + surfaceHeight + 0.004;

  // The 3x3 pattern is carved visually into one bed, instead of being nine
  // separate raised mounds. These separators stay visible in every soil state.
  const separatorThickness = 0.035;
  const separatorLength = total - 0.12;
  const horizontalSeparatorGeometry = new THREE.BoxGeometry(
    separatorLength,
    0.004,
    separatorThickness
  );
  const verticalSeparatorGeometry = new THREE.BoxGeometry(
    separatorThickness,
    0.004,
    separatorLength
  );

  for (let i = 0; i < config.columns - 1; i += 1) {
    const x = start + (i + 0.5) * (cellSize + visualGap);
    const groove = new THREE.Mesh(verticalSeparatorGeometry, gridMaterial);
    groove.position.set(x, surfaceTopY, 0);
    groove.renderOrder = config.renderOrder + 2;
    group.add(groove);
  }

  for (let i = 0; i < config.rows - 1; i += 1) {
    const z = start + (i + 0.5) * (cellSize + visualGap);
    const groove = new THREE.Mesh(horizontalSeparatorGeometry, gridMaterial);
    groove.position.set(0, surfaceTopY, z);
    groove.renderOrder = config.renderOrder + 2;
    group.add(groove);
  }

  const overlaySize = cellSize - 0.055;
  const overlayGeometry = makeFlatShapeGeometry(
    overlaySize,
    overlaySize,
    Math.min(0.12, overlaySize * 0.12)
  );
  const furrowGeometry = new THREE.BoxGeometry(cellSize * 0.58, 0.004, 0.032);
  const cells = [];

  for (let row = 0; row < config.rows; row += 1) {
    for (let column = 0; column < config.columns; column += 1) {
      const x = start + column * (cellSize + visualGap);
      const z = start + row * (cellSize + visualGap);

      const overlay = new THREE.Mesh(overlayGeometry, plainOverlayMaterial);
      overlay.position.set(x, surfaceTopY + 0.003, z);
      overlay.renderOrder = config.renderOrder + 3;
      group.add(overlay);

      // Tilling is indicated by shallow painted grooves, not raised bars.
      const furrows = [];
      for (const offset of [-0.19, 0.19]) {
        const furrow = new THREE.Mesh(furrowGeometry, furrowMaterial);
        furrow.position.set(x, surfaceTopY + 0.007, z + offset * cellSize);
        furrow.renderOrder = config.renderOrder + 4;
        furrow.visible = false;
        group.add(furrow);
        furrows.push(furrow);
      }

      cells.push({
        row,
        column,
        mesh: overlay,
        furrows,
        soilState: "plain",
        position: new THREE.Vector3(x, 0, z),
      });
    }
  }

  // A few tiny low-poly pebbles break up the perfect rectangle without turning
  // the plot into a decorative rock garden. They sit only on the outer border.
  const pebbleGeometry = new THREE.DodecahedronGeometry(0.075, 0);
  const pebblePoints = [
    [-0.42, -0.48, 0.85], [0.18, -0.50, 0.68], [0.48, -0.32, 0.82],
    [0.50, 0.12, 0.66], [0.39, 0.48, 0.76], [-0.22, 0.50, 0.64],
    [-0.49, 0.28, 0.78], [-0.50, -0.08, 0.62],
  ];
  const halfOuter = outerWidth / 2;
  for (let i = 0; i < pebblePoints.length; i += 1) {
    const [nx, nz, scale] = pebblePoints[i];
    const pebble = new THREE.Mesh(pebbleGeometry, pebbleMaterial);
    pebble.position.set(nx * halfOuter * 1.9, baseHeight + 0.045, nz * halfOuter * 1.9);
    pebble.scale.set(scale * 1.1, scale * 0.7, scale);
    pebble.rotation.set(0.15 * i, 0.43 * i, 0.08 * (i % 3));
    pebble.castShadow = false;
    pebble.receiveShadow = true;
    pebble.renderOrder = config.renderOrder + 2;
    group.add(pebble);
  }

  function setSoilState(index, state) {
    const cell = cells[index];
    if (!cell) return false;

    const next = state === "watered" || state === "tilled" ? state : "plain";
    cell.soilState = next;
    cell.mesh.material = next === "watered"
      ? wateredOverlayMaterial
      : next === "tilled"
        ? tilledOverlayMaterial
        : plainOverlayMaterial;

    const showFurrows = next !== "plain";
    for (const furrow of cell.furrows) {
      furrow.visible = showFurrows;
      furrow.material = next === "watered" ? wateredFurrowMaterial : furrowMaterial;
    }
    return true;
  }

  return {
    group,
    cells,
    setSoilState,
    getSoilState(index) {
      return cells[index]?.soilState ?? null;
    },
    dispose() {
      baseGeometry.dispose();
      surfaceGeometry.dispose();
      horizontalSeparatorGeometry.dispose();
      verticalSeparatorGeometry.dispose();
      overlayGeometry.dispose();
      furrowGeometry.dispose();
      pebbleGeometry.dispose();
      baseMaterial.dispose();
      surfaceMaterial.dispose();
      plainOverlayMaterial.dispose();
      tilledOverlayMaterial.dispose();
      wateredOverlayMaterial.dispose();
      gridMaterial.dispose();
      furrowMaterial.dispose();
      wateredFurrowMaterial.dispose();
      pebbleMaterial.dispose();
      soilTexture.dispose();
    },
  };
}
