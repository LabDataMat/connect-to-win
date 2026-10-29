import test from 'node:test';
import assert from 'node:assert/strict';
import { Tile, BoardManager, GameManager, OptimalSolver, LEVELS, N, E, S, W, computeStars } from '../build/testkit.mjs';
import { makeApp, tapId, tapCell } from './helpers.mjs';

test('逆时针旋转：方向映射正确，4 次回到原位', () => {
  const t = new Tile(0, 0, E, 0, true, 'pipe');
  t.rotateCCW();
  assert.equal(t.rotation, 3);
  assert.equal(t.dirs, N, '朝右的开口逆时针 90° 变成朝上');
  for (let i = 0; i < 3; i++) t.rotateCCW();
  assert.equal(t.rotation, 0);
  assert.equal(t.dirs, E);
});

test('逆时针 1 次 == 顺时针 3 次', () => {
  const a = new Tile(0, 0, E | S, 0, true, 'pipe');
  const b = new Tile(0, 0, E | S, 0, true, 'pipe');
  a.rotateCCW();
  b.rotateCW();
  b.rotateCW();
  b.rotateCW();
  assert.equal(a.dirs, b.dirs);
});

test('逆时针同样计 1 步，且能通关', () => {
  const level = {
    id: 970,
    name: 'ccw-row',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      { d: E | W, r: 1, rot: true, k: 'pipe' },
      { d: W, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: 4,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
  const gm = new GameManager(level);
  const tile = gm.board.tileAt(1, 0);
  assert.equal(tile.dirs, N | S, '初始为竖向');

  const res = gm.rotate(1, 0, -1);
  assert.equal(res.ok, true);
  assert.equal(gm.moves, 1, '逆时针只算 1 步');
  assert.equal(tile.rotation, 0, '逆时针一次即回到解状态');
  assert.equal(gm.status, 'won', '逆时针也能接通');
});

test('求解器：双向旋转不会比单向更差', () => {
  for (const level of LEVELS) {
    const sol = OptimalSolver.solve(level);
    assert.equal(sol.solved, true, `关卡 ${level.id} 应可解`);
    // 每个 step 的 turns 不超过 2（4 个朝向里最远只需要转 2 次）
    for (const s of sol.steps) {
      if (s.toggle) continue;
      assert.ok(s.turns >= 1 && s.turns <= 2, `关卡 ${level.id} 的 (${s.x},${s.y}) turns=${s.turns} 不合理`);
      assert.ok(s.dir === 1 || s.dir === -1);
    }
  }
});

test('按最优解（含逆时针步骤）通关仍拿 3 星', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  const sol = OptimalSolver.solve(app.level);
  for (const s of sol.steps) {
    for (let i = 0; i < s.turns; i++) {
      if (app.game.status !== 'playing') break;
      tapCell(app, platform, s.x, s.y, s.dir);
    }
  }
  assert.equal(app.game.status, 'won');
  assert.equal(app.game.moves, sol.minSteps);
  assert.equal(app.win.stars, computeStars(sol.minSteps, sol.minSteps));
  assert.equal(app.win.stars, 3);
});

test('长按 380ms 触发逆时针，短按触发顺时针', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');

  const level = app.level;
  const cell = level.solutionPath[1];
  const tile = app.game.board.tileAt(cell.x, cell.y);
  app.update(platform.now());
  const el = app.ui.find(`cell.${cell.x}.${cell.y}`);
  const vp = app.viewport();
  const cx = (el.rect.x + el.rect.w / 2) * vp.scale + vp.offsetX * vp.scale;
  const cy = (el.rect.y + el.rect.h / 2) * vp.scale;

  const before = tile.rotation;

  // 短按：按下后立刻抬起
  app.pointerDown(cx, cy);
  app.pointerUp();
  assert.equal(tile.rotation, (before + 1) % 4, '短按应顺时针');
  assert.equal(app.game.moves, 1);

  // 长按：按住超过阈值
  const before2 = tile.rotation;
  app.pointerDown(cx, cy);
  t.mock.timers.tick(400);
  assert.equal(tile.rotation, (before2 + 3) % 4, '长按应逆时针');
  assert.equal(app.game.moves, 2);

  // 长按后抬起不应再触发一次
  app.pointerUp();
  assert.equal(app.game.moves, 2, '长按结束后抬起不应重复计数');
});
