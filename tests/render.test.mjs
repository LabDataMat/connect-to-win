import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasRenderer, rotateDirCW, N, E, S, W } from '../build/testkit.mjs';
import { makeApp } from './helpers.mjs';

/**
 * 记录型 canvas 上下文：把绘制调用记录下来，用于还原「画出来的导线方向」。
 * 这样能验证渲染与逻辑一致，而不是只看逻辑正确。
 */
function makeRecorder() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, key) {
        if (key === '__calls') return calls;
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'measureText') return () => ({ width: 10 });
        if (key === 'canvas') return { width: 1000, height: 2000 };
        return (...args) => {
          calls.push([key, ...args]);
        };
      },
      set() {
        return true;
      },
    }
  );
  return ctx;
}

function dirOf(x, y) {
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return 0;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? E : W;
  return y > 0 ? S : N;
}

function rotateTimes(dir, times) {
  const t = ((times % 4) + 4) % 4;
  let r = dir;
  for (let i = 0; i < t; i++) r = rotateDirCW(r);
  return r;
}

/** 从绘制调用中还原每个方块实际画出的导线方向 */
function extractTileDirs(calls) {
  const groups = [];
  let cur = null;
  for (const [name, ...args] of calls) {
    if (name === 'translate') {
      cur = { angle: 0, dirs: [] };
      groups.push(cur);
    } else if (name === 'restore') {
      cur = null;
    } else if (cur && name === 'rotate') {
      cur.angle = args[0];
    } else if (cur && name === 'lineTo') {
      const d = dirOf(args[0], args[1]);
      if (d !== 0) cur.dirs.push(d);
    }
  }
  return groups.map((g) => {
    const steps = Math.round(g.angle / (Math.PI / 2));
    return {
      angleSteps: ((steps % 4) + 4) % 4,
      dirs: [...new Set(g.dirs.map((d) => rotateTimes(d, steps)))].sort((a, b) => a - b),
    };
  });
}

function rowLevel(midDirs, midRotation) {
  return {
    id: 990,
    name: 'render-row',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      { d: midDirs, r: midRotation, rot: true, k: 'pipe' },
      { d: W, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: 9,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
}

function renderOnce(app, platform) {
  const recorder = makeRecorder();
  platform.ctx = recorder;
  const renderer = new CanvasRenderer(platform);
  const now = platform.now();
  app.update(now);
  renderer.draw(app.viewState(now), { elements: app.ui.elements, board: app.ui.board }, [], now, null);
  return recorder.__calls;
}

test('渲染方向与逻辑方向一致（每种旋转角度）', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    const { app, platform } = makeApp();
    app.startLevel(rowLevel(E | W, rotation), false);
    app.update(platform.now());
    const calls = renderOnce(app, platform);
    const painted = extractTileDirs(calls);
    const tiles = app.game.board.allTiles;

    assert.equal(painted.length, tiles.length, `旋转 ${rotation}：绘制的方块数量应与棋盘一致`);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const expect = [N, E, S, W].filter((d) => (tile.dirs & d) !== 0).sort((a, b) => a - b);
      assert.deepEqual(
        painted[i].dirs,
        expect,
        `旋转 ${rotation} 次时，(${tile.x},${tile.y}) 画出的方向 ${painted[i].dirs} 与逻辑方向 ${expect} 不一致`
      );
    }
  }
});

test('旋转一次后渲染立即跟随（不会滞后一格）', () => {
  const { app, platform } = makeApp();
  app.startLevel(rowLevel(E | W, 0), false);
  app.update(platform.now());
  const tile = app.game.board.tileAt(1, 0);

  // 转一次：横向管变成纵向
  app.game.rotate(1, 0);
  app.update(platform.now());
  const painted = extractTileDirs(renderOnce(app, platform));
  const mid = painted[1];
  assert.deepEqual(mid.dirs, [N, S].sort((a, b) => a - b), '转一次后应画成竖向');
  assert.deepEqual(
    mid.dirs,
    [N, E, S, W].filter((d) => (tile.dirs & d) !== 0).sort((a, b) => a - b)
  );
});

test('起点与终点渲染方向与关卡数据一致', () => {
  const { app, platform } = makeApp();
  app.startLevel(rowLevel(E | W, 0), false);
  app.update(platform.now());
  const painted = extractTileDirs(renderOnce(app, platform));
  assert.deepEqual(painted[0].dirs, [E], '起点应画成朝右');
  assert.deepEqual(painted[2].dirs, [W], '终点应画成朝左');
});
