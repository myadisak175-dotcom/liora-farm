import * as THREE from "three";

function roundedRectShape(width, depth, radius) {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new THREE.Shape();

  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(
    x + width,
    y + depth,
    x + width - radius,
    y + depth
  );
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  return shape;
}

export function createFarmPlot(config) {
  const group = new THREE.Group();
  group.name = "HomeIslandFarmPlot";
  group.position.set(config.position.x, config.y, config.position.z);
  group.rotation.y = config.rotation;

  // Reuse Liora's authored dirt texture instead of inventing a separate farm
  // surface. TextureLoader returns the texture immediately and fills the image
  // asynchronously, so the plot can stay synchronous like the rest of the zone.
  const soilTexture = new THREE.TextureLoader().load(
    config.soilTexture ?? "./assets/textures/dirt_ground.webp"
  );
  soilTexture.wrapS = soilTexture.wrapT = THREE.RepeatWrapping;
  const textureRepeat = Number(config.soilTextureRepeat) || 1.15;
  soilTexture.repeat.set(textureRepeat, textureRepeat);
  soilTexture.colorSpace = THREE.SRGBColorSpace;
  soilTexture.anisotropy = Math.max(1, Number(config.anisotropy) || 2);

  const plainMaterial = new THREE.MeshStandardMaterial({
    map: soilTexture,
    color: config.plainSoilTint ?? 0xffffff,
    roughness: 1,
    metalness: 0,
  });

  const tilledMaterial = new THREE.MeshStandardMaterial({
    map: soilTexture,
    color: config.tilledSoilTint ?? 0xf1dfcc,
    roughness: 0.96,
    metalness: 0,
  });

  const wateredMaterial = new THREE.MeshStandardMaterial({
    map: soilTexture,
    color: config.wateredSoilTint ?? 0x8a6954,
    roughness: 0.72,
    metalness: 0,
  });

  const furrowMaterial = new THREE.MeshStandardMaterial({
    color: config.furrowColor,
    roughness: 1,
    metalness: 0,
  });

  const wateredFurrowMaterial = new THREE.MeshStandardMaterial({
    color: config.wateredFurrowColor ?? 0x4d3021,
    roughness: 0.82,
    metalness: 0,
  });

  const cellGeometry = new THREE.ExtrudeGeometry(
    roundedRectShape(config.cellSize, config.cellSize, config.cornerRadius),
    {
      depth: config.moundHeight,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: config.bevelSize,
      bevelThickness: config.bevelThickness,
      curveSegments: 4,
    }
  );
  cellGeometry.rotateX(-Math.PI / 2);

  const furrowGeometry = new THREE.BoxGeometry(
    config.furrowWidth,
    config.furrowHeight,
    config.cellSize * 0.68
  );

  const total = config.columns * config.cellSize + (config.columns - 1) * config.gap;
  const start = -total / 2 + config.cellSize / 2;
  const cells = [];

  for (let row = 0; row < config.rows; row += 1) {
    for (let column = 0; column < config.columns; column += 1) {
      const x = start + column * (config.cellSize + config.gap);
      const z = start + row * (config.cellSize + config.gap);

      const cell = new THREE.Mesh(cellGeometry, plainMaterial);
      cell.position.set(x, 0, z);
      cell.receiveShadow = true;
      cell.castShadow = false;
      cell.renderOrder = config.renderOrder;
      group.add(cell);

      const furrows = [];
      for (const offset of [-0.18, 0.18]) {
        const furrow = new THREE.Mesh(furrowGeometry, furrowMaterial);
        furrow.position.set(
          x + offset * config.cellSize,
          config.furrowY,
          z
        );
        furrow.receiveShadow = true;
        furrow.renderOrder = config.renderOrder + 1;
        furrow.visible = false;
        group.add(furrow);
        furrows.push(furrow);
      }

      cells.push({
        row,
        column,
        mesh: cell,
        furrows,
        soilState: "plain",
        position: new THREE.Vector3(x, 0, z),
      });
    }
  }

  function setSoilState(index, state) {
    const cell = cells[index];
    if (!cell) return false;

    const next = state === "watered" || state === "tilled" ? state : "plain";
    cell.soilState = next;
    cell.mesh.material = next === "watered"
      ? wateredMaterial
      : next === "tilled"
        ? tilledMaterial
        : plainMaterial;

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
      cellGeometry.dispose();
      furrowGeometry.dispose();
      plainMaterial.dispose();
      tilledMaterial.dispose();
      wateredMaterial.dispose();
      furrowMaterial.dispose();
      wateredFurrowMaterial.dispose();
      soilTexture.dispose();
    },
  };
}
