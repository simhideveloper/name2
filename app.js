import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Game, FACES, SLICES, LAYERS, LAYER_BY_KEY, layerName, moveFor, turnAngle } from './game.js';

// ---------------------------------------------------------------- state
const game = new Game();
let busy = false; // true while a twist animation runs
const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ } },
};
const scores = store.get('ctt.scores', { X: 0, O: 0 });
const names = store.get('ctt.names', { X: 'Player 1', O: 'Player 2' });

// ---------------------------------------------------------------- three.js scene
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(4.6, 3.8, 5.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 14;
controls.rotateSpeed = 0.8;

// ---------------------------------------------------------------- locked view
// When locked, the camera sits face-on to one face (n) with a fixed screen-up
// (up); both are axis-aligned. Orbit controls are off and swipes drive the cube.
const CAM_DIST = 7.4;
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
let lock = null; // { n, up } or null
let camAnim = null;

function nearestAxis(v, perpendicularTo = null) {
  let best = null, bestDot = -Infinity;
  for (const a of AXES) {
    if (perpendicularTo && Math.abs(a.dot(perpendicularTo)) > 0.5) continue;
    const d = a.dot(v);
    if (d > bestDot) { bestDot = d; best = a; }
  }
  return best.clone();
}
const faceByNormal = (v) => FACES.find((f) => f.n[0] === Math.round(v.x) && f.n[1] === Math.round(v.y) && f.n[2] === Math.round(v.z));
const lockRight = () => lock.up.clone().cross(lock.n); // right = up × n

/** Smoothly move the camera to look at the origin from `dir` with screen-up `up`. */
function flyTo(dir, up) {
  const p0 = camera.position.clone().normalize();
  const u0 = camera.up.clone();
  const p1 = dir.clone().normalize();
  const u1 = up.clone().normalize();
  const start = performance.now();
  const duration = 380;
  return new Promise((resolve) => {
    camAnim = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = p0.clone().lerp(p1, e).normalize().multiplyScalar(CAM_DIST);
      camera.position.copy(p);
      camera.up.copy(u0.clone().lerp(u1, e).normalize());
      camera.lookAt(0, 0, 0);
      if (t >= 1) { camAnim = null; resolve(); }
    };
  });
}

function lockView() {
  if (lock || camAnim) return;
  const dir = camera.position.clone().normalize();
  const n = nearestAxis(dir);
  const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const up = nearestAxis(screenUp, n);
  lock = { n, up };
  controls.enabled = false;
  showHover([]);
  flyTo(n, up);
  updateUI();
}

function unlockView() {
  if (!lock || camAnim) return;
  const { n, up } = lock;
  lock = null;
  // Settle on a slightly elevated three-quarter view with Y up, which is what
  // the orbit controls assume; keep the screen-up continuous where possible.
  const Y = new THREE.Vector3(0, 1, 0);
  const dir = Math.abs(n.y) > 0.5 ? n.clone().addScaledVector(up, -0.6) : n.clone().addScaledVector(Y, 0.45);
  flyTo(dir, Y).then(() => {
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    controls.update();
  });
  updateUI();
}

/** Rotate the whole cube (really: the locked camera) a quarter turn about `axis` with sign `omega`. */
function cubeRotate(axis, omega) {
  if (!lock || camAnim) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, -omega * Math.PI / 2);
  const n = lock.n.clone().applyQuaternion(q).round();
  const up = lock.up.clone().applyQuaternion(q).round();
  lock = { n, up };
  flyTo(n, up).then(updateUI);
  updateUI();
}

/** Turn the view (locked mode only) so the front face moves along world direction `d`. */
function viewSwipe(d) {
  if (!lock || camAnim) return;
  const right = lockRight();
  const horizontal = Math.abs(d.dot(right)) > 0.5;
  const axis = horizontal ? lock.up.clone() : right;
  const omega = Math.sign(axis.clone().cross(lock.n).dot(d));
  cubeRotate(axis, omega);
}
/** Screen-space swipe (pixels, y down) to a world direction in the locked view. */
function screenToLockedDir(dx, dy) {
  return Math.abs(dx) > Math.abs(dy)
    ? lockRight().multiplyScalar(Math.sign(dx))
    : lock.up.clone().multiplyScalar(-Math.sign(dy));
}

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(5, 8, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-6, -3, -5); scene.add(fill);

const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const CUBIE = 0.97;
const STICKER = 0.84;
const bodyGeo = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.15 });
const stickerGeo = new THREE.PlaneGeometry(STICKER, STICKER);

// Sticker textures: one per mark. Every sticker is the same green; X and O
// are drawn with a dark outline so they read on it from any angle.
const STICKER_FILL = '#2eb356';
const MARK_COLOR = { X: '#ff3b3b', O: '#ffffff' };
const textureCache = new Map();
function stickerTexture(mark) {
  const k = mark || '';
  if (textureCache.has(k)) return textureCache.get(k);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = STICKER_FILL;
  roundRect(ctx, 6, 6, size - 12, size - 12, 34);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();
  ctx.lineCap = 'round';
  if (mark === 'X') {
    ctx.beginPath();
    ctx.moveTo(74, 74); ctx.lineTo(size - 74, size - 74);
    ctx.moveTo(size - 74, 74); ctx.lineTo(74, size - 74);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 46; ctx.stroke();
    ctx.strokeStyle = MARK_COLOR.X; ctx.lineWidth = 30; ctx.stroke();
  } else if (mark === 'O') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 62, 0, Math.PI * 2);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 42; ctx.stroke();
    ctx.strokeStyle = MARK_COLOR.O; ctx.lineWidth = 26; ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  textureCache.set(k, tex);
  return tex;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Build one Group per cubie; stickers are children in the cubie's own frame.
const cubieGroups = [];
const stickerMeshes = new Map(); // sticker id -> mesh
const Z = new THREE.Vector3(0, 0, 1);
game.cubies.forEach((cubie, i) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bodyGeo, bodyMat));
  for (const s of cubie.stickers) {
    const mat = new THREE.MeshBasicMaterial({ map: stickerTexture(null), transparent: true });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    const face = FACES.find((f) => f.n.join() === s.n0.join());
    const n = new THREE.Vector3(...s.n0);
    mesh.position.copy(n).multiplyScalar(CUBIE / 2 + 0.003);
    // Plane +x/+y follow the face's right/up so labels read upright, matching the map.
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...face.right), new THREE.Vector3(...face.up), n));
    mesh.userData.stickerId = s.id;
    g.add(mesh);
    stickerMeshes.set(s.id, mesh);
  }
  cubieGroups.push(g);
  cubeGroup.add(g);
});

// Face names float just past the top edge of each face. They are fixed in the
// world (faces are named by position), so they stay put while layers turn.
function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '700 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(8,10,16,0.85)';
  ctx.strokeText(text, 192, 66);
  ctx.fillStyle = '#e8eaf0';
  ctx.fillText(text, 192, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.2, 0.4, 1);
  return sp;
}
const faceLabels = FACES.map((f) => {
  const sp = labelSprite(f.name);
  sp.position.copy(new THREE.Vector3(...f.n).multiplyScalar(1.45)).addScaledVector(new THREE.Vector3(...f.up), 2.15);
  sp.userData.n = new THREE.Vector3(...f.n);
  scene.add(sp);
  return sp;
});

const m4 = new THREE.Matrix4();
function syncFromState() {
  game.cubies.forEach((cubie, i) => {
    const g = cubieGroups[i];
    g.position.set(...cubie.pos);
    const M = cubie.M;
    m4.set(M[0][0], M[0][1], M[0][2], 0, M[1][0], M[1][1], M[1][2], 0, M[2][0], M[2][1], M[2][2], 0, 0, 0, 0, 1);
    g.setRotationFromMatrix(m4);
    g.scale.set(1, 1, 1);
    for (const s of cubie.stickers) {
      const mesh = stickerMeshes.get(s.id);
      const tex = stickerTexture(s.mark);
      if (mesh.material.map !== tex) { mesh.material.map = tex; mesh.material.needsUpdate = true; }
    }
  });
  cubeGroup.updateMatrixWorld(true);
}

// Highlight overlays (hover + winning lines) are standalone planes placed over stickers.
const hiGeo = new THREE.PlaneGeometry(STICKER + 0.08, STICKER + 0.08);
function makeHighlight(color, opacity) {
  const m = new THREE.Mesh(hiGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.visible = false;
  m.renderOrder = 2;
  scene.add(m);
  return m;
}
const hoverMeshes = Array.from({ length: 24 }, () => makeHighlight(0xffffff, 0.35));
const layerStickerIds = (key) => game.layerCubieIndices(key).flatMap((i) => game.cubies[i].stickers.map((s) => s.id));
const winMeshes = Array.from({ length: 9 }, () => makeHighlight(0xffd21f, 0.55));
const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), wn = new THREE.Vector3();
function placeOver(hl, stickerId) {
  const mesh = stickerMeshes.get(stickerId);
  mesh.getWorldPosition(wp);
  mesh.getWorldQuaternion(wq);
  wn.copy(Z).applyQuaternion(wq);
  hl.position.copy(wp).addScaledVector(wn, 0.012);
  hl.quaternion.copy(wq);
  hl.visible = true;
}
function showHover(ids) {
  hoverMeshes.forEach((m, i) => { if (i < ids.length) placeOver(m, ids[i]); else m.visible = false; });
}
function showWin() {
  const ids = game.winLines.flatMap((l) => l.ids);
  winMeshes.forEach((m, i) => { if (i < ids.length) placeOver(m, ids[i]); else m.visible = false; });
}

// ---------------------------------------------------------------- twist animation
function animateTurn(key, cw) {
  const { axis } = moveFor(key, cw);
  const indices = game.layerCubieIndices(key);
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  for (const i of indices) pivot.attach(cubieGroups[i]);
  const target = turnAngle(key, cw);
  const axisName = 'xyz'[axis];
  const duration = 320;
  const start = performance.now();
  return new Promise((resolve) => {
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out quad
      pivot.rotation[axisName] = target * e;
      if (t < 1) requestAnimationFrame(step);
      else {
        for (const i of indices) cubeGroup.attach(cubieGroups[i]);
        cubeGroup.remove(pivot);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downPos = null;
function pickSticker(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([...stickerMeshes.values()], false);
  return hits.length ? hits[0].object.userData.stickerId : null;
}
/**
 * Gestures. One pointer that starts on a sticker twists the layer under it
 * (a tap places a mark). Everything else only moves the view: a drag on the
 * background orbits (free) or snap-turns the cube (locked), and two fingers
 * do the same from anywhere. Handlers run in the capture phase so a twist
 * can be kept away from the orbit controls.
 */
const touch = { pointers: new Map(), gesture: null, sticker: null, done: false };
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (ev) => {
  const pt = { x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY };
  if (touch.pointers.size === 0) {
    touch.pointers.set(ev.pointerId, pt);
    touch.done = false;
    const hit = pickSticker(ev);
    if (hit != null) {
      touch.gesture = 'twist'; touch.sticker = hit;
      ev.stopImmediatePropagation();
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* not required */ }
    } else if (lock) {
      touch.gesture = 'view';
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* not required */ }
    } else {
      touch.gesture = 'orbit'; // the orbit controls take it from here
    }
    return;
  }
  touch.pointers.set(ev.pointerId, pt);
  if (touch.gesture !== 'orbit') {
    // A second finger joins a gesture the orbit controls never saw: keep it that way.
    touch.gesture = lock ? 'two' : 'swallow';
    ev.stopImmediatePropagation();
  }
}, true);
canvas.addEventListener('pointermove', (ev) => {
  const pt = touch.pointers.get(ev.pointerId);
  if (pt) { pt.x = ev.clientX; pt.y = ev.clientY; }
}, true);
function endPointer(ev) {
  const pt = touch.pointers.get(ev.pointerId);
  if (!pt) return;
  pt.x = ev.clientX; pt.y = ev.clientY;
  if (!touch.done) {
    const g = touch.gesture;
    if (g === 'twist') {
      const dx = pt.x - pt.x0, dy = pt.y - pt.y0, moved = Math.hypot(dx, dy);
      if (ev.type === 'pointerup' && moved <= 6) onStickerClick(touch.sticker);
      else if (moved >= 24) swipeTwist(touch.sticker, dx, dy);
      touch.done = true;
    } else if (g === 'view' || g === 'two') {
      let dx = 0, dy = 0;
      for (const q of touch.pointers.values()) { dx += q.x - q.x0; dy += q.y - q.y0; }
      dx /= touch.pointers.size; dy /= touch.pointers.size;
      if (Math.hypot(dx, dy) >= 24 && lock) viewSwipe(screenToLockedDir(dx, dy));
      touch.done = true;
    }
  }
  touch.pointers.delete(ev.pointerId);
  if (touch.pointers.size === 0) { touch.gesture = null; touch.sticker = null; }
}
canvas.addEventListener('pointerup', endPointer, true);
canvas.addEventListener('pointercancel', endPointer, true);
canvas.addEventListener('pointermove', (ev) => {
  if (touch.pointers.size || ev.pointerType !== 'mouse' || busy || camAnim || game.phase !== 'place') { if (game.phase !== 'rotate') showHover([]); return; }
  const id = pickSticker(ev);
  const s = id != null ? game.sticker(id).sticker : null;
  canvas.style.cursor = s && !s.mark ? 'pointer' : '';
  showHover(s && !s.mark ? [id] : []);
});

/**
 * Twist the layer under a sticker in the direction of a screen-space swipe.
 * Works for any camera: each in-plane world axis is projected to the screen
 * and the one best aligned with the swipe wins. Moving the sticker along
 * world direction u means rotating about n × u; the sticker's coordinate on
 * that axis picks the outer layer or the middle slice.
 */
function swipeTwist(id, dx, dy) {
  if (busy || camAnim) return;
  if (game.phase === 'place') { toast('Place a mark first, then swipe to twist.'); return; }
  if (game.phase === 'over') return;
  const found = game.sticker(id);
  const n = new THREE.Vector3(...game.worldNormal(found.cubie, found.sticker));
  const p = new THREE.Vector3(...found.cubie.pos);
  const origin = stickerMeshes.get(id).getWorldPosition(new THREE.Vector3());
  const toScreen = (v) => { const q = v.clone().project(camera); return new THREE.Vector2(q.x, -q.y); };
  const o = toScreen(origin);
  const len = Math.hypot(dx, dy);
  let best = null, bestDot = 0;
  for (const u of AXES) {
    if (Math.abs(u.dot(n)) > 0.5) continue;
    const sv = toScreen(origin.clone().addScaledVector(u, 0.5)).sub(o);
    if (sv.length() < 1e-6) continue;
    sv.normalize();
    const dot = (sv.x * dx + sv.y * dy) / len;
    if (dot > bestDot) { bestDot = dot; best = u; }
  }
  if (!best || bestDot < 0.5) return;
  const a = n.clone().cross(best).round();
  const axis = a.x !== 0 ? 0 : a.y !== 0 ? 1 : 2;
  const aSign = a.x + a.y + a.z;
  const layer = Math.round(p.getComponent(axis));
  const key = layer === 0 ? SLICES.find((sl) => sl.axis === axis).key : FACES.find((f) => f.n[axis] === layer).key;
  const cw = moveFor(key, true).quarters === aSign;
  onTwist(key, cw);
}

renderer.domElement.addEventListener('pointerleave', () => { if (game.phase === 'place') showHover([]); });

// ---------------------------------------------------------------- actions
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 1800);
}

function onStickerClick(id) {
  if (busy) return;
  if (game.phase === 'over') return;
  if (game.phase === 'rotate') { toast('Now twist a face to finish your turn.'); return; }
  const res = game.place(id);
  if (!res.ok) { toast(res.reason); return; }
  showHover([]);
  syncFromState();
  afterAction();
}

async function onTwist(key, cw) {
  if (busy || game.phase !== 'rotate') return;
  busy = true;
  showHover([]);
  const res = game.rotate(key, cw);
  if (!res.ok) { busy = false; toast(res.reason); return; }
  updateUI();
  await animateTurn(key, cw);
  syncFromState();
  busy = false;
  afterAction();
}

function afterAction() {
  if (game.winner && game.winner !== 'draw') {
    scores[game.winner] += 1;
    store.set('ctt.scores', scores);
  }
  updateUI();
}

function newGame() {
  if (busy) return;
  game.reset();
  syncFromState();
  showHover([]);
  updateUI();
}

function undo() {
  if (busy) return;
  const wasOver = game.winner && game.winner !== 'draw' ? game.winner : null;
  if (!game.undo()) return;
  if (wasOver) { scores[wasOver] = Math.max(0, scores[wasOver] - 1); store.set('ctt.scores', scores); }
  syncFromState();
  showHover([]);
  updateUI();
}

// ---------------------------------------------------------------- UI
const rotateGrid = $('rotate-grid');
function addLayerRow(layer, grid) {
  const row = document.createElement('div');
  row.className = 'face-row';
  const hint = layer.like ? `<small>turns like ${layerName(layer.like)}</small>` : '';
  row.innerHTML = `<span class="fname">${layer.name}${hint}</span>`;
  for (const [cw, glyph, label] of [[false, '↺', 'counter-clockwise'], [true, '↻', 'clockwise']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'turn-btn';
    b.textContent = glyph;
    b.title = `Twist ${layer.name} ${label}` + (layer.like ? ` (seen from ${layerName(layer.like)})` : '');
    b.setAttribute('aria-label', b.title);
    b.dataset.face = layer.key;
    b.addEventListener('click', () => onTwist(layer.key, cw));
    row.appendChild(b);
  }
  row.addEventListener('pointerenter', () => {
    if (game.phase !== 'rotate' || busy) return;
    showHover(layerStickerIds(layer.key));
  });
  row.addEventListener('pointerleave', () => showHover([]));
  grid.appendChild(row);
}
for (const f of FACES) addLayerRow(f, rotateGrid);
for (const sl of SLICES) addLayerRow(sl, $('slice-grid'));

// Unfolded-cube map: 6 faces × 9 cells. Cells are rebuilt from state on every update.
const net = $('net');
const netCells = {}; // faceKey -> [[button]]
for (const f of FACES) {
  const wrap = document.createElement('div');
  wrap.className = 'net-slot';
  wrap.dataset.face = f.key;
  const cap = document.createElement('div');
  cap.className = 'net-label';
  cap.textContent = f.name;
  wrap.appendChild(cap);
  const faceEl = document.createElement('div');
  faceEl.className = 'net-face';
  faceEl.dataset.face = f.key;
  faceEl.title = `${f.name} face`;
  netCells[f.key] = [];
  for (let r = 0; r < 3; r++) {
    const rowCells = [];
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'net-cell' + (r === 1 && c === 1 ? ' center' : '');
      cell.addEventListener('click', () => { if (cell.dataset.id) onStickerClick(Number(cell.dataset.id)); });
      faceEl.appendChild(cell);
      rowCells.push(cell);
    }
    netCells[f.key].push(rowCells);
  }
  wrap.appendChild(faceEl);
  net.appendChild(wrap);
}

function renderNet() {
  const winIds = new Set(game.winLines.flatMap((l) => l.ids));
  for (const f of FACES) {
    const grid = game.faceGrid(f);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const s = grid[r][c];
        const cell = netCells[f.key][r][c];
        cell.dataset.id = s.id;
        cell.textContent = s.mark || '';
        cell.classList.toggle('x', s.mark === 'X');
        cell.classList.toggle('o', s.mark === 'O');
        cell.classList.toggle('marked', !!s.mark);
        cell.classList.toggle('win', winIds.has(s.id));
        cell.classList.toggle('last', s.id === game.lastPlaced && !winIds.has(s.id));
        cell.setAttribute('aria-label', `${f.name} face row ${r + 1} column ${c + 1}${s.mark ? ', ' + s.mark : ', empty'}`);
      }
  }
}

const nameOf = (p) => names[p].trim() || (p === 'X' ? 'Player 1' : 'Player 2');

function updateUI() {
  const status = $('status');
  const hint = $('hint');
  status.classList.remove('x', 'o', 'over');
  if (game.winner === 'draw') {
    status.textContent = 'Draw — every square is full.';
    status.classList.add('over');
    hint.textContent = 'Start a new game from the panel.';
  } else if (game.winner) {
    const faces = [...new Set(game.winLines.map((l) => FACE_BY_KEY[l.face].name))].join(' & ');
    status.textContent = `${nameOf(game.winner)} (${game.winner}) wins!`;
    status.classList.add('over');
    hint.textContent = `Three in a row on the ${faces} face.`;
  } else {
    const who = `${nameOf(game.current)} (${game.current})`;
    status.textContent = game.phase === 'place' ? `${who}: place a mark` : `${who}: twist a face`;
    status.classList.add(game.current.toLowerCase());
    hint.textContent = game.phase === 'place'
      ? 'Tap any empty square on the cube or the map.'
      : 'Choose a face and a direction in the panel.';
  }

  document.querySelectorAll('.player').forEach((el) => el.classList.toggle('active', !game.winner && el.dataset.player === game.current));
  $('score-X').textContent = scores.X;
  $('score-O').textContent = scores.O;

  const placeStep = $('step-place'), rotateStep = $('step-rotate');
  placeStep.className = 'step' + (game.phase === 'place' ? ' active' : game.phase === 'rotate' ? ' done' : '');
  rotateStep.className = 'step' + (game.phase === 'rotate' ? ' active' : '');

  const canTwist = game.phase === 'rotate' && !busy;
  $('rotate').classList.toggle('disabled', !canTwist);
  document.querySelectorAll('.turn-btn').forEach((b) => { b.disabled = !canTwist; });
  $('undo').disabled = !game.canUndo() || busy;

  renderNet();
  if (game.winner && game.winner !== 'draw') showWin(); else winMeshes.forEach((m) => { m.visible = false; });

  // Locked-view chrome
  const lockBtn = $('lock');
  lockBtn.textContent = lock ? 'Unlock view' : 'Lock view';
  lockBtn.classList.toggle('on', !!lock);
  lockBtn.setAttribute('aria-pressed', lock ? 'true' : 'false');
  $('lockbar').hidden = !lock;
  if (lock) {
    const name = faceByNormal(lock.n).name;
    $('lock-face').textContent = name;
    $('lock-ccw').disabled = !canTwist;
    $('lock-cw').disabled = !canTwist;
    $('lock-ccw').title = `Twist the ${name} face counter-clockwise`;
    $('lock-cw').title = `Twist the ${name} face clockwise`;
  }
  $('view-tip').textContent = lock
    ? 'Swipe across the cube to twist that layer · drag the background or use two fingers to turn the cube'
    : 'Drag the background to orbit · swipe across the cube to twist that layer · tap a square to play';
}

for (const p of ['X', 'O']) {
  const input = $(`name-${p}`);
  input.value = names[p];
  input.addEventListener('input', () => { names[p] = input.value; store.set('ctt.names', names); updateUI(); });
}
$('new').addEventListener('click', newGame);
$('undo').addEventListener('click', undo);
$('lock').addEventListener('click', () => (lock ? unlockView() : lockView()));
$('lock-ccw').addEventListener('click', () => { if (lock) onTwist(faceByNormal(lock.n).key, false); });
$('lock-cw').addEventListener('click', () => { if (lock) onTwist(faceByNormal(lock.n).key, true); });
window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if (!lock) return;
  const right = lockRight();
  const arrows = { ArrowRight: right, ArrowLeft: right.clone().negate(), ArrowUp: lock.up.clone(), ArrowDown: lock.up.clone().negate() };
  if (arrows[ev.key]) { ev.preventDefault(); viewSwipe(arrows[ev.key]); }
});

// ---------------------------------------------------------------- resize + loop
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();

const camDir = new THREE.Vector3();
function loop(now) {
  if (camAnim) camAnim(now);
  else if (!lock) controls.update();
  camDir.copy(camera.position).normalize();
  for (const sp of faceLabels) sp.visible = sp.userData.n.dot(camDir) > 0.05;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
syncFromState();
updateUI();
loop();

// Debug/test hook (read-only use): window.__ctt.game, .camera, .stickerMeshes
window.__ctt = { game, camera, stickerMeshes, renderer, get lock() { return lock; }, get animating() { return !!camAnim; } };
