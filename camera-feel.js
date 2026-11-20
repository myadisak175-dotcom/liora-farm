/* ==========================================================================
   camera-feel.js  —  the feel a big game's camera has, laid over the player's camera (player-camera.js) without taking
   it from the player: it never turns the view round behind her, never changes the angle or the distance the player
   chose. (A camera that came round behind her by itself was tried in the first trial of the moves; the player's own was
   liked better.) A trial, on magic-jump.html (the 🎥 button), asked for after the user asked whether the physics and
   the camera feel like a AAA game yet ("ฟิสิกส์ มุมกล้อง เหมือนเกม AAA ยัง") and chose to start with the camera.

     const feel = createCameraFeel({ camera })
     every frame, around the player's camera:
       feel.before()                          takes off what it put on the camera last frame (the player's camera
                                              smooths from where it left the camera, not from where this moved it)
       const f = feel.follow(dt, { pos, aimY, air, vy, over })    what to give the player's camera to follow:
                                              { pos, aimY }, softened (see below). pos: her feet; aimY: the height the
                                              view stands on (the page's); air: in the air; vy: m/s up; over: m of air under her
       cam.update(dt, { pos: f.pos, aimY: f.aimY, ... })
       feel.after(dt)                         the tilt, the shake, the dip, the field of view
     feel.kick(strength)                      she was launched (a jump off the ground or off a circle): 0..1
     feel.land(impact, drop)                  she came down: how hard (0..1, magic-jump.js' impact) and from how high (m)
     feel.reset()                             (the camera put somewhere else at once)

   What it does:
     - in the air the view comes after her, a little behind (a spring, LAG): she is seen to rise in the picture and the
       view catches her at the top, as a big game's camera on a spring arm. On the ground it keeps to her closely
     - falling fast from high (FALL_FROM m over the ground, faster than FALL_V m/s), the view looks down a little
       (TILT radians at most) and stands a little lower, so where she will land is in the picture
     - every launch widens the view a moment (FOV_KICK degrees at most: the last jump of a set, the most), a push felt
     - a hard landing dips the view (DIP m) and shakes it a little (SHAKE: m and degrees of roll at most), quickly over;
       a small hop does neither
   ========================================================================== */
import * as THREE from 'three';

const LAG_AIR = 7, LAG_GROUND = 22;          // 1/s: how quickly the view's place comes after her (in the air; on the ground)
const AIM_AIR = 8, AIM_GROUND = 20;          // 1/s: how quickly the view's height does
const FALL_FROM = 2.2, FALL_V = 4, TILT = 0.13, FALL_LOWER = 0.9;    // m, m/s, radians, m the view stands lower at most
const FOV_KICK = 6;                          // degrees, at most
const DIP = 0.12, SHAKE = [0.05, 1.4];       // m; m and degrees
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

export function createCameraFeel({ camera }) {
  const baseFov = camera.fov;
  const lag = new THREE.Vector3(), out = new THREE.Vector3(), put = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let ready = false, aim = 0, tilt = 0, lower = 0;
  let fov = 0, fovV = 0;                     // degrees wider, and how fast that is changing (a spring)
  let dip = 0, dipV = 0;                     // m the view is down, and how fast (a spring)
  let trauma = 0, clock = 0;
  // a spring toward 0 (x, v), w its pace (1/s), z how damped (1: no running past), in small steps
  const spring = (x, v, w, z, dt) => {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { v += (-w * w * x - 2 * z * w * v) * h; x += v * h; }
    return [x, v];
  };
  const feel = {
    before() {
      camera.position.sub(put);
      put.set(0, 0, 0);
    },
    follow(dt, { pos, aimY, air, vy = 0, over = 0 }) {
      if (!ready) { lag.copy(pos); aim = aimY; ready = true; }
      const kp = Math.min(1, dt * (air ? LAG_AIR : LAG_GROUND)), ka = Math.min(1, dt * (air ? AIM_AIR : AIM_GROUND));
      lag.x += (pos.x - lag.x) * kp; lag.z += (pos.z - lag.z) * kp;
      lag.y = pos.y;
      // falling fast from high: the view stands lower and looks down, toward where she will land
      const falling = air ? sstep(FALL_V, FALL_V * 2.2, -vy) * sstep(FALL_FROM * 0.6, FALL_FROM * 1.6, over) : 0;
      tilt += (TILT * falling - tilt) * Math.min(1, dt * (falling > tilt / TILT ? 5 : 3));
      lower += (FALL_LOWER * falling * Math.min(1, over / 4) - lower) * Math.min(1, dt * 5);
      aim += (aimY - lower - aim) * ka;
      out.copy(lag);
      return { pos: out, aimY: aim };
    },
    kick(strength = 0.5) {
      fovV += 30 + 70 * clamp(strength, 0, 1);       // (its peak about FOV_KICK at full strength)
    },
    land(impact = 0, drop = 0) {
      const hard = clamp(impact, 0, 1) * sstep(1.0, 4.5, drop);
      dipV -= DIP * 20 * hard;                        // (its deepest about DIP at full)
      trauma = Math.max(trauma, sstep(1.8, 5, drop) * clamp(impact, 0, 1));
    },
    reset() { ready = false; fov = fovV = dip = dipV = trauma = tilt = lower = 0; },
    after(dt) {
      clock += dt;
      [fov, fovV] = spring(fov, fovV, 9, 0.7, dt);
      fov = clamp(fov, -2, FOV_KICK);
      [dip, dipV] = spring(dip, dipV, 11, 0.55, dt);
      trauma = Math.max(0, trauma - dt * 2.4);
      // the tilt down (about the view's own side), the shake (a roll and a small move, a smooth jitter), the dip
      camera.rotateX(-tilt);
      const s = trauma * trauma;
      if (s > 1e-4) {
        const n1 = Math.sin(clock * 47) * 0.6 + Math.sin(clock * 83 + 1.3) * 0.4, n2 = Math.sin(clock * 59 + 2.1) * 0.6 + Math.sin(clock * 97) * 0.4;
        const n3 = Math.sin(clock * 41 + 0.7) * 0.5 + Math.sin(clock * 71 + 2.9) * 0.5;
        camera.rotateZ(THREE.MathUtils.degToRad(SHAKE[1]) * s * n3);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        put.addScaledVector(right, SHAKE[0] * s * n1).addScaledVector(up, SHAKE[0] * s * n2);
      }
      put.y += dip;
      camera.position.add(put);
      const want = baseFov + fov;
      if (Math.abs(camera.fov - want) > 1e-3) { camera.fov = want; camera.updateProjectionMatrix(); }
    },
  };
  return feel;
}
