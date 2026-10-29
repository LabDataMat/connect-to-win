import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager, OptimalSolver, LEVELS, SaveManager } from '../build/testkit.mjs';
import { MemoryStorage, makeApp, tapId, tapCell } from './helpers.mjs';

/**
 * 4×1 关卡：两段管道都需要转正才能通关。
 * 只转第一段不会通关，用来观察「撤销」的中间状态。
 */
function rowLevel(limit = 10) {
  return {
    id: 980,
    name: 'undo-row',
    width: 4,
    height: 1,
    start: { x: 0, y: 0, dir: 2 },
    goal: { x: 3, y: 0, dir: 8 },
    cells: [
      { d: 2, r: 0, rot: false, k: 'start' },
      { d: 2 | 8, r: 1, rot: true, k: 'pipe' },
      { d: 2 | 8, r: 1, rot: true, k: 'pipe' },
      { d: 8, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: limit,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ],
  };
}

/** 终点开口朝网格外，永远无法通关，用于测试撤销次数等纯状态逻辑 */
function deadLevel(limit = 20) {
  const lv = rowLevel(limit);
  lv.goal.dir = 1;
  lv.cells[3] = { d: 1, r: 0, rot: false, k: 'goal' };
  return lv;
}

test('撤销：回退旋转并返还步数', () => {
  const gm = new GameManager(rowLevel());
  const tile = gm.board.tileAt(1, 0);
  const before = tile.rotation;

  gm.rotate(1, 0, 1);
  assert.equal(gm.moves, 1);
  assert.equal(tile.rotation, (before + 1) % 4);

  assert.equal(gm.undo(), true);
  assert.equal(gm.moves, 0, '撤销应返还 1 步');
  assert.equal(tile.rotation, before, '方块回到撤销前的朝向');
  assert.equal(gm.status, 'playing');
});

test('撤销：能回退开关状态', () => {
  // 不会通关的场景（终点朝外）里验证开关回退
  const level = deadLevel();
  level.cells[1] = { d: 2 | 8, r: 0, rot: false, k: 'switch', on: false };
  const gm = new GameManager(level);
  const sw = gm.board.tileAt(1, 0);
  assert.equal(sw.switchOn, false);

  gm.rotate(1, 0);
  assert.equal(sw.switchOn, true);
  assert.equal(gm.undo(), true);
  assert.equal(sw.switchOn, false, '撤销应把开关恢复为关闭');

  // 通关后不允许撤销
  const winLevel = rowLevel(8);
  winLevel.cells[1] = { d: 2 | 8, r: 0, rot: false, k: 'switch', on: true };
  const gm2 = new GameManager(winLevel);
  gm2.rotate(2, 0, 1);
  assert.equal(gm2.status, 'won');
  assert.equal(gm2.undo(), false, '通关后不应撤销');
});

test('撤销：每关最多 3 次，用完后不可用', () => {
  const gm = new GameManager(deadLevel(20));
  for (let i = 0; i < 5; i++) gm.rotate(1, 0);
  assert.equal(gm.moves, 5);
  assert.equal(gm.undosLeft, 3);

  assert.equal(gm.undo(), true);
  assert.equal(gm.undo(), true);
  assert.equal(gm.undo(), true);
  assert.equal(gm.undosLeft, 0);
  assert.equal(gm.undo(), false, '超过次数后撤销无效');
  assert.equal(gm.moves, 2, '只返还了 3 步');
  assert.equal(gm.canUndo, false);
});

test('撤销：没有操作时无效，不会扣次数', () => {
  const gm = new GameManager(rowLevel());
  assert.equal(gm.canUndo, false);
  assert.equal(gm.undo(), false);
  assert.equal(gm.undosLeft, 3, '无效撤销不应消耗次数');
  assert.equal(gm.moves, 0);
});

test('重试：重置撤销次数与历史', () => {
  const gm = new GameManager(deadLevel(20));
  gm.rotate(1, 0);
  gm.undo();
  assert.equal(gm.undosLeft, 2);

  gm.retry();
  assert.equal(gm.undosLeft, 3, '重试后撤销次数恢复');
  assert.equal(gm.moves, 0);
  assert.equal(gm.canUndo, false, '重试后历史清空');
});

test('撤销后可以继续操作并正常通关', () => {
  const gm = new GameManager(rowLevel(8));
  gm.rotate(1, 0, 1);
  assert.equal(gm.status, 'playing', '只转一段不应通关');

  gm.undo();
  assert.equal(gm.moves, 0);

  // 用最优解重新走完
  for (const s of OptimalSolver.solve(gm.level).steps) {
    for (let i = 0; i < s.turns; i++) {
      if (gm.status !== 'playing') break;
      gm.rotate(s.x, s.y, s.dir);
    }
  }
  assert.equal(gm.status, 'won');
});

test('端到端：撤销按钮可用，次数显示与状态一致', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');

  app.update(platform.now());
  let undoBtn = app.ui.find('btn.undo');
  assert.ok(undoBtn, '游戏页应有撤销按钮');
  assert.equal(undoBtn.disabled, true, '没有操作时撤销按钮禁用');

  const cell = app.level.solutionPath[1];
  tapCell(app, platform, cell.x, cell.y);
  app.update(platform.now());
  undoBtn = app.ui.find('btn.undo');
  assert.equal(undoBtn.disabled, false);
  assert.match(undoBtn.label, /撤销 3/);

  const movesBefore = app.game.moves;
  tapId(app, platform, 'btn.undo');
  assert.equal(app.game.moves, movesBefore - 1, '点击撤销应返还步数');
  assert.match(app.ui.find('btn.undo').label, /撤销 2/);
});

test('撤销不影响存档里的最佳成绩', () => {
  const storage = new MemoryStorage();
  const save = new SaveManager(storage);
  save.load();
  save.markLevelCleared(1, 8, 30, 3);
  assert.equal(save.getBestSteps(1), 8);
  assert.equal(save.getStars(1), 3);

  // 撤销是局内行为，不会写存档
  const gm = new GameManager(LEVELS[0]);
  gm.rotate(LEVELS[0].solutionPath[1].x, LEVELS[0].solutionPath[1].y);
  gm.undo();
  assert.equal(save.getBestSteps(1), 8);
  assert.equal(save.getStars(1), 3);
});
