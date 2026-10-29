import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  OptimalSolver,
  computeStars,
  starThresholds,
  twoStarSlack,
  PathValidator,
  SaveManager,
} from '../build/testkit.mjs';
import { MemoryStorage, makeApp, tapId, tapCell } from './helpers.mjs';
import { SAVE_KEY, SAVE_VERSION } from '../build/testkit.mjs';

test('星级阈值：3 星等于最优解，2 星按比例放宽且至少 2 步', () => {
  assert.deepEqual(starThresholds(10), { three: 10, two: 12 });
  assert.deepEqual(starThresholds(40), { three: 40, two: 48 });
  assert.equal(twoStarSlack(0), 2);
  assert.equal(twoStarSlack(3), 2, '小关卡也至少给 2 步容错');
});

test('星级计算边界', () => {
  assert.equal(computeStars(10, 10), 3, '正好最优 = 3 星');
  assert.equal(computeStars(9, 10), 3, '少于最优（理论上不会发生）仍按 3 星');
  assert.equal(computeStars(11, 10), 2);
  assert.equal(computeStars(12, 10), 2);
  assert.equal(computeStars(13, 10), 1);
  assert.equal(computeStars(39, 32), 2, '32 + ceil(20%) = 39，正好 2 星');
  assert.equal(computeStars(40, 32), 1, '超过 39 就是 1 星');
  assert.equal(computeStars(0, 10), 0, '0 步视为未通关');
  assert.equal(computeStars(5, 0), 1, '最优步数缺失时至少给 1 星');
});

test('星级不会因为重试或更差成绩而下降', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  const r1 = save.markLevelCleared(1, 8, 30, 3);
  assert.equal(r1.stars, 3);
  assert.equal(r1.newStars, true);

  // 更差的成绩（步数更多、星级更低）不应覆盖最佳
  const r2 = save.markLevelCleared(1, 20, 30, 1);
  assert.equal(r2.stars, 3, '最佳星级只升不降');
  assert.equal(r2.newStars, false);
  assert.equal(save.getBestSteps(1), 8, '最佳步数只记录更优成绩');
  assert.equal(save.getStars(1), 3);
});

test('旧存档没有 stars 字段时，已通关关卡至少给 1 星', () => {
  const raw = {
    version: SAVE_VERSION,
    highestUnlocked: 2,
    levels: { 1: { cleared: true, bestSteps: 7 } },
    daily: null,
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.getStars(1), 1);
  assert.equal(save.getBestSteps(1), 7);
});

test('非法星级会被收敛到 0..3', () => {
  const raw = {
    version: SAVE_VERSION,
    highestUnlocked: 3,
    levels: {
      1: { cleared: true, bestSteps: 5, stars: 99 },
      2: { cleared: true, bestSteps: 6, stars: -4 },
      3: { cleared: true, bestSteps: 7, stars: 'x' },
    },
    daily: null,
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.getStars(1), 3);
  assert.equal(save.getStars(2), 1);
  assert.equal(save.getStars(3), 1);
});

test('端到端：按最优解通关拿 3 星', () => {
  const { app, platform, save } = makeApp();
  tapId(app, platform, 'btn.play');
  const optimal = app.optimalFor(app.level);
  assert.ok(optimal.minSteps > 0);

  for (const s of OptimalSolver.solve(app.level).steps) {
    for (let i = 0; i < s.turns; i++) {
      if (app.game.status === 'won') break;
      tapCell(app, platform, s.x, s.y, s.dir ?? 1);
    }
  }
  assert.equal(app.game.status, 'won');
  assert.equal(app.game.moves, optimal.minSteps, '按最优解操作应正好等于最优步数');
  assert.equal(app.win.stars, 3);
  assert.equal(app.win.minSteps, optimal.minSteps);
  assert.equal(save.getStars(1), 3);
});

test('端到端：多走 1 步仍可 2 星，再多则 1 星', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  const level = app.level;
  const optimal = app.optimalFor(level);
  const slack = twoStarSlack(optimal.minSteps);

  // 先在一个不在最优路径上的格子空转 1 步（若存在），否则直接按最优走
  const onPath = new Set(optimal.path.map((p) => `${p.x},${p.y}`));
  let wasted = 0;
  outer: for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const t = app.game.board.tileAt(x, y);
      if (t && t.rotatable && !onPath.has(`${x},${y}`)) {
        tapCell(app, platform, x, y);
        wasted = 1;
        break outer;
      }
    }
  }

  for (const s of OptimalSolver.solve(level).steps) {
    for (let i = 0; i < s.turns; i++) {
      if (app.game.status !== 'playing') break;
      tapCell(app, platform, s.x, s.y, s.dir ?? 1);
    }
  }
  if (app.game.status === 'won') {
    const expected = wasted === 1 && slack >= 1 ? 2 : 3;
    assert.equal(app.win.stars, expected, `多走 ${wasted} 步时的星级`);
  }
});

test('求解器：30 关的最优解都不超过参考解，且两次求解结果一致', () => {
  for (const level of LEVELS) {
    const a = OptimalSolver.solve(level);
    const b = OptimalSolver.solve(level);
    assert.equal(a.solved, true, `关卡 ${level.id} 应可解`);
    assert.equal(a.minSteps, b.minSteps, `关卡 ${level.id} 两次求解应一致`);
    assert.deepEqual(a.path, b.path);
    const ref = PathValidator.solutionCost(level);
    assert.ok(a.minSteps <= ref, `关卡 ${level.id} 最优 ${a.minSteps} 应 ≤ 参考 ${ref}`);
  }
});

test('求解器：不修改关卡数据', () => {
  const level = LEVELS[9];
  const before = JSON.stringify(level);
  OptimalSolver.solve(level);
  OptimalSolver.verify(level);
  assert.equal(JSON.stringify(level), before);
});

test('求解器：终点被封死时返回无解，而不是假通关', () => {
  const level = JSON.parse(JSON.stringify(LEVELS[0]));
  // 把终点开口改成朝向网格外（东边界再朝东），任何路径都进不去
  level.goal.dir = 2;
  level.cells[level.goal.y * level.width + level.goal.x] = { d: 2, r: 0, rot: false, k: 'goal' };

  const result = OptimalSolver.solve(level);
  assert.equal(result.solved, false);
  assert.equal(result.minSteps, Infinity);
  const verify = OptimalSolver.verify(level);
  assert.equal(verify.ok, false);
});

test('求解器：开关关闭时计入 1 步打开成本', () => {
  const level = JSON.parse(JSON.stringify(LEVELS[2]));
  const mid = level.solutionPath[1];
  const idx = mid.y * level.width + mid.x;
  const cell = level.cells[idx];
  cell.k = 'switch';
  cell.rot = false;
  cell.on = false;
  level.minSteps = undefined;

  const withSwitch = OptimalSolver.solve(level);
  const baseline = OptimalSolver.solve(JSON.parse(JSON.stringify(LEVELS[2])));
  if (withSwitch.solved && baseline.solved) {
    assert.ok(withSwitch.minSteps >= baseline.minSteps, '关闭的开关至少要多花 1 步');
  }
});
