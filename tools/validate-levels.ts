/**
 * 关卡合法性独立校验程序。
 * 运行：npm run validate
 *
 * 检查项：
 * 1. 每关结构合法（起终点、解路径、方向匹配、步数上限）
 * 2. 每关应用参考解后确实连通（存在合法解）
 * 3. 每关初始状态不是已通关
 * 4. 关卡之间不重复（不是简单复制/换色）
 * 5. 难度曲线没有明显回退
 * 6. 每日挑战可复现且合法
 * 7. 人为破坏的关卡会被检测出来（校验器自身有效性）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BoardManager } from '../src/core/BoardManager';
import { PathValidator } from '../src/core/PathValidator';
import { generateDailyLevel } from '../src/core/LevelGenerator';
import { DailyChallengeManager } from '../src/core/DailyChallengeManager';
import type { LevelData } from '../src/core/types';
import { countDirs } from '../src/core/types';

const root = process.cwd();
const levels = JSON.parse(readFileSync(resolve(root, 'src/data/levels.json'), 'utf8')) as LevelData[];

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

console.log(`\n=== 固定关卡校验（共 ${levels.length} 关）===\n`);
console.log('关卡  尺寸   路径  成本  上限  干扰  连通  状态');
const signatures = new Set<string>();
const costs: number[] = [];

for (const level of levels) {
  const result = PathValidator.validateLevel(level);
  const board = new BoardManager(level);
  board.applySolution();
  const solvedAfterSolution = PathValidator.isSolved(board);
  const decoys = level.cells.filter((c) => c && c.k === 'pipe').length;
  const sig = `${level.width}x${level.height}|${level.cells.map((c) => (c ? c.d : 0)).join(',')}|${level.solutionPath.map((p) => `${p.x}.${p.y}`).join('-')}`;

  const ok = result.ok && solvedAfterSolution;
  if (!ok) {
    for (const e of result.errors) fail(`关卡 ${level.id}: ${e}`);
    if (!solvedAfterSolution) fail(`关卡 ${level.id}: 应用参考解后不连通`);
  }
  if (signatures.has(sig)) fail(`关卡 ${level.id}: 与其它关卡重复`);
  signatures.add(sig);

  costs.push(result.solutionCost);
  console.log(
    `L${String(level.id).padStart(2, '0')}   ${level.width}x${level.height}  ${String(result.pathLength).padStart(3)}  ${String(
      result.solutionCost
    ).padStart(4)}  ${String(level.stepLimit).padStart(4)}  ${String(decoys).padStart(4)}  ${solvedAfterSolution ? '是' : '否'}    ${
      ok ? 'OK' : 'FAIL'
    }`
  );
}

// 难度曲线：解路径长度与步数上限不应出现大幅回退
console.log('\n=== 难度曲线检查 ===');
for (let i = 1; i < levels.length; i++) {
  const prev = levels[i - 1];
  const cur = levels[i];
  const prevArea = prev.width * prev.height;
  const curArea = cur.width * cur.height;
  if (curArea < prevArea) fail(`关卡 ${cur.id} 网格面积小于上一关`);
  if (cur.solutionPath.length + 1 < prev.solutionPath.length) {
    fail(`关卡 ${cur.id} 解路径明显短于上一关`);
  }
  if (costs[i] + 2 < costs[i - 1]) {
    console.log(`  ! 关卡 ${cur.id} 参考解步数(${costs[i]}) 低于上一关(${costs[i - 1]})，请确认难度曲线`);
  }
}
console.log('  已检查 30 关的尺寸、路径长度与步数成本');

// 分叉方块存在性（三通/四通）
const hasBranch = levels.some((l) => l.cells.some((c) => c && c.k === 'pipe' && countDirs(c.d) >= 3));
if (!hasBranch) fail('所有关卡都没有三通/四通方块，分叉规则未被覆盖');
console.log(`  分叉方块：${hasBranch ? '存在' : '缺失'}`);

// 每日挑战复现性
console.log('\n=== 每日挑战复现性 ===');
const dates = ['2026-01-01', '2026-10-29', '2027-06-15'];
for (const d of dates) {
  const a = generateDailyLevel(d);
  const b = generateDailyLevel(d);
  const same = JSON.stringify(a) === JSON.stringify(b);
  const valid = PathValidator.validateLevel(a).ok;
  const tz = DailyChallengeManager.dateKeyOf(new Date(`${d}T03:00:00+08:00`));
  console.log(`  ${d}: 两次生成一致=${same ? '是' : '否'} 合法=${valid ? '是' : '否'} 日期键=${tz}`);
  if (!same) fail(`每日挑战 ${d} 两次生成不一致`);
  if (!valid) fail(`每日挑战 ${d} 不合法`);
  if (tz !== d) fail(`每日挑战 ${d} 日期键计算错误: ${tz}`);
}

// 校验器自检：人为破坏关卡必须被检测出来
console.log('\n=== 校验器自检（负例）===');
const base = JSON.parse(JSON.stringify(levels[5])) as LevelData;
const broken: LevelData = JSON.parse(JSON.stringify(base));
const mid = broken.solutionPath[Math.floor(broken.solutionPath.length / 2)];
const idx = mid.y * broken.width + mid.x;
broken.cells[idx] = { d: 1 | 4, r: 0, rot: true, k: 'pipe' }; // 竖管，破坏横向路径
const brokenResult = PathValidator.validateLevel(broken);
console.log(`  破坏解路径后：合法=${brokenResult.ok ? '是（错误）' : '否（正确）'}`);
if (brokenResult.ok) fail('校验器未能检测出被破坏的关卡');

const noSolution: LevelData = JSON.parse(JSON.stringify(base));
noSolution.solutionPath = [];
const noSolutionResult = PathValidator.validateLevel(noSolution);
console.log(`  删除解路径后：合法=${noSolutionResult.ok ? '是（错误）' : '否（正确）'}`);
if (noSolutionResult.ok) fail('校验器未能检测出缺少解路径的关卡');

const solvedAtStart: LevelData = JSON.parse(JSON.stringify(base));
solvedAtStart.cells = solvedAtStart.cells.map((c) => (c ? { ...c, r: 0 } : c));
const solvedResult = PathValidator.validateLevel(solvedAtStart);
console.log(`  初始即通关：合法=${solvedResult.ok ? '是（错误）' : '否（正确）'}`);
if (solvedResult.ok) fail('校验器未能检测出初始即通关的关卡');

console.log(`\n=== 结果：${failures === 0 ? '全部通过' : `${failures} 项失败`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
