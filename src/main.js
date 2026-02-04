import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as CANNON from "cannon-es";

import feltUrl from "./assets/felt.jpg";
import woodUrl from "./assets/wood.jpg";

document.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });
window.oncontextmenu = (e) => e.preventDefault();

// ------- Device detection (simple) -------
const isTouchDevice =
  ("ontouchstart" in window) ||
  (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

const isMobileLike = isTouchDevice || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ------- Container Vite (#app) -------
const app = document.getElementById("app");
app.innerHTML = "";

// ------- HUD -------
const hud = document.createElement("div");
hud.id = "hud";
hud.innerHTML = `
  <div><b>Résultat :</b> <span id="result">—</span></div>
  <div class="hint" id="hint"></div>
`;
document.body.appendChild(hud);
const resultEl = document.getElementById("result");
const hintEl = document.getElementById("hint");

// ------- Intro Menu -------
const intro = document.createElement("div");
intro.id = "intro";
intro.innerHTML = `
  <div class="panel">
    <div class="title">Jeu de Dé</div>
    <div class="subtitle">Lancer un dé dans un bac de feutrine</div>

    <div class="section" id="controlsSection"></div>

    <div class="buttons">
      <button id="btnStart">Commencer</button>
      <button id="btnThrow" class="secondary">Lancer</button>
    </div>

    <div class="foot" id="footNote"></div>
  </div>
`;
document.body.appendChild(intro);

const btnStart = intro.querySelector("#btnStart");
const btnThrow = intro.querySelector("#btnThrow");
const controlsSection = intro.querySelector("#controlsSection");
const footNote = intro.querySelector("#footNote");

// ------- Overlay FPS (PC only) -------
const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.innerHTML = `
  <div class="box">
    <div class="title">Mode FPS</div>
    <div class="text">Clique pour commencer (capturer la souris)</div>
    <div class="text small">Échap = libérer la souris</div>
  </div>
`;
document.body.appendChild(overlay);

// ---------- BAC CIRCULAIRE ----------
const tray = {
  rInner: 2.6,
  wallT: 0.28,
  wallH: 0.75,
  floorT: 0.22,
  y: 1.05,
  segments: 64,
};
const rOuter = tray.rInner + tray.wallT;

// Caméra de départ (vue d'ensemble)
const startDist = rOuter * 3.2;
const startHeight = rOuter * 2.2;

// ------- THREE -------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 6, 22);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, tray.y + startHeight, startDist);
camera.lookAt(0, tray.y, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// Empêche le scroll / zoom “page” pendant le jeu sur mobile
renderer.domElement.style.touchAction = "none";

// Reflets réalistes
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 1.05));

const dir = new THREE.DirectionalLight(0xffffff, 1.25);
dir.position.set(6, 10, 4);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.near = 1;
dir.shadow.camera.far = 45;
dir.shadow.camera.left = -12;
dir.shadow.camera.right = 12;
dir.shadow.camera.top = 12;
dir.shadow.camera.bottom = -12;
dir.shadow.bias = -0.0002;
dir.shadow.normalBias = 0.02;
scene.add(dir);

scene.add(new THREE.AmbientLight(0xffffff, 0.22));

// ------- Controls (PointerLock for PC only) -------
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);
controls.object.position.set(0, tray.y + startHeight, startDist);
controls.object.lookAt(0, tray.y, 0);

// UI text per device
if (isMobileLike) {
  hintEl.textContent = "Mobile : tap n’importe où pour relancer le dé";
  controlsSection.innerHTML = `
    <div class="label">Commandes (mobile)</div>
    <ul>
      <li><b>Tap</b> sur l’écran : relancer le dé</li>
    </ul>
  `;
  footNote.textContent = "Astuce : une fois dans le jeu, touche l’écran pour relancer.";
  overlay.style.display = "none";
} else {
  hintEl.textContent = "PC : Clique pour activer FPS • WASD • Souris • Espace/Ctrl • R";
  controlsSection.innerHTML = `
    <div class="label">Commandes (PC)</div>
    <ul>
      <li><b>W</b> avancer • <b>S</b> reculer • <b>A</b>/<b>D</b> gauche/droite</li>
      <li><b>Souris</b> : regarder autour</li>
      <li><b>Espace</b> monter • <b>Ctrl</b> descendre</li>
      <li><b>R</b> : relancer le dé</li>
      <li><b>Échap</b> : libérer la souris</li>
    </ul>
  `;
  footNote.textContent = "Clique sur “Commencer” pour activer le mode FPS.";
  overlay.style.display = "flex";
}

// Intro menu behavior
let gameStarted = false;

// PC pointer lock UX
overlay.addEventListener("click", () => {
  if (!isMobileLike) controls.lock();
});

controls.addEventListener("lock", () => {
  overlay.style.display = "none";
});
controls.addEventListener("unlock", () => {
  if (gameStarted && !isMobileLike) overlay.style.display = "flex";
});

document.addEventListener("pointerlockerror", () => {
  if (!isMobileLike) {
    overlay.querySelector(".text").textContent =
      "Pointer Lock refusé. Clique dans la page et réessaie (pas dans la console F12).";
    overlay.style.display = "flex";
  }
});

btnStart.addEventListener("click", () => {
  intro.style.display = "none";
  gameStarted = true;

  if (!isMobileLike) {
    overlay.style.display = "flex";
    controls.lock();
  } else {
    // Sur mobile, rien à “locker”
    // On laisse la caméra fixe (vue d'ensemble) + tap pour relancer
  }
});

btnThrow.addEventListener("click", () => {
  intro.style.display = "none";
  gameStarted = true;

  if (!isMobileLike) {
    overlay.style.display = "flex";
    controls.lock();
  }
  setTimeout(() => throwDice(), 50);
});

// ------- Keyboard input (PC only) -------
const keys = { forward:false, backward:false, left:false, right:false, up:false, down:false };

function setKey(e, isDown) {
  switch (e.code) {
    case "KeyW": keys.forward = isDown; break;
    case "KeyS": keys.backward = isDown; break;
    case "KeyA": keys.left = isDown; break;
    case "KeyD": keys.right = isDown; break;
    case "Space": keys.up = isDown; break;
    case "ControlLeft":
    case "ControlRight": keys.down = isDown; break;
  }
}

window.addEventListener("keydown", (e) => {
  if (!gameStarted) return;
  if (isMobileLike) return;

  setKey(e, true);
  if (e.code === "KeyR") throwDice();
  if (e.code === "Space") e.preventDefault();
}, { passive: false });

window.addEventListener("keyup", (e) => {
  if (isMobileLike) return;
  setKey(e, false);
});

const moveSpeed = 5.5;
const verticalSpeed = 4.5;

// ------- Mobile: tap anywhere to throw (single tap) -------
let lastTapMs = 0;
function mobileTapThrow() {
  if (!gameStarted) return;
  const now = performance.now();
  // anti double-tap / ghost clicks
  if (now - lastTapMs < 250) return;
  lastTapMs = now;
  throwDice();
}

// On capte pointerdown sur le canvas
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (!isMobileLike) return;
  e.preventDefault();
  mobileTapThrow();
}, { passive: false });

// ---------- Textures bac (bois + feutrine) ----------
const texLoader = new THREE.TextureLoader();

// Feutrine (image)
const feltTex = texLoader.load(feltUrl);
feltTex.colorSpace = THREE.SRGBColorSpace;
feltTex.wrapS = THREE.RepeatWrapping;
feltTex.wrapT = THREE.RepeatWrapping;
feltTex.repeat.set(2.0, 2.0);

// Bois (image)
const woodTex = texLoader.load(woodUrl);
woodTex.colorSpace = THREE.SRGBColorSpace;
woodTex.wrapS = THREE.RepeatWrapping;
woodTex.wrapT = THREE.RepeatWrapping;
woodTex.repeat.set(2.0, 1.0);

// Matériau bois
const trayWoodMat = new THREE.MeshStandardMaterial({
  map: woodTex,
  roughness: 0.9,
  metalness: 0.0,
});

// ---------- BAC CIRCULAIRE (THREE) ----------
const trayGroup = new THREE.Group();
scene.add(trayGroup);

// 1) Fond bois (cylindre)
{
  const geo = new THREE.CylinderGeometry(rOuter, rOuter, tray.floorT, tray.segments);
  const mesh = new THREE.Mesh(geo, trayWoodMat);
  mesh.position.set(0, tray.y - tray.floorT / 2, 0);
  mesh.receiveShadow = true;
  trayGroup.add(mesh);
}

// 2) Paroi SOLIDE (anneau extrudé)
{
  const wallShape = new THREE.Shape();
  wallShape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);

  const holePath = new THREE.Path();
  holePath.absarc(0, 0, tray.rInner, 0, Math.PI * 2, true);
  wallShape.holes.push(holePath);

  const geom = new THREE.ExtrudeGeometry(wallShape, {
    depth: tray.wallH,
    bevelEnabled: false,
    curveSegments: tray.segments,
  });

  geom.rotateX(-Math.PI / 2);
  geom.translate(0, tray.y, 0);

  const wall = new THREE.Mesh(geom, trayWoodMat);
  wall.castShadow = true;
  wall.receiveShadow = true;
  trayGroup.add(wall);

  // Rebord arrondi
  const rimGeo = new THREE.TorusGeometry(rOuter - tray.wallT * 0.35, tray.wallT * 0.22, 16, tray.segments);
  const rim = new THREE.Mesh(rimGeo, trayWoodMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, tray.y + tray.wallH, 0);
  rim.castShadow = true;
  rim.receiveShadow = true;
  trayGroup.add(rim);
}

// 3) Feutrine dynamique (image + chiffre)
const feltCanvas = document.createElement("canvas");
feltCanvas.width = 1024;
feltCanvas.height = 1024;
const feltCtx = feltCanvas.getContext("2d");

const feltDynamicTex = new THREE.CanvasTexture(feltCanvas);
feltDynamicTex.colorSpace = THREE.SRGBColorSpace;
feltDynamicTex.wrapS = THREE.RepeatWrapping;
feltDynamicTex.wrapT = THREE.RepeatWrapping;
feltDynamicTex.repeat.set(2.0, 2.0);
feltDynamicTex.anisotropy = 8;

const trayFeltDynamicMat = new THREE.MeshStandardMaterial({
  map: feltDynamicTex,
  roughness: 1.0,
  metalness: 0.0,
});

function drawFeltBase() {
  const w = feltCanvas.width;
  const h = feltCanvas.height;

  feltCtx.clearRect(0, 0, w, h);
  feltCtx.fillStyle = "#2f7f66";
  feltCtx.fillRect(0, 0, w, h);

  const img = feltTex.image;
  if (img && img.width) {
    const pattern = feltCtx.createPattern(img, "repeat");
    if (pattern) {
      feltCtx.fillStyle = pattern;
      feltCtx.fillRect(0, 0, w, h);
    }
  }
}

function drawFeltResult(value) {
  const w = feltCanvas.width;
  const h = feltCanvas.height;

  drawFeltBase();

  // stamp centre
  feltCtx.save();
  feltCtx.beginPath();
  feltCtx.arc(w / 2, h / 2, w * 0.18, 0, Math.PI * 2);
  feltCtx.fillStyle = "rgba(255,255,255,0.08)";
  feltCtx.fill();
  feltCtx.lineWidth = 10;
  feltCtx.strokeStyle = "rgba(255,255,255,0.18)";
  feltCtx.stroke();
  feltCtx.restore();

  if (value !== null && value !== undefined) {
    const txt = String(value);

    feltCtx.save();
    feltCtx.textAlign = "center";
    feltCtx.textBaseline = "middle";

    feltCtx.font = `900 340px system-ui, Arial`;

    feltCtx.lineWidth = 22;
    feltCtx.strokeStyle = "rgba(255,255,255,0.70)";
    feltCtx.strokeText(txt, w / 2, h / 2);

    feltCtx.fillStyle = "rgba(15,15,15,0.65)";
    feltCtx.shadowColor = "rgba(0,0,0,0.45)";
    feltCtx.shadowBlur = 24;
    feltCtx.shadowOffsetY = 6;
    feltCtx.fillText(txt, w / 2, h / 2);

    feltCtx.restore();
  }

  feltDynamicTex.needsUpdate = true;
}

drawFeltResult("—");

const felt = new THREE.Mesh(
  new THREE.CircleGeometry(tray.rInner * 0.985, tray.segments),
  trayFeltDynamicMat
);
felt.rotation.x = -Math.PI / 2;
felt.position.set(0, tray.y + 0.001, 0);
felt.receiveShadow = true;
trayGroup.add(felt);

// ---------- Dé : textures pips ----------
function makePipFaceTexture(pips, opts = {}) {
  const size = opts.size ?? 1024;
  const bg = opts.bg ?? "#f4f2ec";
  const pipColor = opts.pipColor ?? "#111";
  const border = opts.border ?? "rgba(0,0,0,0.25)";

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Grain subtil
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const pad = Math.floor(size * 0.06);
  ctx.lineWidth = Math.max(10, Math.floor(size * 0.03));
  ctx.strokeStyle = border;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);

  const g = {
    L: size * 0.28, C: size * 0.50, R: size * 0.72,
    T: size * 0.28, M: size * 0.50, B: size * 0.72,
  };

  const pipMap = {
    1: [[g.C, g.M]],
    2: [[g.L, g.T], [g.R, g.B]],
    3: [[g.L, g.T], [g.C, g.M], [g.R, g.B]],
    4: [[g.L, g.T], [g.R, g.T], [g.L, g.B], [g.R, g.B]],
    5: [[g.L, g.T], [g.R, g.T], [g.C, g.M], [g.L, g.B], [g.R, g.B]],
    6: [[g.L, g.T], [g.L, g.M], [g.L, g.B], [g.R, g.T], [g.R, g.M], [g.R, g.B]],
  };

  ctx.fillStyle = pipColor;
  const r = size * 0.055;

  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = size * 0.015;
  ctx.shadowOffsetY = size * 0.008;

  for (const [x, y] of (pipMap[pips] ?? [])) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = "transparent";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Ordre faces : +X, -X, +Y, -Y, +Z, -Z
const pipsByFace = [3, 4, 1, 6, 2, 5];

const faceMaterials = pipsByFace.map((p) => new THREE.MeshPhysicalMaterial({
  map: makePipFaceTexture(p, { size: 1024 }),
  roughness: 0.33,
  metalness: 0.0,
  clearcoat: 0.55,
  clearcoatRoughness: 0.22,
  ior: 1.45,
}));

const diceSize = 0.65;
const diceSegs = 8;
const diceRadius = diceSize * 0.06;

const diceGeo = new RoundedBoxGeometry(diceSize, diceSize, diceSize, diceSegs, diceRadius);
const diceMesh = new THREE.Mesh(diceGeo, faceMaterials);
diceMesh.castShadow = true;
diceMesh.receiveShadow = true;
diceMesh.position.set(0, tray.y + 2.0, 0);
scene.add(diceMesh);

// ------- CANNON -------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

const matFloor = new CANNON.Material("floor");
const matDice = new CANNON.Material("dice");

world.addContactMaterial(new CANNON.ContactMaterial(matFloor, matDice, {
  friction: 0.32,
  restitution: 0.18,
}));

const trayBody = new CANNON.Body({ mass: 0, material: matFloor });

// Fond (box)
{
  const floorShape = new CANNON.Box(new CANNON.Vec3(rOuter, tray.floorT / 2, rOuter));
  trayBody.addShape(floorShape, new CANNON.Vec3(0, tray.y - tray.floorT / 2, 0));
}

// Mur circulaire segmenté
{
  const N = tray.segments;
  const wallRadius = tray.rInner + tray.wallT / 2;
  const arc = (Math.PI * 2) / N;
  const chord = 2 * wallRadius * Math.sin(arc / 2);

  const segHalfW = chord / 2;
  const segHalfH = tray.wallH / 2;
  const segHalfT = tray.wallT / 2;

  const wallShape = new CANNON.Box(new CANNON.Vec3(segHalfW, segHalfH, segHalfT));

  for (let i = 0; i < N; i++) {
    const ang = i * arc;
    const x = wallRadius * Math.cos(ang);
    const z = wallRadius * Math.sin(ang);

    const q = new CANNON.Quaternion();
    q.setFromEuler(0, -ang, 0);

    trayBody.addShape(
      wallShape,
      new CANNON.Vec3(x, tray.y + segHalfH, z),
      q
    );
  }
}

world.addBody(trayBody);

// Dé physique (box)
const diceBody = new CANNON.Body({
  mass: 1,
  material: matDice,
  linearDamping: 0.25,
  angularDamping: 0.25,
});
diceBody.addShape(new CANNON.Box(new CANNON.Vec3(diceSize / 2, diceSize / 2, diceSize / 2)));
diceBody.position.set(0, tray.y + 2.0, 0);
world.addBody(diceBody);

// ------- Lancer + résultat -------
function rand(min, max) { return min + Math.random() * (max - min); }

function randomPointInDisk(radius) {
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return { x: r * Math.cos(t), z: r * Math.sin(t) };
}

function throwDice() {
  diceBody.velocity.setZero();
  diceBody.angularVelocity.setZero();

  const margin = tray.rInner - (diceSize * 0.9);
  const p = randomPointInDisk(Math.max(0.2, margin * 0.75));

  diceBody.position.set(p.x, tray.y + 2.2, p.z);
  diceBody.quaternion.setFromEuler(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));

  diceBody.applyImpulse(
    new CANNON.Vec3(rand(-1.2, 1.2), rand(5.5, 7.0), rand(-1.2, 1.2)),
    diceBody.position
  );
  diceBody.angularVelocity.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));

  resultEl.textContent = "…";
  drawFeltResult("…");
  rolling = true;
  stableFrames = 0;
  lastTop = null;
}

const faceNormalsLocal = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

function getTopFaceIndex(mesh) {
  const up = new THREE.Vector3(0, 1, 0);
  let bestDot = -Infinity;
  let bestIndex = 0;
  for (let i = 0; i < faceNormalsLocal.length; i++) {
    const nWorld = faceNormalsLocal[i].clone().applyQuaternion(mesh.quaternion).normalize();
    const d = nWorld.dot(up);
    if (d > bestDot) { bestDot = d; bestIndex = i; }
  }
  return bestIndex;
}

function isNearlyStopped() {
  const v = diceBody.velocity.length();
  const w = diceBody.angularVelocity.length();
  return v < 0.10 && w < 0.10 && diceBody.position.y < (tray.y + tray.wallH + 0.9);
}

let rolling = false;
let stableFrames = 0;
let lastTop = null;

// ------- Loop -------
const clock = new THREE.Clock();
let accumulator = 0;
const fixedTimeStep = 1 / 60;

const moveDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const upVec = new THREE.Vector3(0, 1, 0);

function applyDesktopMovement(dt) {
  const step = moveSpeed * dt;

  controls.getDirection(forward);
  forward.y = 0;
  forward.normalize();

  right.copy(forward).cross(upVec).normalize();

  moveDir.set(0, 0, 0);
  if (keys.forward) moveDir.add(forward);
  if (keys.backward) moveDir.sub(forward);
  if (keys.right) moveDir.add(right);
  if (keys.left) moveDir.sub(right);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize().multiplyScalar(step);
    controls.object.position.add(moveDir);
  }

  if (keys.up) controls.object.position.y += verticalSpeed * dt;
  if (keys.down) controls.object.position.y -= verticalSpeed * dt;

  controls.object.position.y = Math.max(0.6, controls.object.position.y);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  accumulator += dt;
  while (accumulator >= fixedTimeStep) {
    world.step(fixedTimeStep);
    accumulator -= fixedTimeStep;
  }

  diceMesh.position.copy(diceBody.position);
  diceMesh.quaternion.copy(diceBody.quaternion);

  if (rolling) {
    if (isNearlyStopped()) {
      stableFrames++;
      const topIndex = getTopFaceIndex(diceMesh);
      if (lastTop !== topIndex) { lastTop = topIndex; stableFrames = 1; }
      if (stableFrames > 18) {
        rolling = false;
        const win = pipsByFace[topIndex];
        resultEl.textContent = String(win);
        drawFeltResult(win);
      }
    } else {
      stableFrames = 0;
      lastTop = null;
    }
  }

  // PC movement only (and only when pointer lock is active)
  if (gameStarted && !isMobileLike && controls.isLocked) {
    applyDesktopMovement(dt);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
