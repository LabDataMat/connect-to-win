import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N,
  E,
  S,
  W,
  rotateDirCW,
  rotateMaskCW,
  Tile,
  BoardManager,
  PathValidator,
  GameManager,
  OptimalSolver,
  LEVELS,
  LevelManager,
  DailyChallengeManager,
  generateDailyLevel,
  mulberry32,
} from '../build/testkit.mjs';

/** 构造 3x1 测试关卡：起点 - 中间管 - 终点 */
function makeRow(midDirs, midRotation, limit = 5) {
  const cells = [
    { d: E, r: 0, rot: false, k: 'start' },
    { d: midDirs, r: midRotation, rot: true, k: 'pipe' },
    { d: W, r: 0, rot: false, k: 'goal' },
  ];
  return {
    id: 999,
    name: 'test-row',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells,
    stepLimit: limit,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
}

test('方向位运算：顺时针旋转映射正确', () => {
  assert.equal(rotateDirCW(N), E);
  assert.equal(rotateDirCW(E), S);
  assert.equal(rotateDirCW(S), W);
  assert.equal(rotateDirCW(W), N);

  assert.equal(rotateMaskCW(N, 0), N);
  assert.equal(rotateMaskCW(N, 1), E);
  assert.equal(rotateMaskCW(N, 2), S);
  assert.equal(rotateMaskCW(N, 3), W);
  assert.equal(rotateMaskCW(N, 4), N);
  assert.equal(rotateMaskCW(N, -1), W, '逆时针一次等于顺时针三次');
  assert.equal(rotateMaskCW(N | S, 1), E | W, '直管旋转 90° 变横向');
  assert.equal(rotateMaskCW(N | E | S | W, 1), N | E | S | W, '四通旋转后不变');
});

test('Tile：旋转 4 次回到原位，且不改变不可旋转方块', () => {
  const t = new Tile(1, 1, E | W, 0, true, 'pipe');
  assert.equal(t.dirs, E | W);
  for (let i = 0; i < 4; i++) t.rotateCW();
  assert.equal(t.rotation, 0);
  assert.equal(t.dirs, E | W);

  const fixed = new Tile(0, 0, E, 0, false, 'start');
  assert.equal(fixed.rotateCW(), false);
  assert.equal(fixed.dirs, E);
  assert.equal(fixed.turnsToSolution, 0);
});

test('相邻连接规则：必须双向开口', () => {
  const level = makeRow(E | W, 0);
  const board = new BoardManager(level);
  const a = board.tileAt(0, 0);
  const b = board.tileAt(1, 0);
  assert.equal(board.areAdjacentConnected(a, b), true, '起点朝右 + 管道朝左，应连通');

  // 中间管只有朝右开口 -> 不连通
  const level2 = makeRow(E, 0);
  const board2 = new BoardManager(level2);
  assert.equal(board2.areAdjacentConnected(board2.tileAt(0, 0), board2.tileAt(1, 0)), false);

  // 中间管只有朝左开口 -> 与起点连通，但与终点不连通
  const level3 = makeRow(W, 0);
  const board3 = new BoardManager(level3);
  assert.equal(board3.areAdjacentConnected(board3.tileAt(0, 0), board3.tileAt(1, 0)), true);
  assert.equal(board3.areAdjacentConnected(board3.tileAt(1, 0), board3.tileAt(2, 0)), false);
});

test('相邻连接规则：非正交相邻不算连接', () => {
  const level = {
    id: 998,
    name: 'diag',
    width: 2,
    height: 2,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 1, y: 1, dir: W },
    cells: [
      { d: E | S, r: 0, rot: false, k: 'start' },
      null,
      null,
      { d: W | N, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: 3,
    solutionPath: [],
  };
  const board = new BoardManager(level);
  const a = board.tileAt(0, 0);
  const b = board.tileAt(1, 1);
  assert.equal(board.areAdjacentConnected(a, b), false);
  assert.equal(PathValidator.isSolved(board), false);
});

test('连通性判定：起点到终点存在合法路径才算通关', () => {
  const solvedBoard = new BoardManager(makeRow(E | W, 0));
  assert.equal(PathValidator.isSolved(solvedBoard), true);
  const path = PathValidator.findPath(solvedBoard);
  assert.deepEqual(path, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]);

  // 中间管转为竖向 -> 断路
  const brokenBoard = new BoardManager(makeRow(E | W, 1));
  assert.equal(PathValidator.isSolved(brokenBoard), false);
  assert.equal(PathValidator.findPath(brokenBoard), null);

  // 竖向管道与起点不匹配，起点只能到达自己
  const reach = PathValidator.reachableFromStart(brokenBoard);
  assert.equal(reach.has('0,0'), true);
  assert.equal(reach.has('1,0'), false, '起点朝右开口，竖向管道不匹配');
  assert.equal(reach.has('2,0'), false);
});

test('死路与障碍：死路分支不会误判通关', () => {
  // 3x2：起点(0,0) 向右，第二格是 T 形（左、上、下），终点在 (2,0) 但被断开
  const level = {
    id: 997,
    name: 'dead-end',
    width: 3,
    height: 2,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      { d: W | N | S, r: 0, rot: true, k: 'pipe' },
      null,
      { d: N, r: 0, rot: true, k: 'pipe' },
      { d: S, r: 0, rot: true, k: 'pipe' },
      null,
    ],
    stepLimit: 5,
    solutionPath: [],
  };
  const board = new BoardManager(level);
  assert.equal(PathValidator.isSolved(board), false, '死路不应通关');

  // 障碍（null 格）阻断路径
  const blocked = {
    ...level,
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      null,
      { d: W, r: 0, rot: false, k: 'goal' },
      null,
      null,
      null,
    ],
  };
  assert.equal(PathValidator.isSolved(new BoardManager(blocked)), false);
});

test('步数统计：只有有效旋转才计步', () => {
  const gm = new GameManager(makeRow(E | W, 2, 10));
  assert.equal(gm.moves, 0);
  assert.equal(gm.rotate(1, 0).ok, true);
  assert.equal(gm.moves, 1);

  // 空格 / 越界 / 固定方块不计步
  const empty = gm.rotate(5, 5);
  assert.equal(empty.ok, false);
  assert.equal(gm.moves, 1);

  const fixed = gm.rotate(0, 0);
  assert.equal(fixed.ok, false);
  assert.equal(fixed.reason, 'fixed');
  assert.equal(gm.moves, 1);
});

test('通关判定：最后一步接通也算赢，且优先于失败判定', () => {
  // 中间管初始竖向，转 1 次即接通；步数上限正好为 1
  const gm = new GameManager(makeRow(E | W, 3, 1));
  assert.equal(gm.status, 'playing');
  const res = gm.rotate(1, 0);
  assert.equal(res.won, true);
  assert.equal(res.lost, false);
  assert.equal(gm.status, 'won');
  assert.equal(gm.moves, 1);
});

test('失败判定：步数用尽且未接通则失败，失败后不可继续操作', () => {
  // 肘形管永远无法连通左右，2 步用尽后必定失败
  const gm = new GameManager(makeRow(E | S, 0, 2));
  assert.equal(gm.status, 'playing');
  const r1 = gm.rotate(1, 0);
  assert.equal(r1.lost, false);
  assert.equal(gm.moves, 1);
  const r2 = gm.rotate(1, 0);
  assert.equal(r2.lost, true);
  assert.equal(r2.won, false);
  assert.equal(gm.status, 'lost');
  const r3 = gm.rotate(1, 0);
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'game-over');
  assert.equal(gm.moves, 2, '失败后点击不再计步');
});

test('重试：棋盘、步数、状态完全重置', () => {
  // 肘形管无法连通左右，用来到达失败状态
  const level = makeRow(E | S, 2, 3);
  const gm = new GameManager(level);
  const before = gm.board.snapshot();
  gm.rotate(1, 0);
  gm.rotate(1, 0);
  gm.rotate(1, 0);
  assert.equal(gm.status, 'lost');
  gm.retry();
  assert.equal(gm.moves, 0);
  assert.equal(gm.status, 'playing');
  assert.deepEqual(gm.board.snapshot(), before);
});

test('提示：不消耗广告，只返回仍需旋转的解路径方块', () => {
  const gm = new GameManager(makeRow(E | W, 2, 5));
  assert.equal(gm.useHint(), true);
  assert.equal(gm.hintsUsed, 1);
  const hint = gm.nextHintTile();
  assert.deepEqual(hint, { x: 1, y: 0 });
});

test('关卡校验器：能识别无解 / 初始已解 / 缺解路径的关卡', () => {
  const base = JSON.parse(JSON.stringify(LEVELS[3]));
  const mid = base.solutionPath[Math.floor(base.solutionPath.length / 2)];
  const broken = JSON.parse(JSON.stringify(base));
  broken.cells[mid.y * broken.width + mid.x] = { d: N | S, r: 0, rot: true, k: 'pipe' };
  const brokenResult = PathValidator.validateLevel(broken);
  assert.equal(brokenResult.ok, false, '被破坏的关卡必须被检测出来');

  const solvedAtStart = JSON.parse(JSON.stringify(base));
  solvedAtStart.cells = solvedAtStart.cells.map((c) => (c ? { ...c, r: 0 } : c));
  assert.equal(PathValidator.validateLevel(solvedAtStart).ok, false, '初始即通关的关卡无效');

  const noPath = JSON.parse(JSON.stringify(base));
  noPath.solutionPath = [];
  assert.equal(PathValidator.validateLevel(noPath).ok, false);
});

test('30 个固定关卡全部合法且存在可解路径', () => {
  const manager = new LevelManager();
  assert.equal(manager.count, 30);
  for (const level of LEVELS) {
    const result = PathValidator.validateLevel(level);
    assert.equal(result.ok, true, `关卡 ${level.id} 校验失败: ${result.errors.join('; ')}`);
    assert.ok(result.solutionCost >= 1);

    // 步数上限必须容得下独立求解器算出的最优解
    const minSteps = level.minSteps ?? OptimalSolver.minSteps(level);
    assert.ok(Number.isFinite(minSteps), `关卡 ${level.id} 无最优解`);
    assert.ok(minSteps <= level.stepLimit, `关卡 ${level.id} 步数上限 ${level.stepLimit} < 最优 ${minSteps}`);
    assert.equal(level.minSteps, minSteps, `关卡 ${level.id} 的 minSteps 与求解器结果不一致`);

    // 最优解必须真的可执行
    const opt = OptimalSolver.verify(level);
    assert.equal(opt.ok, true, `关卡 ${level.id} 最优解不可执行: ${opt.reason ?? ''}`);

    const board = new BoardManager(level);
    board.applySolution();
    assert.equal(PathValidator.isSolved(board), true, `关卡 ${level.id} 应用参考解后不连通`);
  }
});

test('关卡不重复，且难度（参考步数）总体递增', () => {
  const sigs = new Set();
  let prevCost = 0;
  let prevArea = 0;
  for (const level of LEVELS) {
    const sig = level.cells.map((c) => (c ? c.d : 0)).join(',') + '|' + level.solutionPath.map((p) => `${p.x}.${p.y}`).join('-');
    assert.equal(sigs.has(sig), false, `关卡 ${level.id} 与之前的关卡重复`);
    sigs.add(sig);
    const cost = PathValidator.solutionCost(level);
    assert.ok(cost >= prevCost, `关卡 ${level.id} 参考步数低于上一关`);
    assert.ok(level.width * level.height >= prevArea, `关卡 ${level.id} 面积小于上一关`);
    prevCost = cost;
    prevArea = level.width * level.height;
  }
});

test('每日挑战：同一日期可复现，不同日期不同', () => {
  const a = generateDailyLevel('2026-10-29');
  const b = generateDailyLevel('2026-10-29');
  assert.equal(JSON.stringify(a), JSON.stringify(b), '同一天必须生成完全相同的谜题');

  const c = generateDailyLevel('2026-10-30');
  assert.notEqual(JSON.stringify(a), JSON.stringify(c), '不同日期应是不同谜题');
  assert.equal(PathValidator.validateLevel(a).ok, true);
  assert.equal(PathValidator.validateLevel(c).ok, true);
  assert.equal(a.daily, true);
  assert.equal(a.dateKey, '2026-10-29');
});

test('每日挑战：北京时间日期键与跨天边界正确', () => {
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T03:00:00+08:00')), '2026-10-29');
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T15:59:00Z')), '2026-10-29');
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T16:01:00Z')), '2026-10-30');
  const ms = DailyChallengeManager.msUntilNextDay(new Date('2026-10-29T23:59:00+08:00'));
  assert.ok(ms > 0 && ms <= 24 * 3600 * 1000);
});

test('确定性随机数：同种子序列一致', () => {
  const r1 = mulberry32(12345);
  const r2 = mulberry32(12345);
  for (let i = 0; i < 10; i++) assert.equal(r1(), r2());
});

test('额外步数：激励视频授予后可以从失败状态恢复', () => {
  const gm = new GameManager(makeRow(E | W, 2, 1));
  gm.rotate(1, 0);
  assert.equal(gm.status, 'lost');
  const limitBefore = gm.stepLimit;
  gm.grantExtraSteps(3);
  assert.equal(gm.stepLimit, limitBefore + 3);
  assert.equal(gm.status, 'playing');
  assert.equal(gm.rotate(1, 0).won, true);
});
