import "./style.css";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as CANNON from "cannon-es";

import feltUrl from "./assets/felt.jpg";
import woodUrl from "./assets/wood.jpg";

document.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });

// ------- Container Vite (#app) -------
const app = document.getElementById("app");
app.innerHTML = "";

// ------- HUD -------
const hud = document.createElement("div");
hud.id = "hud";
hud.innerHTML = `
  <div><b>Résultat :</b> <span id="result">—</span></div>
  <div class="hint">Clique pour activer le FPS • WASD déplacer • Espace/Ctrl haut/bas • R relance le dé</div>
`;
document.body.appendChild(hud);
const resultEl = document.getElementById("result");
// ------- Intro Menu (NEW) -------
const intro = document.createElement("div");
intro.id = "intro";
intro.innerHTML = `
  <div class="panel">
    <div class="title">Jeu de Dé</div>
    <div class="subtitle">Lancer un dé dans un bac de feutrine</div>

    <div class="section">
      <div class="label">Commandes</div>
      <ul>
        <li><b>WASD</b> : se déplacer</li>
        <li><b>Souris</b> : regarder autour</li>
        <li><b>Espace / Ctrl</b> : monter / descendre</li>
        <li><b>R</b> : relancer le dé</li>
        <li><b>Échap</b> : libérer la souris</li>
      </ul>
    </div>

    <div class="buttons">
      <button id="btnStart">Commencer</button>
      <button id="btnThrow" class="secondary">Lancer</button>
    </div>

    <div class="foot">Astuce : clique sur “Commencer” pour activer le mode FPS.</div>
  </div>
`;
document.body.appendChild(intro);

const btnStart = intro.querySelector("#btnStart");
const btnThrow = intro.querySelector("#btnThrow");


// ------- Overlay FPS -------
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
  rInner: 2.6,     // rayon intérieur (zone feutrine)
  wallT: 0.28,     // épaisseur paroi
  wallH: 0.75,     // hauteur paroi
  floorT: 0.22,    // épaisseur du fond
  y: 1.05,         // niveau du dessus du fond/feutrine
  segments: 64,    // finesse visuelle & mur physique
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

// Ombres
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

app.appendChild(renderer.domElement);

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

// ------- FPS Controls -------
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);
controls.object.position.set(0, tray.y + startHeight, startDist);
controls.object.lookAt(0, tray.y, 0);

overlay.addEventListener("click", () => controls.lock());
renderer.domElement.addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => (overlay.style.display = "none"));
controls.addEventListener("unlock", () => (overlay.style.display = "flex"));

document.addEventListener("pointerlockerror", () => {
  overlay.querySelector(".text").textContent =
    "Pointer Lock refusé. Clique dans la page et réessaie (pas dans la console F12).";
  overlay.style.display = "flex";
});

// ------- Input (WASD + Space/Ctrl) -------
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
  setKey(e, true);
  if (e.code === "KeyR") throwDice();
  if (e.code === "Space") e.preventDefault();
}, { passive: false });

window.addEventListener("keyup", (e) => setKey(e, false));

const moveSpeed = 5.5;
const verticalSpeed = 4.5;

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

// 2) Paroi SOLIDE (anneau extrudé) => plus de "vide" dans l'épaisseur
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

  // Rebord arrondi (optionnel, joli)
  const rimGeo = new THREE.TorusGeometry(rOuter - tray.wallT * 0.35, tray.wallT * 0.22, 16, tray.segments);
  const rim = new THREE.Mesh(rimGeo, trayWoodMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, tray.y + tray.wallH, 0);
  rim.castShadow = true;
  rim.receiveShadow = true;
  trayGroup.add(rim);
}

// 3) Feutrine dynamique (image + chiffre au centre)
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

  // fallback
  feltCtx.clearRect(0, 0, w, h);
  feltCtx.fillStyle = "#2f7f66";
  feltCtx.fillRect(0, 0, w, h);

  // motif feutrine si dispo
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

  // cercle léger au centre (style "stamp")
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

    const fontSize = 340;
    feltCtx.font = `900 ${fontSize}px system-ui, Arial`;

    // contour clair
    feltCtx.lineWidth = 22;
    feltCtx.strokeStyle = "rgba(255,255,255,0.70)";
    feltCtx.strokeText(txt, w / 2, h / 2);

    // remplissage sombre + ombre
    feltCtx.fillStyle = "rgba(15,15,15,0.65)";
    feltCtx.shadowColor = "rgba(0,0,0,0.45)";
    feltCtx.shadowBlur = 24;
    feltCtx.shadowOffsetY = 6;
    feltCtx.fillText(txt, w / 2, h / 2);

    feltCtx.restore();
  }

  feltDynamicTex.needsUpdate = true;
}

// init texture feutrine + résultat "—"
drawFeltResult("—");

const felt = new THREE.Mesh(
  new THREE.CircleGeometry(tray.rInner * 0.985, tray.segments),
  trayFeltDynamicMat
);
felt.rotation.x = -Math.PI / 2;
felt.position.set(0, tray.y + 0.001, 0);
felt.receiveShadow = true;
trayGroup.add(felt);

// ---------- Dé : textures pips (1..6) ----------
function makePipFaceTexture(pips, opts = {}) {
  const size = opts.size ?? 1024;
  const bg = opts.bg ?? "#f4f2ec";
  const pipColor = opts.pipColor ?? "#111";
  const border = opts.border ?? "rgba(0,0,0,0.25)";

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fond
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

  // Bord doux
  const pad = Math.floor(size * 0.06);
  ctx.lineWidth = Math.max(10, Math.floor(size * 0.03));
  ctx.strokeStyle = border;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);

  // Positions pips (grille 3x3)
  const g = {
    L: size * 0.28,
    C: size * 0.50,
    R: size * 0.72,
    T: size * 0.28,
    M: size * 0.50,
    B: size * 0.72,
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

  // Ombre légère pour relief
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
// Disposition réaliste : +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4
const pipsByFace = [3, 4, 1, 6, 2, 5];

const faceMaterials = pipsByFace.map((p) => new THREE.MeshPhysicalMaterial({
  map: makePipFaceTexture(p, { size: 1024 }),
  roughness: 0.33,
  metalness: 0.0,
  clearcoat: 0.55,
  clearcoatRoughness: 0.22,
  ior: 1.45,
}));

// Dé réaliste
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

// ---------- BAC CIRCULAIRE (CANNON) : fond + mur circulaire segmenté ----------
const trayBody = new CANNON.Body({ mass: 0, material: matFloor });

// Fond (box)
{
  const floorShape = new CANNON.Box(new CANNON.Vec3(rOuter, tray.floorT / 2, rOuter));
  trayBody.addShape(floorShape, new CANNON.Vec3(0, tray.y - tray.floorT / 2, 0));
}

// Mur circulaire en segments (boxes)
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

// Normales locales (ordre faces)
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

throwDice();

const moveDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const upVec = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  accumulator += dt;
  while (accumulator >= fixedTimeStep) {
    world.step(fixedTimeStep);
    accumulator -= fixedTimeStep;
  }

  // sync mesh <- body
  diceMesh.position.copy(diceBody.position);
  diceMesh.quaternion.copy(diceBody.quaternion);

  // Résultat
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

  // Movement FPS
  if (controls.isLocked) {
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

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
