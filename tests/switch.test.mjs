import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager, BoardManager, PathValidator, OptimalSolver, LEVELS } from '../build/testkit.mjs';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

/** 3×1 关卡，中间是闸刀开关（左右导通，初始关闭） */
function switchRow(on = false, limit = 6) {
  return {
    id: 950,
    name: 'switch-row',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      { d: E | W, r: 0, rot: false, k: 'switch', on },
      { d: W, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: limit,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
}

test('开关关闭时不导电：通路被物理切断', () => {
  const board = new BoardManager(switchRow(false));
  const sw = board.tileAt(1, 0);
  assert.equal(sw.kind, 'switch');
  assert.equal(sw.switchOn, false);
  assert.equal(sw.dirs, 0, '关闭时开口为 0，不参与任何连接');
  assert.equal(board.areAdjacentConnected(board.tileAt(0, 0), sw), false);
  assert.equal(PathValidator.isSolved(board), false, '关闭的开关不得传导电流');
});

test('开关打开后正常导电并通关', () => {
  const board = new BoardManager(switchRow(false));
  board.toggleAt(1, 0);
  assert.equal(board.tileAt(1, 0).switchOn, true);
  assert.equal(board.tileAt(1, 0).dirs, E | W);
  assert.equal(PathValidator.isSolved(board), true);
});

test('重复切换：开 -> 关 -> 开，状态与连通性同步变化', () => {
  // 终点开口朝网格外，永远不通关，用来观察纯粹的开关切换
  const level = switchRow(false, 10);
  level.goal.dir = N;
  level.cells[2] = { d: N, r: 0, rot: false, k: 'goal' };

  const gm = new GameManager(level);
  const sw = gm.board.tileAt(1, 0);
  assert.equal(PathValidator.isSolved(gm.board), false);

  gm.rotate(1, 0);
  assert.equal(sw.switchOn, true, '第一次点击打开');
  gm.rotate(1, 0);
  assert.equal(sw.switchOn, false, '第二次点击关闭');
  gm.rotate(1, 0);
  assert.equal(sw.switchOn, true, '第三次点击再次打开');

  assert.equal(gm.moves, 3, '每次切换都算 1 步');
  assert.equal(gm.status, 'playing');
});

test('打开开关直接接通时立即通关，之后不可再操作', () => {
  const gm = new GameManager(switchRow(false, 10));
  const sw = gm.board.tileAt(1, 0);
  gm.rotate(1, 0);
  assert.equal(sw.switchOn, true);
  assert.equal(gm.status, 'won', '打开后应立即判定通关');

  const res = gm.rotate(1, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'game-over');
  assert.equal(sw.switchOn, true, '通关后状态不应被改动');
});

test('开关不参与旋转：点击不会改变朝向，只切换状态', () => {
  const gm = new GameManager(switchRow(false, 10));
  const sw = gm.board.tileAt(1, 0);
  const before = sw.rotation;
  gm.rotate(1, 0);
  assert.equal(sw.rotation, before, '开关的 rotation 不应变化');
  gm.retry();
  gm.rotate(1, 0);
  assert.equal(sw.rotation, before);
});

test('边界：非开关方块切换无效；空点击不计步', () => {
  const gm = new GameManager(switchRow(false, 10));
  assert.equal(gm.board.toggleAt(0, 0), false, '起点不是开关');
  assert.equal(gm.board.toggleAt(9, 9), false, '越界坐标');

  const moves = gm.moves;
  const r = gm.rotate(9, 9);
  assert.equal(r.ok, false);
  assert.equal(gm.moves, moves, '无效点击不计步');
});

test('开关计入最优解：关闭的开关需要多花 1 步', () => {
  const closed = OptimalSolver.solve(switchRow(false));
  const opened = OptimalSolver.solve(switchRow(true));
  assert.equal(closed.solved, true);
  assert.equal(opened.solved, true);
  assert.equal(opened.minSteps, 0, '已开好的开关不需要操作');
  assert.equal(closed.minSteps, 1, '关闭的开关需要 1 步打开');
});

test('最优解可执行：按求解结果打开开关后确实通关', () => {
  const level = switchRow(false);
  const verify = OptimalSolver.verify(level);
  assert.equal(verify.ok, true);
  assert.equal(verify.minSteps, 1);
});

test('关卡数据里的开关：全部位于路径上且初始关闭，最优解都能执行', () => {
  let total = 0;
  for (const level of LEVELS) {
    const switches = level.cells
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c && c.k === 'switch');
    if (switches.length === 0) continue;
    total += switches.length;

    const onPath = new Set(level.solutionPath.map((p) => `${p.x},${p.y}`));
    for (const { c, i } of switches) {
      const x = i % level.width;
      const y = Math.floor(i / level.width);
      assert.ok(onPath.has(`${x},${y}`), `关卡 ${level.id} 的开关 (${x},${y}) 不在解路径上`);
      assert.equal(c.on, false, `关卡 ${level.id} 的开关应初始关闭`);
      assert.equal(c.rot, false, `关卡 ${level.id} 的开关不应可旋转`);
      assert.ok((c.d & (N | E | S | W)) !== 0);
    }
    const verify = OptimalSolver.verify(level);
    assert.equal(verify.ok, true, `关卡 ${level.id} 含开关时最优解仍可执行`);
  }
  assert.ok(total > 0, '至少应有关卡包含开关');
});

test('开关状态在棋盘快照/恢复中一致（重试完全重置）', () => {
  const gm = new GameManager(switchRow(false, 10));
  const sw = gm.board.tileAt(1, 0);
  gm.rotate(1, 0);
  gm.retry();
  assert.equal(sw.switchOn, false);
  assert.equal(gm.moves, 0);
  assert.equal(gm.status, 'playing');
});
