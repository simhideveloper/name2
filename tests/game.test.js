import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FACES, FACE_BY_KEY } from '../game.js';

const monochrome = (g) =>
  FACES.every((f) => g.faceGrid(f).flat().every((s) => s && s.color === f.key));

test('initial cube has 54 stickers, 9 per face, each face one colour', () => {
  const g = new Game();
  assert.equal(g.allStickers().length, 54);
  for (const f of FACES) assert.equal(g.faceGrid(f).flat().filter(Boolean).length, 9);
  assert.ok(monochrome(g));
});

test('F clockwise moves the top edge sticker onto the right face', () => {
  const g = new Game();
  g.applyTurn('F', true);
  const s = g.allStickers().find((s) => s.pos.join() === '1,0,1' && s.n.join() === '1,0,0');
  assert.equal(s.color, 'U');
  // the right face now shows a white row at its left column (next to F)
  const col = g.faceGrid(FACE_BY_KEY.R).map((row) => row[0].color);
  assert.deepEqual(col, ['U', 'U', 'U']);
});

test('four quarter turns and cw+ccw are identities', () => {
  for (const f of FACES) {
    const g = new Game();
    for (let i = 0; i < 4; i++) g.applyTurn(f.key, true);
    assert.ok(monochrome(g), `4x ${f.key}`);
    g.applyTurn(f.key, true); g.applyTurn(f.key, false);
    assert.ok(monochrome(g), `${f.key} ${f.key}'`);
  }
});

test('a scrambled cube still has exactly 9 stickers per face', () => {
  const g = new Game({ scramble: true, rng: () => 0.37 });
  for (const f of FACES) assert.equal(g.faceGrid(f).flat().filter(Boolean).length, 9);
});

test('turn structure: place, then rotate, then the other player', () => {
  const g = new Game();
  const id = g.faceGrid(FACE_BY_KEY.F)[0][0].id;
  assert.equal(g.rotate('F', true).ok, false);
  assert.equal(g.place(id).ok, true);
  assert.equal(g.phase, 'rotate');
  assert.equal(g.place(g.faceGrid(FACE_BY_KEY.F)[0][1].id).ok, false);
  assert.equal(g.rotate('U', false).ok, true);
  assert.equal(g.current, 'O');
  assert.equal(g.phase, 'place');
  assert.equal(g.turn, 2);
  assert.equal(g.place(id).ok, false, 'occupied square');
});

test('placing the third mark in a row wins immediately', () => {
  const g = new Game();
  const row = g.faceGrid(FACE_BY_KEY.F)[1];
  row[0].mark = 'X'; row[1].mark = 'X';
  g.place(row[2].id);
  assert.equal(g.winner, 'X');
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.winLines[0].ids.sort(), row.map((s) => s.id).sort());
});

test('rotation outcome: mover wins when both players get lines', () => {
  const g = new Game();
  const F = g.faceGrid(FACE_BY_KEY.F);
  const L = g.faceGrid(FACE_BY_KEY.L);
  const R = g.faceGrid(FACE_BY_KEY.R);
  // U counter-clockwise (from above) moves L's top row onto F's top row and
  // F's top row onto R's top row. X completes F's left column, O completes R's right column.
  F[1][0].mark = 'X'; F[2][0].mark = 'X'; L[0][0].mark = 'X';
  F[0][2].mark = 'O'; R[1][2].mark = 'O'; R[2][2].mark = 'O';
  g.current = 'X'; g.phase = 'rotate';
  assert.equal(g.findLines().length, 0, 'no line before the turn');
  g.rotate('U', false);
  assert.equal(g.findLines().length, 2, 'both players have a line after the turn');
  assert.equal(g.winner, 'X');
  assert.ok(g.winLines.every((l) => l.mark === 'X'));
  assert.deepEqual(g.faceGrid(FACE_BY_KEY.F).map((row) => row[0].mark), ['X', 'X', 'X']);
});

test('rotation that only gives the opponent a line loses', () => {
  const g = new Game();
  const F = g.faceGrid(FACE_BY_KEY.F);
  F[1][0].mark = 'O'; F[2][0].mark = 'O';
  g.faceGrid(FACE_BY_KEY.L)[0][0].mark = 'O';
  g.current = 'X'; g.phase = 'rotate';
  g.rotate('U', false);
  assert.equal(g.winner, 'O');
  assert.equal(g.phase, 'over');
});

test('undo restores the previous state', () => {
  const g = new Game();
  const before = g.snapshot();
  const id = g.faceGrid(FACE_BY_KEY.U)[2][2].id;
  g.place(id);
  g.rotate('R', true);
  assert.ok(g.undo());
  assert.equal(g.phase, 'rotate');
  assert.ok(g.undo());
  assert.equal(g.snapshot(), before);
  assert.equal(g.undo(), false);
});
