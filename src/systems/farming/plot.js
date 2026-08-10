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

  const soilMaterial = new THREE.MeshStandardMaterial({
    color: config.soilColor,
    roughness: 1,
    metalness: 0,
  });

  const furrowMaterial = new THREE.MeshStandardMaterial({
    color: config.furrowColor,
    roughness: 1,
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

      const cell = new THREE.Mesh(cellGeometry, soilMaterial);
      cell.position.set(x, 0, z);
      cell.receiveShadow = true;
      cell.castShadow = false;
      cell.renderOrder = config.renderOrder;
      group.add(cell);

      // Two subtle grooves make each tile read as tilled soil without heavy geometry.
      for (const offset of [-0.18, 0.18]) {
        const furrow = new THREE.Mesh(furrowGeometry, furrowMaterial);
        furrow.position.set(
          x + offset * config.cellSize,
          config.furrowY,
          z
        );
        furrow.receiveShadow = true;
        furrow.renderOrder = config.renderOrder + 1;
        group.add(furrow);
      }

      cells.push({ row, column, mesh: cell, position: new THREE.Vector3(x, 0, z) });
    }
  }

  return {
    group,
    cells,
    dispose() {
      cellGeometry.dispose();
      furrowGeometry.dispose();
      soilMaterial.dispose();
      furrowMaterial.dispose();
    },
  };
}
