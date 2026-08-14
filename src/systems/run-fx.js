import * as THREE from "three";

function createSoftParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.72)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRunFx(scene, config) {
  const texture = createSoftParticleTexture();
  const particles = [];
  let spawnTimer = 0;
  let poolIndex = 0;
  const dryColor = new THREE.Color(config.color);
  const waterColor = new THREE.Color(config.waterColor ?? 0xcff8ff);

  for (let i = 0; i < config.maxParticles; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: dryColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = config.renderOrder;
    scene.add(sprite);
    particles.push({ sprite, age: 0, life: config.life, velocity: new THREE.Vector3(), startScale: 1, baseOpacity: config.opacity });
  }

  function spawn(position, moveDirection, waterState) {
    const particle = particles[poolIndex];
    poolIndex = (poolIndex + 1) % particles.length;
    const inWater = waterState.depth > (config.waterMinDepth ?? 0.06);
    const sideX = -moveDirection.z;
    const sideZ = moveDirection.x;
    const sideOffset = (Math.random() - 0.5) * config.sideSpread;
    const backOffset = config.backOffset + Math.random() * config.backJitter;

    const y = inWater
      ? waterState.level + (config.waterHeight ?? 0.035) + Math.random() * (config.waterHeightJitter ?? 0.035)
      : position.y + config.height + Math.random() * config.heightJitter;

    particle.sprite.position.set(
      position.x - moveDirection.x * backOffset + sideX * sideOffset,
      y,
      position.z - moveDirection.z * backOffset + sideZ * sideOffset
    );

    if (inWater) {
      particle.velocity.set(
        -moveDirection.x * (config.waterBackwardDrift ?? 0.2) + sideX * (Math.random() - 0.5) * (config.waterSideDrift ?? 0.5),
        (config.waterRiseSpeed ?? 0.55) + Math.random() * (config.waterRiseJitter ?? 0.25),
        -moveDirection.z * (config.waterBackwardDrift ?? 0.2) + sideZ * (Math.random() - 0.5) * (config.waterSideDrift ?? 0.5)
      );
      particle.life = (config.waterLife ?? 0.3) * (0.82 + Math.random() * 0.34);
      particle.startScale = (config.waterSize ?? 0.23) * (0.72 + Math.random() * 0.55);
      particle.baseOpacity = config.waterOpacity ?? 0.68;
      particle.sprite.material.color.copy(waterColor);
    } else {
      particle.velocity.set(
        -moveDirection.x * config.backwardDrift + sideX * (Math.random() - 0.5) * config.sideDrift,
        config.riseSpeed + Math.random() * config.riseJitter,
        -moveDirection.z * config.backwardDrift + sideZ * (Math.random() - 0.5) * config.sideDrift
      );
      particle.life = config.life * (0.85 + Math.random() * 0.3);
      particle.startScale = config.size * (0.8 + Math.random() * 0.45);
      particle.baseOpacity = config.opacity;
      particle.sprite.material.color.copy(dryColor);
    }

    particle.age = 0;
    particle.sprite.scale.setScalar(particle.startScale);
    particle.sprite.material.opacity = particle.baseOpacity;
    particle.sprite.visible = true;
  }

  return {
    update(position, moveDirection, running, delta, waterState = {}) {
      const depth = waterState.depth ?? 0;
      const moving = Boolean(waterState.moving);
      const inWater = depth > (config.waterMinDepth ?? 0.06);
      const shouldSpawn = inWater ? moving : running;
      const interval = inWater ? (config.waterSpawnInterval ?? 0.075) : config.spawnInterval;

      if (shouldSpawn && moveDirection.lengthSq() > 0.0001) {
        spawnTimer -= delta;
        if (spawnTimer <= 0) {
          spawnTimer = interval * (0.82 + Math.random() * 0.36);
          spawn(position, moveDirection, {
            depth,
            level: waterState.level ?? position.y,
          });
        }
      } else {
        spawnTimer = 0;
      }

      for (const particle of particles) {
        if (!particle.sprite.visible) continue;
        particle.age += delta;
        const t = particle.age / particle.life;
        if (t >= 1) {
          particle.sprite.visible = false;
          particle.sprite.material.opacity = 0;
          continue;
        }
        particle.sprite.position.addScaledVector(particle.velocity, delta);
        particle.velocity.y -= config.gravity * delta;
        const scale = particle.startScale * (1 + config.grow * t);
        particle.sprite.scale.setScalar(scale);
        particle.sprite.material.opacity = particle.baseOpacity * (1 - t) * (1 - t * 0.35);
      }
    },
    dispose() {
      for (const particle of particles) {
        scene.remove(particle.sprite);
        particle.sprite.material.dispose();
      }
      texture.dispose();
    },
  };
}
