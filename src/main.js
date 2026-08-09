import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d8ec);
scene.fog = new THREE.Fog(0xa8d8ec, 22, 48);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfff5dd, 0x496448, 2.2));
const sun = new THREE.DirectionalLight(0xffedc4, 3);
sun.position.set(-7, 12, 7);
sun.castShadow = true;
scene.add(sun);

// Step 1: lightweight seamless grass ground.
const textureLoader = new THREE.TextureLoader();
const grass = textureLoader.load('./assets/textures/grass.webp');
grass.wrapS = THREE.RepeatWrapping;
grass.wrapT = THREE.RepeatWrapping;
grass.repeat.set(8, 8);
grass.colorSpace = THREE.SRGBColorSpace;
grass.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(42, 42),
  new THREE.MeshStandardMaterial({ map: grass, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Temporary player only. No GLB models yet.
const player = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.28, 0.7, 5, 10),
  new THREE.MeshStandardMaterial({ color: 0xf4e5c7 })
);
body.position.y = 0.65;
body.castShadow = true;
player.add(body);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.31, 12, 8),
  new THREE.MeshStandardMaterial({ color: 0x684637 })
);
head.position.y = 1.18;
head.castShadow = true;
player.add(head);
player.position.set(0, 0, 5);
scene.add(player);

const keys = {}, joy = { x: 0, y: 0 };
let pointer = null;
addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const j = document.querySelector('#joy');
const st = document.querySelector('#stick');
function moveStick(e) {
  const r = j.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const max = 42, l = Math.hypot(dx, dy) || 1;
  if (l > max) { dx *= max / l; dy *= max / l; }
  joy.x = dx / max; joy.y = dy / max;
  st.style.transform = `translate(${dx}px,${dy}px)`;
}
j.addEventListener('pointerdown', e => { pointer = e.pointerId; j.setPointerCapture(pointer); moveStick(e); });
j.addEventListener('pointermove', e => { if (e.pointerId === pointer) moveStick(e); });
function end(e) {
  if (e.pointerId === pointer) {
    pointer = null; joy.x = joy.y = 0; st.style.transform = 'translate(0,0)';
  }
}
j.addEventListener('pointerup', end);
j.addEventListener('pointercancel', end);

const clock = new THREE.Clock();
const offset = new THREE.Vector3(8, 10, 10);
const look = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  let x = joy.x, z = joy.y;
  if (keys.a || keys.arrowleft) x -= 1;
  if (keys.d || keys.arrowright) x += 1;
  if (keys.w || keys.arrowup) z -= 1;
  if (keys.s || keys.arrowdown) z += 1;
  const l = Math.hypot(x, z);
  if (l > 0.05) {
    x /= Math.max(1, l); z /= Math.max(1, l);
    player.position.x += x * 4 * dt;
    player.position.z += z * 4 * dt;
  }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -18, 18);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -18, 18);
  look.set(player.position.x, 0.55, player.position.z);
  camera.position.lerp(look.clone().add(offset), 1 - Math.pow(0.002, dt));
  camera.lookAt(look);
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
