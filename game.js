// Cube Tac-Toe — pure game logic (no DOM, no three.js).
// Stickers have no colours: the game is tic-tac-toe on the cube's shape only.
// Faces are named by position: the face currently at +y is "Top" and so on.
// The cube is modelled as 26 cubies. Each cubie has an integer position
// (x, y, z ∈ {-1, 0, 1}) and an integer 3×3 orientation matrix M. Every
// sticker stores its *original* outward normal n0 (in the cubie's own frame),
// so its current world normal is M · n0. Marks travel with stickers.

export const FACES = [
  { key: 'U', name: 'Top',    short: 'T', n: [0, 1, 0],  right: [1, 0, 0],  up: [0, 0, -1] },
  { key: 'D', name: 'Bottom', short: 'Bo', n: [0, -1, 0], right: [1, 0, 0],  up: [0, 0, 1] },
  { key: 'F', name: 'Front',  short: 'F', n: [0, 0, 1],  right: [1, 0, 0],  up: [0, 1, 0] },
  { key: 'B', name: 'Back',   short: 'Ba', n: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
  { key: 'R', name: 'Right',  short: 'R', n: [1, 0, 0],  right: [0, 0, -1], up: [0, 1, 0] },
  { key: 'L', name: 'Left',   short: 'L', n: [-1, 0, 0], right: [0, 0, 1],  up: [0, 1, 0] },
];
export const FACE_BY_KEY = Object.fromEntries(FACES.map((f) => [f.key, f]));

// Middle slices. "cw" for a slice means clockwise as seen from the `like` face.
export const SLICES = [
  { key: 'M', name: 'Middle (Left–Right)', like: 'R', axis: 0 },
  { key: 'E', name: 'Middle (Top–Bottom)', like: 'U', axis: 1 },
  { key: 'S', name: 'Middle (Front–Back)', like: 'F', axis: 2 },
];
export const SLICE_BY_KEY = Object.fromEntries(SLICES.map((s) => [s.key, s]));
export const LAYERS = [...FACES, ...SLICES];
export const LAYER_BY_KEY = { ...FACE_BY_KEY, ...SLICE_BY_KEY };
export const layerName = (key) => LAYER_BY_KEY[key].name;

export const PLAYERS = ['X', 'O'];
export const other = (p) => (p === 'X' ? 'O' : 'X');

// ---------- integer linear algebra ----------
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const matVec = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
export const matMul = (A, B) =>
  A.map((row) => [0, 1, 2].map((c) => row[0] * B[0][c] + row[1] * B[1][c] + row[2] * B[2][c]));

// +90° right-hand rotation about each axis.
const QUARTER = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], // x: (x,y,z) -> (x,-z,y)
  [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], // y: (x,y,z) -> (z,y,-x)
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]], // z: (x,y,z) -> (-y,x,z)
];
export function rotMatrix(axis, quarterTurns) {
  let M = I3;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) M = matMul(QUARTER[axis], M);
  return M;
}

/** Axis index and sign of a face normal. */
export function faceAxis(face) {
  const axis = face.n.findIndex((c) => c !== 0);
  return { axis, sign: face.n[axis] };
}

/**
 * Describe a quarter turn of a layer: which axis, which layer along it
 * (-1, 0 or +1) and how many quarter turns about the *positive* axis
 * (+1 or -1, right-hand rule). Clockwise viewed from the tip of an outward
 * normal is a negative rotation about that normal.
 */
export function moveFor(key, cw) {
  if (SLICE_BY_KEY[key]) {
    return { axis: SLICE_BY_KEY[key].axis, layer: 0, quarters: cw ? -1 : 1 };
  }
  const { axis, sign } = faceAxis(FACE_BY_KEY[key]);
  return { axis, layer: sign, quarters: -sign * (cw ? 1 : -1) };
}
/** Rotation angle in radians about the positive axis for a turn. */
export function turnAngle(key, cw) {
  return moveFor(key, cw).quarters * (Math.PI / 2);
}

// ---------- game ----------
export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.cubies = [];
    let id = 0;
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const pos = [x, y, z];
          const stickers = [];
          for (const f of FACES) {
            if (dot(f.n, pos) === 1) stickers.push({ id: id++, n0: f.n, mark: null });
          }
          this.cubies.push({ pos, M: I3, stickers });
        }
    this.current = 'X';
    this.phase = 'place'; // 'place' | 'rotate' | 'over'
    this.winner = null; // 'X' | 'O' | 'draw' | null
    this.winLines = [];
    this.turn = 1;
    this.lastPlaced = null;
    this.lastTurn = null; // { face, cw }
    this.history = [];
  }

  // ----- queries -----
  worldNormal(cubie, sticker) {
    return matVec(cubie.M, sticker.n0);
  }

  /** All 54 stickers with their current world position/normal. */
  allStickers() {
    const out = [];
    this.cubies.forEach((cubie, cubieIndex) => {
      for (const s of cubie.stickers) {
        out.push({ id: s.id, mark: s.mark, pos: cubie.pos, n: this.worldNormal(cubie, s), cubieIndex });
      }
    });
    return out;
  }

  sticker(id) {
    for (const cubie of this.cubies) for (const s of cubie.stickers) if (s.id === id) return { cubie, sticker: s };
    return null;
  }

  /** 3×3 grid (row-major, as drawn on an unfolded net) of stickers on `face`. */
  faceGrid(face) {
    const grid = [[null, null, null], [null, null, null], [null, null, null]];
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        if (!eq(this.worldNormal(cubie, s), face.n)) continue;
        const c = dot(cubie.pos, face.right) + 1;
        const r = 1 - dot(cubie.pos, face.up);
        grid[r][c] = s;
      }
    }
    return grid;
  }

  layerCubieIndices(key) {
    const { axis, layer } = moveFor(key, true);
    return this.cubies.map((c, i) => (c.pos[axis] === layer ? i : -1)).filter((i) => i >= 0);
  }

  emptyCount() {
    let n = 0;
    for (const c of this.cubies) for (const s of c.stickers) if (!s.mark) n++;
    return n;
  }

  /** Every completed line on every face: [{ face, mark, ids }]. */
  findLines() {
    const lines = [];
    for (const face of FACES) {
      const g = this.faceGrid(face);
      const triples = [];
      for (let i = 0; i < 3; i++) {
        triples.push([g[i][0], g[i][1], g[i][2]]);
        triples.push([g[0][i], g[1][i], g[2][i]]);
      }
      triples.push([g[0][0], g[1][1], g[2][2]]);
      triples.push([g[0][2], g[1][1], g[2][0]]);
      for (const t of triples) {
        const m = t[0].mark;
        if (m && t[1].mark === m && t[2].mark === m) lines.push({ face: face.key, mark: m, ids: t.map((s) => s.id) });
      }
    }
    return lines;
  }

  // ----- mutations -----
  snapshot() {
    return JSON.stringify({
      cubies: this.cubies, current: this.current, phase: this.phase, winner: this.winner,
      winLines: this.winLines, turn: this.turn, lastPlaced: this.lastPlaced, lastTurn: this.lastTurn,
    });
  }
  restore(snap) {
    Object.assign(this, JSON.parse(snap));
  }

  canUndo() {
    return this.history.length > 0;
  }
  undo() {
    if (!this.history.length) return false;
    this.restore(this.history.pop());
    return true;
  }

  /** Place the current player's mark on an empty sticker. */
  place(id) {
    if (this.phase !== 'place') return { ok: false, reason: 'You must rotate a face now.' };
    const found = this.sticker(id);
    if (!found) return { ok: false, reason: 'Unknown sticker.' };
    if (found.sticker.mark) return { ok: false, reason: 'That square is already taken.' };
    this.history.push(this.snapshot());
    found.sticker.mark = this.current;
    this.lastPlaced = id;
    this.evaluate();
    if (!this.winner) this.phase = 'rotate';
    return { ok: true };
  }

  /** Rotate a face or middle slice (the mandatory second half of a turn). */
  rotate(key, cw) {
    if (this.phase !== 'rotate') return { ok: false, reason: 'Place a mark first.' };
    if (!LAYER_BY_KEY[key]) return { ok: false, reason: 'Unknown layer.' };
    this.history.push(this.snapshot());
    this.applyTurn(key, cw);
    this.lastTurn = { face: key, cw };
    this.evaluate();
    if (!this.winner) {
      this.current = other(this.current);
      this.phase = 'place';
      this.turn += 1;
    }
    return { ok: true };
  }

  /** Low-level: apply a quarter turn of a face or slice to the cube state (no rule checks). */
  applyTurn(key, cw) {
    const { axis, layer, quarters } = moveFor(key, cw);
    const R = rotMatrix(axis, quarters);
    for (const cubie of this.cubies) {
      if (cubie.pos[axis] !== layer) continue;
      cubie.pos = matVec(R, cubie.pos);
      cubie.M = matMul(R, cubie.M);
    }
  }

  /**
   * Decide the outcome after an action. The player who acted wins if they have
   * any line; otherwise the opponent wins if the move handed them a line.
   */
  evaluate() {
    const lines = this.findLines();
    const mine = lines.filter((l) => l.mark === this.current);
    const theirs = lines.filter((l) => l.mark !== this.current);
    if (mine.length) {
      this.winner = this.current; this.winLines = mine;
    } else if (theirs.length) {
      this.winner = other(this.current); this.winLines = theirs;
    } else if (this.emptyCount() === 0) {
      this.winner = 'draw'; this.winLines = [];
    }
    if (this.winner) this.phase = 'over';
  }
}
