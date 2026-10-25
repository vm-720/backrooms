import * as THREE from '../vendor/three.module.min.js';
import { generateMaze, collectSolids, makeRng, CELL, WALL_T, WALL_H } from './maze.js';
import { wallpaperTexture, carpetTexture, ceilingTexture, lightPanelTexture, exitSignTexture } from './textures.js';
import { GameAudio } from './audio.js';

// ---------- Tuning ----------
const EYE = 1.65;
const RADIUS = 0.3;
const WALK = 2.6; // m/s
const RUN = 5.0;
const STAMINA_MAX = 7; // seconds of running from full
const STAMINA_REGEN = 1.4; // per second, so a full refill takes 5 s
const REGEN_DELAY = 0.8;
const EXHAUSTED_UNTIL = 2.5; // after running dry, wait for this much stamina
const LIGHT_POOL = 8;
const CHUNK = 10; // cells per render chunk
const VIEW = 48; // metres before chunks are hidden
const TENSION_TIME = 480; // seconds until the hum is at its worst
const FOG = new THREE.Color('#3b3417');

const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
const maze = generateMaze(seed);
const { W, H } = maze;
const S = CELL;

// ---------- Settings ----------
const settings = { sens: 1, vol: 0.8 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('backrooms-settings') || '{}'));
} catch {}
function saveSettings() {
  try {
    localStorage.setItem('backrooms-settings', JSON.stringify(settings));
  } catch {}
}

// ---------- Renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: testMode });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = FOG;
scene.fog = new THREE.Fog(FOG, 5, 36);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, VIEW);
scene.add(new THREE.AmbientLight('#fff1b8', 1.1));
scene.add(new THREE.HemisphereLight('#fff6d0', '#6b5a2a', 0.6));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Materials ----------
const wallTex = wallpaperTexture();
wallTex.repeat.set(3, 2.1);
const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
const stubTex = wallTex.clone();
stubTex.repeat.set(1.5, 2.1);
const stubMat = new THREE.MeshLambertMaterial({ map: stubTex });
const pillarTex = wallTex.clone();
pillarTex.repeat.set(0.5, 2.1);
const pillarMat = new THREE.MeshLambertMaterial({ map: pillarTex });
const floorMat = new THREE.MeshLambertMaterial({ map: carpetTexture() });
const ceilMat = new THREE.MeshLambertMaterial({ map: ceilingTexture() });
const panelMat = new THREE.MeshBasicMaterial({ map: lightPanelTexture(), fog: true });
const outletMat = new THREE.MeshLambertMaterial({ color: '#e8e2cc' });
const darkMat = new THREE.MeshLambertMaterial({ color: '#2a2412' });

// ---------- Floor and ceiling ----------
const sizeX = W * S;
const sizeZ = H * S;
const floorGeo = new THREE.PlaneGeometry(sizeX + 40, sizeZ + 40);
floorMat.map.repeat.set((sizeX + 40) / 2.5, (sizeZ + 40) / 2.5);
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(sizeX / 2, 0, sizeZ / 2);
scene.add(floor);

ceilMat.map.repeat.set((sizeX + 40) / 1.2, (sizeZ + 40) / 1.2);
const ceil = new THREE.Mesh(floorGeo, ceilMat);
ceil.rotation.x = Math.PI / 2;
ceil.position.set(sizeX / 2, WALL_H, sizeZ / 2);
scene.add(ceil);

// ---------- Walls, pillars, outlets: instanced per chunk ----------
const solids = collectSolids(maze);
const geoms = {
  wall: new THREE.BoxGeometry(S + WALL_T, WALL_H, WALL_T),
  stub: new THREE.BoxGeometry(S / 2 + WALL_T, WALL_H, WALL_T),
  pillar: new THREE.BoxGeometry(0.7, WALL_H, 0.7),
  outlet: new THREE.BoxGeometry(0.08, 0.12, 0.03),
  panel: new THREE.BoxGeometry(1.2, 0.04, 0.6),
};
const mats = { wall: wallMat, stub: stubMat, pillar: pillarMat, outlet: outletMat, panel: panelMat };

const chunksX = Math.ceil(W / CHUNK);
const chunksZ = Math.ceil(H / CHUNK);
const chunks = [];
for (let cz = 0; cz < chunksZ; cz++) {
  for (let cx = 0; cx < chunksX; cx++) {
    const group = new THREE.Group();
    group.userData.center = new THREE.Vector2((cx + 0.5) * CHUNK * S, (cz + 0.5) * CHUNK * S);
    chunks.push({ group, items: { wall: [], stub: [], pillar: [], outlet: [], panel: [] } });
    scene.add(group);
  }
}
const chunkAt = (x, z) => {
  const cx = Math.min(chunksX - 1, Math.max(0, Math.floor(x / S / CHUNK)));
  const cz = Math.min(chunksZ - 1, Math.max(0, Math.floor(z / S / CHUNK)));
  return chunks[cz * chunksX + cx];
};

const decoRng = makeRng(seed ^ 0x5bd1e995);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const ROT_V = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const ONE = new THREE.Vector3(1, 1, 1);

for (const s of solids) {
  const rot = s.axis === 'v' ? ROT_V : q.identity();
  m4.compose(new THREE.Vector3(s.cx, WALL_H / 2, s.cz), rot, ONE);
  chunkAt(s.cx, s.cz).items[s.kind].push(m4.clone());
  // The odd wall outlet, on one side or the other.
  if (s.kind === 'wall' && decoRng() < 0.05) {
    const side = decoRng() < 0.5 ? -1 : 1;
    const along = (decoRng() - 0.5) * (S - 1);
    const off = side * (WALL_T / 2 + 0.015);
    const pos = s.axis === 'h' ? new THREE.Vector3(s.cx + along, 0.3, s.cz + off) : new THREE.Vector3(s.cx + off, 0.3, s.cz + along);
    m4.compose(pos, rot, ONE);
    chunkAt(pos.x, pos.z).items.outlet.push(m4.clone());
  }
}

// One fluorescent panel per cell. Some are dead, a few flicker.
const panels = [];
const panelIndex = Array.from({ length: H }, () => new Array(W).fill(null));
for (let z = 0; z < H; z++) {
  for (let x = 0; x < W; x++) {
    const r = decoRng();
    const state = r < 0.07 ? 'dead' : r < 0.11 ? 'flicker' : 'on';
    const pos = new THREE.Vector3((x + 0.5) * S, WALL_H - 0.02, (z + 0.5) * S);
    const along = decoRng() < 0.5;
    m4.compose(pos, along ? ROT_V : q.identity(), ONE);
    const chunk = chunkAt(pos.x, pos.z);
    const p = { pos, state, level: state === 'dead' ? 0 : 1, chunk, index: chunk.items.panel.length, next: decoRng() * 4 };
    chunk.items.panel.push(m4.clone());
    panels.push(p);
    panelIndex[z][x] = p;
  }
}

const PANEL_ON = new THREE.Color('#fffbe6');
const PANEL_DEAD = new THREE.Color('#6e6a58');
const tmpColor = new THREE.Color();
for (const chunk of chunks) {
  for (const kind of Object.keys(chunk.items)) {
    const list = chunk.items[kind];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geoms[kind], mats[kind], list.length);
    list.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.computeBoundingSphere();
    chunk.group.add(mesh);
    if (kind === 'panel') chunk.panelMesh = mesh;
  }
}
function paintPanel(p) {
  tmpColor.copy(PANEL_DEAD).lerp(PANEL_ON, p.level);
  p.chunk.panelMesh.setColorAt(p.index, tmpColor);
  p.chunk.panelMesh.instanceColor.needsUpdate = true;
}
panels.forEach(paintPanel);

// ---------- Collision lookup ----------
const solidGrid = new Map();
const key = (i, j) => i + ',' + j;
function addSolid(s) {
  const i0 = Math.floor((s.cx - s.sx / 2) / S);
  const i1 = Math.floor((s.cx + s.sx / 2) / S);
  const j0 = Math.floor((s.cz - s.sz / 2) / S);
  const j1 = Math.floor((s.cz + s.sz / 2) / S);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = key(i, j);
      if (!solidGrid.has(k)) solidGrid.set(k, []);
      solidGrid.get(k).push(s);
    }
  }
}
solids.forEach(addSolid);

// ---------- Exit: a doorway in the outer wall with a dark hall behind it ----------
const exit = maze.exit;
const exitDir = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
][exit.side];
const across = exitDir[0] === 0; // the opening runs along x
const exitCenter = new THREE.Vector3(
  exitDir[0] === 0 ? (exit.x + 0.5) * S : exit.x * S + (exitDir[0] > 0 ? S : 0),
  0,
  exitDir[1] === 0 ? (exit.z + 0.5) * S : exit.z * S + (exitDir[1] > 0 ? S : 0),
);
{
  const DOOR = 1.3;
  const side = (S - DOOR) / 2;
  const exitSolids = [];
  // Wall pieces either side of the door.
  for (const sgn of [-1, 1]) {
    const off = sgn * (DOOR / 2 + side / 2);
    exitSolids.push(
      across
        ? { cx: exitCenter.x + off, cz: exitCenter.z, sx: side + WALL_T, sz: WALL_T }
        : { cx: exitCenter.x, cz: exitCenter.z + off, sx: WALL_T, sz: side + WALL_T },
    );
  }
  // A short dark hall leading out.
  const HALL = 6;
  const hx = exitCenter.x + exitDir[0] * (HALL / 2);
  const hz = exitCenter.z + exitDir[1] * (HALL / 2);
  for (const sgn of [-1, 1]) {
    exitSolids.push(
      across
        ? { cx: hx + sgn * (DOOR / 2 + WALL_T / 2), cz: hz, sx: WALL_T, sz: HALL, dark: true }
        : { cx: hx, cz: hz + sgn * (DOOR / 2 + WALL_T / 2), sx: HALL, sz: WALL_T, dark: true },
    );
  }
  exitSolids.push(
    across
      ? { cx: hx, cz: exitCenter.z + exitDir[1] * HALL, sx: DOOR + WALL_T * 2, sz: WALL_T, dark: true }
      : { cx: exitCenter.x + exitDir[0] * HALL, cz: hz, sx: WALL_T, sz: DOOR + WALL_T * 2, dark: true },
  );
  for (const s of exitSolids) {
    addSolid(s);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.sx, WALL_H, s.sz), s.dark ? darkMat : wallMat);
    mesh.position.set(s.cx, WALL_H / 2, s.cz);
    scene.add(mesh);
  }
  // Lintel above the door.
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(across ? DOOR : WALL_T, WALL_H - 2.2, across ? WALL_T : DOOR), wallMat);
  lintel.position.set(exitCenter.x, 2.2 + (WALL_H - 2.2) / 2, exitCenter.z);
  scene.add(lintel);
  // Exit sign on the inside face of the lintel.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: exitSignTexture(), fog: false }));
  sign.position.set(exitCenter.x - exitDir[0] * (WALL_T / 2 + 0.01), 2.55, exitCenter.z - exitDir[1] * (WALL_T / 2 + 0.01));
  sign.lookAt(sign.position.x - exitDir[0], 2.55, sign.position.z - exitDir[1]);
  scene.add(sign);
  // Dim red light spilling out of the hall.
  const red = new THREE.PointLight('#ff3020', 6, 9, 1.5);
  red.position.set(exitCenter.x + exitDir[0] * 1.2, 2.4, exitCenter.z + exitDir[1] * 1.2);
  scene.add(red);
}

// ---------- Light pool: real lights follow the panels nearest the player ----------
const pool = [];
for (let k = 0; k < LIGHT_POOL; k++) {
  const l = new THREE.PointLight('#fff4cf', 0, 11, 1.4);
  l.userData.panel = null;
  scene.add(l);
  pool.push(l);
}
let poolTimer = 0;
function assignLights(px, pz) {
  const ci = Math.floor(px / S);
  const cj = Math.floor(pz / S);
  const near = [];
  for (let j = cj - 3; j <= cj + 3; j++) {
    for (let i = ci - 3; i <= ci + 3; i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const p = panelIndex[j][i];
      if (p.state === 'dead') continue;
      near.push([p, (p.pos.x - px) ** 2 + (p.pos.z - pz) ** 2]);
    }
  }
  near.sort((a, b) => a[1] - b[1]);
  pool.forEach((l, k) => {
    const p = near[k] && near[k][0];
    l.userData.panel = p || null;
    if (p) l.position.set(p.pos.x, WALL_H - 0.35, p.pos.z);
  });
}

// ---------- Player ----------
const player = {
  pos: new THREE.Vector3((maze.start[0] + 0.5) * S, 0, (maze.start[1] + 0.5) * S),
  yaw: Math.random() * Math.PI * 2,
  pitch: 0,
  stamina: STAMINA_MAX,
  exhausted: false,
  sinceRun: 10,
  bob: 0,
};
const keys = new Set();
let state = 'start'; // start | playing | paused | won
let elapsed = 0;

function pushOut(p) {
  const ci = Math.floor(p.x / S);
  const cj = Math.floor(p.z / S);
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const list = solidGrid.get(key(i, j));
      if (!list) continue;
      for (const s of list) {
        const hx = s.sx / 2;
        const hz = s.sz / 2;
        const nx = Math.max(s.cx - hx, Math.min(p.x, s.cx + hx));
        const nz = Math.max(s.cz - hz, Math.min(p.z, s.cz + hz));
        const dx = p.x - nx;
        const dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (RADIUS - d);
          p.z += (dz / d) * (RADIUS - d);
        } else {
          // Centre inside the box: leave by the nearest face.
          const ox = hx - Math.abs(p.x - s.cx) + RADIUS;
          const oz = hz - Math.abs(p.z - s.cz) + RADIUS;
          if (ox < oz) p.x += Math.sign(p.x - s.cx || 1) * ox;
          else p.z += Math.sign(p.z - s.cz || 1) * oz;
        }
      }
    }
  }
}

function move(dx, dz) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let k = 0; k < steps; k++) {
    player.pos.x += dx / steps;
    player.pos.z += dz / steps;
    pushOut(player.pos);
    pushOut(player.pos);
  }
}

const audio = new GameAudio();
audio.setVolume(settings.vol);

function updatePlayer(dt) {
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const moving = f !== 0 || r !== 0;
  const wantRun = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const running = wantRun && moving && f >= 0 && !player.exhausted && player.stamina > 0;

  if (running) {
    player.stamina = Math.max(0, player.stamina - dt);
    player.sinceRun = 0;
    if (player.stamina === 0) player.exhausted = true;
  } else {
    player.sinceRun += dt;
    if (player.sinceRun > REGEN_DELAY) player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN * dt);
    if (player.exhausted && player.stamina >= EXHAUSTED_UNTIL) player.exhausted = false;
  }

  let speed = 0;
  if (moving) {
    // Out of breath: a slower walk until stamina comes back.
    speed = running ? RUN : player.exhausted ? WALK * 0.75 : WALK;
    const len = Math.hypot(f, r);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const fx = -sin * f + cos * r;
    const fz = -cos * f - sin * r;
    const before = player.pos.clone();
    move((fx / len) * speed * dt, (fz / len) * speed * dt);
    const travelled = before.distanceTo(player.pos);
    const stride = running ? 1.1 : 0.8;
    const prevStep = Math.floor(player.bob / Math.PI);
    player.bob += (travelled / stride) * Math.PI;
    if (Math.floor(player.bob / Math.PI) !== prevStep) audio.footstep(running);
  } else {
    // Settle the head back to rest.
    const rest = Math.round(player.bob / Math.PI) * Math.PI;
    player.bob += (rest - player.bob) * Math.min(1, dt * 8);
  }

  const bobAmt = running ? 0.07 : 0.04;
  camera.position.set(player.pos.x, EYE + Math.abs(Math.sin(player.bob)) * bobAmt - bobAmt / 2, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bob) * (running ? 0.012 : 0.006), 'YXZ');

  // Through the exit door and down the hall.
  const out = (player.pos.x - exitCenter.x) * exitDir[0] + (player.pos.z - exitCenter.z) * exitDir[1];
  if (out > 2.2) win();
}

// ---------- Lights flicker, hum builds ----------
function updateWorld(dt) {
  const tension = Math.min(1, elapsed / TENSION_TIME);
  for (const p of panels) {
    if (p.state !== 'flicker') continue;
    p.next -= dt;
    if (p.next > 0) continue;
    if (p.level > 0) {
      p.level = 0;
      p.next = 0.04 + Math.random() * 0.2;
    } else {
      p.level = 0.75 + Math.random() * 0.25;
      // Mostly steady, sometimes a burst of quick flickers.
      p.next = Math.random() < 0.4 ? 0.05 + Math.random() * 0.15 : (0.6 + Math.random() * 5) * (1 - tension * 0.5);
    }
    paintPanel(p);
    if (p.pos.distanceToSquared(player.pos) < 100) audio.flickerTick();
  }
  for (const l of pool) {
    const p = l.userData.panel;
    l.intensity = p ? 7 * p.level : 0;
  }
  poolTimer -= dt;
  if (poolTimer <= 0) {
    poolTimer = 0.25;
    assignLights(player.pos.x, player.pos.z);
    for (const c of chunks) {
      const d = c.group.userData.center.distanceTo(new THREE.Vector2(player.pos.x, player.pos.z));
      c.group.visible = d < VIEW + CHUNK * S * 0.71;
    }
  }
  audio.update(tension);
}

// ---------- Screens and input ----------
const $ = (id) => document.getElementById(id);
const screens = { start: $('start'), pause: $('pause'), win: $('win') };
function show(name) {
  for (const [n, el] of Object.entries(screens)) el.classList.toggle('hidden', n !== name);
  $('hud').classList.toggle('hidden', name !== null);
}
$('seed').textContent = seed;
$('sens').value = settings.sens;
$('vol').value = settings.vol;

function lock() {
  if (testMode) {
    begin();
    return;
  }
  const req = renderer.domElement.requestPointerLock();
  if (req && req.catch) req.catch(() => {});
}
function begin() {
  state = 'playing';
  show(null);
  audio.start();
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  keys.clear();
  audio.suspend();
  show('pause');
}
function win() {
  if (state === 'won') return;
  state = 'won';
  keys.clear();
  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  $('time').textContent = `${m}:${String(s).padStart(2, '0')}`;
  show('win');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.suspend();
}
function newMaze() {
  location.search = `?seed=${Math.floor(Math.random() * 1e9)}${testMode ? '&test' : ''}`;
}

$('enter').addEventListener('click', lock);
$('resume').addEventListener('click', lock);
$('restart').addEventListener('click', newMaze);
$('again').addEventListener('click', newMaze);
$('sens').addEventListener('input', (e) => {
  settings.sens = Number(e.target.value);
  saveSettings();
});
$('vol').addEventListener('input', (e) => {
  settings.vol = Number(e.target.value);
  audio.setVolume(settings.vol);
  saveSettings();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) begin();
  else pause();
});
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || !document.pointerLockElement) return;
  const k = 0.0022 * settings.sens;
  player.yaw -= e.movementX * k;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * k));
});
window.addEventListener('keydown', (e) => {
  if (state === 'playing') keys.add(e.code);
  if (testMode && e.code === 'Escape') pause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---------- Film grain ----------
{
  const frames = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let p = 0; p < img.data.length; p += 4) {
      const v = Math.random() * 255;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    frames.push(`url(${c.toDataURL()})`);
  }
  let f = 0;
  setInterval(() => {
    $('grain').style.backgroundImage = frames[f++ % frames.length];
  }, 70);
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
const staminaEl = $('stamina');
const staminaFill = $('stamina-fill');
assignLights(player.pos.x, player.pos.z);
updatePlayer(0);

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  if (state === 'playing') {
    elapsed += dt;
    updatePlayer(dt);
  }
  updateWorld(state === 'playing' ? dt : 0);
  staminaFill.style.width = `${(player.stamina / STAMINA_MAX) * 100}%`;
  staminaEl.classList.toggle('full', player.stamina >= STAMINA_MAX);
  staminaEl.classList.toggle('tired', player.exhausted);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Hooks for automated tests in a headless browser.
window.game = {
  maze,
  player,
  keys,
  get state() {
    return state;
  },
  get elapsed() {
    return elapsed;
  },
  begin,
  pause,
  exitCenter,
  exitDir,
  stamina: { max: STAMINA_MAX },
  // Run the simulation for a fixed time, independent of frame rate.
  step(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) {
      if (state === 'playing') {
        elapsed += dt;
        updatePlayer(dt);
      }
      updateWorld(dt);
    }
  },
};
