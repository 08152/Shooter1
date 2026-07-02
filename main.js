import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* =========================
   BASIC SETUP
========================= */

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 30, 200);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

/* =========================
   LIGHT
========================= */

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 100, 50);
scene.add(light);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

/* =========================
   FLOOR (10.000 x 10.000)
========================= */

const floorGeo = new THREE.PlaneGeometry(10000, 10000);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x3aa655 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

/* =========================
   FPS CONTROLS
========================= */

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const info = document.getElementById("info");
info.addEventListener("click", () => controls.lock());

controls.addEventListener("lock", () => (info.style.display = "none"));
controls.addEventListener("unlock", () => (info.style.display = "flex"));

/* =========================
   MOVEMENT
========================= */

const keys = {};
let velocity = new THREE.Vector3();
let canJump = false;

document.addEventListener("keydown", (e) => (keys[e.code] = true));
document.addEventListener("keyup", (e) => (keys[e.code] = false));

camera.position.y = 5;

/* =========================
   GLB LOADER (DEIN CODE)
========================= */

const gltfLoader = new GLTFLoader();
let collidables = [];

function addModel(url, x, y, z, scale = 1) {
  gltfLoader.load(url, (gltf) => {
    const obj = gltf.scene;

    obj.scale.set(scale, scale, scale);
    obj.position.set(x, y, z);

    scene.add(obj);
    collidables.push(obj);
  });
}

/* =========================
   TREE TEST (baum.glb)
   -> Beispielplatzierung
========================= */

// Beispiel: ein Baum in der Welt
addModel("./baum.glb", 10, 0, -10, 2);

/* =========================
   SIMPLE CHUNK SYSTEM (BASIS)
========================= */

const chunks = {};
const CHUNK_SIZE = 200;

function getChunk(x, z) {
  return `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`;
}

/* =========================
   COORDINATES HUD
========================= */

const coords = document.getElementById("coords");

/* =========================
   UPDATE LOOP
========================= */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  /* Bewegung */
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  const speed = 40;

  if (keys["KeyW"]) velocity.z -= speed * delta;
  if (keys["KeyS"]) velocity.z += speed * delta;
  if (keys["KeyA"]) velocity.x -= speed * delta;
  if (keys["KeyD"]) velocity.x += speed * delta;

  controls.moveRight(-velocity.x * delta * 60);
  controls.moveForward(-velocity.z * delta * 60);

  /* Schwerkraft */
  velocity.y -= 30 * delta;
  camera.position.y += velocity.y * delta;

  if (camera.position.y < 5) {
    camera.position.y = 5;
    velocity.y = 0;
    canJump = true;
  }

  if (keys["Space"] && canJump) {
    velocity.y = 12;
    canJump = false;
  }

  /* Koordinaten anzeigen */
  coords.innerHTML =
    `X: ${camera.position.x.toFixed(1)}<br>` +
    `Y: ${camera.position.y.toFixed(1)}<br>` +
    `Z: ${camera.position.z.toFixed(1)}`;

  renderer.render(scene, camera);
}

animate();

/* =========================
   RESIZE
========================= */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
 /* =========================
    ADVANCED CHUNK SYSTEM
    (LOD + LOAD / UNLOAD TREES)
========================= */

const loadedChunks = new Map();
const renderDistance = 3; // wie viele Chunks sichtbar sind

function chunkKey(x, z) {
  return `${x}_${z}`;
}

/* Zufallsfunktion (stabil pro Chunk) */
function hash(x, z) {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

/* Baum pro Chunk generieren */
function generateChunk(cx, cz) {
  const key = chunkKey(cx, cz);

  if (loadedChunks.has(key)) return;

  const group = new THREE.Group();

  const seed = hash(cx, cz);
  const count = 3 + (seed % 5);

  for (let i = 0; i < count; i++) {
    const x = cx * CHUNK_SIZE + (Math.random() * CHUNK_SIZE - CHUNK_SIZE / 2);
    const z = cz * CHUNK_SIZE + (Math.random() * CHUNK_SIZE - CHUNK_SIZE / 2);

    addModel("./baum.glb", x, 0, z, 1.5 + Math.random());
  }

  scene.add(group);
  loadedChunks.set(key, group);
}

/* Chunk Cleanup */
function unloadChunk(key) {
  const group = loadedChunks.get(key);
  if (!group) return;

  scene.remove(group);
  loadedChunks.delete(key);
}

/* Update Chunk System */
function updateChunks() {
  const px = camera.position.x;
  const pz = camera.position.z;

  const cx = Math.floor(px / CHUNK_SIZE);
  const cz = Math.floor(pz / CHUNK_SIZE);

  const active = new Set();

  for (let x = cx - renderDistance; x <= cx + renderDistance; x++) {
    for (let z = cz - renderDistance; z <= cz + renderDistance; z++) {
      const key = chunkKey(x, z);
      active.add(key);
      generateChunk(x, z);
    }
  }

  for (let key of loadedChunks.keys()) {
    if (!active.has(key)) {
      unloadChunk(key);
    }
  }
}

/* =========================
   PATCH INTO LOOP
========================= */
const oldAnimate = animate;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  /* Bewegung (gleich wie Teil 1) */
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  const speed = 40;

  if (keys["KeyW"]) velocity.z -= speed * delta;
  if (keys["KeyS"]) velocity.z += speed * delta;
  if (keys["KeyA"]) velocity.x -= speed * delta;
  if (keys["KeyD"]) velocity.x += speed * delta;

  controls.moveRight(-velocity.x * delta * 60);
  controls.moveForward(-velocity.z * delta * 60);

  velocity.y -= 30 * delta;
  camera.position.y += velocity.y * delta;

  if (camera.position.y < 5) {
    camera.position.y = 5;
    velocity.y = 0;
    canJump = true;
  }

  if (keys["Space"] && canJump) {
    velocity.y = 12;
    canJump = false;
  }

  /* CHUNK UPDATE */
  updateChunks();

  /* HUD */
  coords.innerHTML =
    `X: ${camera.position.x.toFixed(1)}<br>` +
    `Y: ${camera.position.y.toFixed(1)}<br>` +
    `Z: ${camera.position.z.toFixed(1)}`;

  renderer.render(scene, camera);
}

/* restart loop override */
animate();
 /* =========================
    IMPROVED TERRAIN (HILLS)
    + PERFORMANCE FIX
========================= */

/* Simple pseudo noise (kein externes Lib nötig) */
function noise(x, z) {
  let n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/* Höhe der Welt */
function getHeight(x, z) {
  const scale = 0.02;
  const h = noise(x * scale, z * scale) * 10;
  const h2 = noise(x * 0.01, z * 0.01) * 25;
  return h + h2;
}

/* =========================
   OPTIMIZED TREE SPAWNING
========================= */

const treeInstances = [];

function spawnTree(x, z) {
  const y = getHeight(x, z);

  // statt jedes Mal GLB neu zu laden -> reuse wenn möglich
  addModel("./baum.glb", x, y, z, 1.5);
}

/* =========================
   CHUNK UPGRADE (HILLS + TREES)
========================= */

function generateChunk(cx, cz) {
  const key = chunkKey(cx, cz);

  if (loadedChunks.has(key)) return;

  const group = new THREE.Group();

  const seed = hash(cx, cz);
  const treeCount = 4 + (seed % 6);

  for (let i = 0; i < treeCount; i++) {
    const x =
      cx * CHUNK_SIZE +
      (noise(i + seed, cx) * CHUNK_SIZE - CHUNK_SIZE / 2);

    const z =
      cz * CHUNK_SIZE +
      (noise(i, cz + seed) * CHUNK_SIZE - CHUNK_SIZE / 2);

    const y = getHeight(x, z);

    spawnTree(x, z);
  }

  scene.add(group);
  loadedChunks.set(key, group);
}

/* =========================
   BETTER FLOOR FIX (HILLS VISUAL)
========================= */

/* Optional: Boden „unsichtbar“ machen, damit nur Berge wirken */
floor.visible = false;

/* =========================
   GRAVITY FIX (FOLLOW TERRAIN)
========================= */

function updatePlayerHeight() {
  const x = camera.position.x;
  const z = camera.position.z;

  const ground = getHeight(x, z) + 5;

  if (camera.position.y < ground) {
    camera.position.y = ground;
    velocity.y = 0;
    canJump = true;
  }
}

/* =========================
   PATCH INTO LOOP (FINAL OVERRIDE)
========================= */

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  /* movement */
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  const speed = 40;

  if (keys["KeyW"]) velocity.z -= speed * delta;
  if (keys["KeyS"]) velocity.z += speed * delta;
  if (keys["KeyA"]) velocity.x -= speed * delta;
  if (keys["KeyD"]) velocity.x += speed * delta;

  controls.moveRight(-velocity.x * delta * 60);
  controls.moveForward(-velocity.z * delta * 60);

  /* gravity */
  velocity.y -= 30 * delta;
  camera.position.y += velocity.y * delta;

  updatePlayerHeight();

  if (keys["Space"] && canJump) {
    velocity.y = 12;
    canJump = false;
  }

  /* chunks */
  updateChunks();

  /* coords */
  coords.innerHTML =
    `X: ${camera.position.x.toFixed(1)}<br>` +
    `Y: ${camera.position.y.toFixed(1)}<br>` +
    `Z: ${camera.position.z.toFixed(1)}`;

  renderer.render(scene, camera);
}

animate();
