import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Game, FACES, FACE_BY_KEY, faceAxis, turnAngle } from './game.js';

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

// Sticker textures: one per (face colour, mark) combination, drawn on a canvas.
const textureCache = new Map();
function stickerTexture(colorKey, mark) {
  const k = `${colorKey}:${mark || ''}`;
  if (textureCache.has(k)) return textureCache.get(k);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = FACE_BY_KEY[colorKey].hex;
  roundRect(ctx, 6, 6, size - 12, size - 12, 34);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.stroke();
  if (mark === 'X') {
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(74, 74); ctx.lineTo(size - 74, size - 74);
    ctx.moveTo(size - 74, 74); ctx.lineTo(74, size - 74);
    ctx.stroke();
  } else if (mark === 'O') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 60, 0, Math.PI * 2);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#121212'; ctx.lineWidth = 42; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 24; ctx.stroke();
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
    const mat = new THREE.MeshBasicMaterial({ map: stickerTexture(s.color, null), transparent: true });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    const n = new THREE.Vector3(...s.n0);
    mesh.position.copy(n).multiplyScalar(CUBIE / 2 + 0.003);
    mesh.quaternion.setFromUnitVectors(Z, n);
    mesh.userData.stickerId = s.id;
    g.add(mesh);
    stickerMeshes.set(s.id, mesh);
  }
  cubieGroups.push(g);
  cubeGroup.add(g);
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
      const tex = stickerTexture(s.color, s.mark);
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
const hoverMeshes = Array.from({ length: 9 }, () => makeHighlight(0xffffff, 0.35));
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
function animateTurn(faceKey, cw) {
  const face = FACE_BY_KEY[faceKey];
  const { axis } = faceAxis(face);
  const indices = game.layerCubieIndices(faceKey);
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  for (const i of indices) pivot.attach(cubieGroups[i]);
  const target = turnAngle(face, cw);
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
renderer.domElement.addEventListener('pointerdown', (ev) => { downPos = { x: ev.clientX, y: ev.clientY }; });
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downPos) return;
  const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return;
  const id = pickSticker(ev);
  if (id != null) onStickerClick(id);
});
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse' || busy || game.phase !== 'place') { if (game.phase !== 'rotate') showHover([]); return; }
  const id = pickSticker(ev);
  const s = id != null ? game.sticker(id).sticker : null;
  renderer.domElement.style.cursor = s && !s.mark ? 'pointer' : '';
  showHover(s && !s.mark ? [id] : []);
});
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

async function onTwist(faceKey, cw) {
  if (busy || game.phase !== 'rotate') return;
  busy = true;
  showHover([]);
  const res = game.rotate(faceKey, cw);
  if (!res.ok) { busy = false; toast(res.reason); return; }
  updateUI();
  await animateTurn(faceKey, cw);
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
  game.reset({ scramble: $('scramble').checked });
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
for (const f of FACES) {
  const row = document.createElement('div');
  row.className = 'face-row';
  row.innerHTML = `<span class="swatch" style="background:${f.hex}"></span><span class="fname">${f.name}</span>`;
  for (const [cw, glyph, label] of [[false, '↺', 'counter-clockwise'], [true, '↻', 'clockwise']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'turn-btn';
    b.textContent = glyph;
    b.title = `Twist the ${f.name} face ${label}`;
    b.setAttribute('aria-label', b.title);
    b.dataset.face = f.key;
    b.addEventListener('click', () => onTwist(f.key, cw));
    row.appendChild(b);
  }
  row.addEventListener('pointerenter', () => {
    if (game.phase !== 'rotate' || busy) return;
    showHover(game.faceGrid(f).flat().map((s) => s.id));
  });
  row.addEventListener('pointerleave', () => showHover([]));
  rotateGrid.appendChild(row);
}

// Unfolded-cube map: 6 faces × 9 cells. Cells are rebuilt from state on every update.
const net = $('net');
const netCells = {}; // faceKey -> [[button]]
for (const f of FACES) {
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
  net.appendChild(faceEl);
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
        cell.style.background = FACE_BY_KEY[s.color].hex;
        cell.textContent = s.mark || '';
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
}

for (const p of ['X', 'O']) {
  const input = $(`name-${p}`);
  input.value = names[p];
  input.addEventListener('input', () => { names[p] = input.value; store.set('ctt.names', names); updateUI(); });
}
$('new').addEventListener('click', newGame);
$('undo').addEventListener('click', undo);
window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); }
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

function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
syncFromState();
updateUI();
loop();

// Debug/test hook (read-only use): window.__ctt.game, .camera, .stickerMeshes
window.__ctt = { game, camera, stickerMeshes, renderer };
