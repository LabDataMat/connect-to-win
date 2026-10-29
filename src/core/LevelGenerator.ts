import { BoardManager } from './BoardManager';
import { PathValidator } from './PathValidator';
import { CellData, LevelData, Point, Dir, DIR_OPPOSITE, DIR_VECTOR, dirFromDelta, rotateMaskCW } from './types';

/** 确定性伪随机数生成器（mulberry32），保证同一种子结果完全一致 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 -> 32 位整数种子（FNV-1a），用于每日挑战的日期种子 */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface GenOptions {
  seed: number;
  width: number;
  height: number;
  /** 参考解路径最小/最大长度（含起终点） */
  minPath: number;
  maxPath: number;
  /** 干扰方块数量 */
  decoys: number;
  /** 步数上限在参考解成本上的冗余 */
  slack: number;
  /** 路径上放置的闸刀开关数量（关闭状态，需要玩家打开） */
  switches?: number;
  id: number;
  name: string;
  difficulty: number;
  daily?: boolean;
  dateKey?: string;
}

const NEIGHBOR_DELTAS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function keyOf(p: Point): string {
  return `${p.x},${p.y}`;
}

/** 随机 DFS 在网格中寻找一条从 start 到 goal、长度在 [minLen, maxLen] 的简单路径。
 *  约束：第一步沿起点开口方向离开，最后一步必须从终点开口方向进入，
 *  保证起点/终点的开口始终朝向网格内部。 */
export function carvePath(
  rng: () => number,
  width: number,
  height: number,
  start: Point,
  goal: Point,
  startDir: Dir,
  goalDir: Dir,
  minLen: number,
  maxLen: number
): Point[] | null {
  const visited = new Set<string>([keyOf(start)]);
  const path: Point[] = [{ ...start }];
  let budget = 120000;

  // 第一步沿起点开口方向
  const sv = DIR_VECTOR[startDir];
  const first: Point = { x: start.x + sv.dx, y: start.y + sv.dy };
  if (first.x < 0 || first.y < 0 || first.x >= width || first.y >= height) return null;
  if (first.x === goal.x && first.y === goal.y && minLen > 2) return null;
  visited.add(keyOf(first));
  path.push(first);

  const gv = DIR_VECTOR[goalDir];

  const dfs = (): boolean => {
    if (budget-- <= 0) return false;
    const cur = path[path.length - 1];
    if (cur.x === goal.x && cur.y === goal.y) {
      if (path.length < minLen) return false;
      // 必须从终点开口方向进入
      const prev = path[path.length - 2];
      return prev !== undefined && prev.x === goal.x + gv.dx && prev.y === goal.y + gv.dy;
    }
    if (path.length >= maxLen) return false;
    for (const d of shuffle(NEIGHBOR_DELTAS, rng)) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const k = `${nx},${ny}`;
      if (visited.has(k)) continue;
      visited.add(k);
      path.push({ x: nx, y: ny });
      if (dfs()) return true;
      path.pop();
      visited.delete(k);
    }
    return false;
  };

  return dfs() ? path.map((p) => ({ ...p })) : null;
}

/** 干扰方块形状：肘形(2 相邻)、直通(2 相对)、三通(3) */
function randomDecoyDirs(rng: () => number): number {
  const r = rng();
  if (r < 0.55) {
    // 肘形
    const base = [1, 2, 4, 8][Math.floor(rng() * 4)];
    const turn = rng() < 0.5 ? 1 : 3; // 顺时针或逆时针 90°
    return rotateMaskCW(base, turn) | base;
  }
  if (r < 0.78) {
    // 直通
    return rng() < 0.5 ? 1 | 4 : 2 | 8;
  }
  // 三通
  const skip = [1, 2, 4, 8][Math.floor(rng() * 4)];
  return 15 & ~skip;
}

/**
 * 生成一个关卡：随机生成一条解路径 -> 沿路径铺设管道 -> 添加干扰块 -> 打乱旋转。
 * 生成后用 PathValidator 复检，失败则换种子重试（绝不返回无解关卡）。
 */
export function generateLevel(opts: GenOptions): LevelData {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = (opts.seed + attempt * 7919) >>> 0;
    const rng = mulberry32(seed);
    const { width, height } = opts;

    // 起点/终点随机落在四条边中的任意一条，开口朝向网格内部
    const pickEndpoint = (): { p: Point; dir: Dir } => {
      const edge = Math.floor(rng() * 4);
      if (edge === 0) return { p: { x: 0, y: Math.floor(rng() * height) }, dir: 2 as Dir };
      if (edge === 1) return { p: { x: width - 1, y: Math.floor(rng() * height) }, dir: 8 as Dir };
      if (edge === 2) return { p: { x: Math.floor(rng() * width), y: 0 }, dir: 4 as Dir };
      return { p: { x: Math.floor(rng() * width), y: height - 1 }, dir: 1 as Dir };
    };

    const s1 = pickEndpoint();
    let s2 = pickEndpoint();
    let guard = 0;
    while (guard++ < 12 && s2.p.x === s1.p.x && s2.p.y === s1.p.y) s2 = pickEndpoint();
    const start = s1.p;
    const goal = s2.p;
    const startDir = s1.dir;
    const goalDir = s2.dir;

    const maxPath = Math.min(opts.maxPath, width * height - 1);
    const minPath = Math.min(opts.minPath, maxPath);
    const path = carvePath(rng, width, height, start, goal, startDir, goalDir, minPath, maxPath);
    if (!path) continue;

    const cells: (CellData | null)[] = new Array(width * height).fill(null);
    const onPath = new Set(path.map(keyOf));

    // 沿路径铺设管道：内部格 = 前驱方向 | 后继方向
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      let dirs = 0;
      if (i > 0) dirs |= dirFromDelta(path[i - 1].x - p.x, path[i - 1].y - p.y) as number;
      if (i < path.length - 1) dirs |= dirFromDelta(path[i + 1].x - p.x, path[i + 1].y - p.y) as number;
      const isStart = i === 0;
      const isGoal = i === path.length - 1;
      cells[p.y * width + p.x] = {
        d: dirs,
        r: 0,
        rot: !isStart && !isGoal,
        k: isStart ? 'start' : isGoal ? 'goal' : 'pipe',
      };
    }

    // 干扰块：不在解路径上的随机格子
    const candidates: Point[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!onPath.has(`${x},${y}`)) candidates.push({ x, y });
      }
    }
    const decoyCells = shuffle(candidates, rng).slice(0, Math.min(opts.decoys, candidates.length));
    for (const p of decoyCells) {
      cells[p.y * width + p.x] = { d: randomDecoyDirs(rng), r: 0, rot: true, k: 'pipe' };
    }

    // 在路径中段放闸刀开关：不可旋转、初始关闭，需要玩家点一下才能导电
    const switchCount = Math.min(opts.switches ?? 0, Math.max(0, path.length - 3));
    if (switchCount > 0) {
      const innerIdx = Array.from({ length: path.length - 2 }, (_, i) => i + 1);
      const picked = shuffle(innerIdx, rng).slice(0, switchCount);
      for (const i of picked) {
        const p = path[i];
        const cell = cells[p.y * width + p.x]!;
        cell.k = 'switch';
        cell.rot = false;
        cell.on = false;
      }
    }

    // 打乱：按目标成本定向分配每格的旋转次数（1..3 次），
    // 让「参考解步数」与路径长度成正比，避免随机打乱导致成本暴涨/暴跌。
    const inner = path.length - 2;
    let cost = 0;
    if (inner > 0) {
      const perTile = new Array<number>(inner).fill(1);
      let extra = Math.max(0, Math.round(inner * 1.9) - inner);
      let guardCount = 0;
      while (extra > 0 && guardCount++ < inner * 20) {
        const i = Math.floor(rng() * inner);
        if (perTile[i] < 3) {
          perTile[i] += 1;
          extra -= 1;
        }
      }
      for (let i = 0; i < inner; i++) {
        const p = path[i + 1];
        const cell = cells[p.y * width + p.x]!;
        if (cell.k === 'switch') {
          cell.r = 0; // 开关不可旋转，方向必须固定
          continue;
        }
        cell.r = (4 - perTile[i]) % 4;
        cost += perTile[i];
      }
    }
    // 干扰块初始朝向尽量不直接接上主路径：否则很容易形成「捷径」，
    // 玩家随便转两下就通关，关卡设计的最优解形同虚设。
    const touchesPath = (p: Point, dirs: number): boolean => {
      for (const d of [1, 2, 4, 8]) {
        if ((dirs & d) === 0) continue;
        const v = DIR_VECTOR[d as 1 | 2 | 4 | 8];
        const nx = p.x + v.dx;
        const ny = p.y + v.dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!onPath.has(`${nx},${ny}`)) continue;
        const nb = cells[ny * width + nx];
        if (!nb) continue;
        if ((nb.d & DIR_OPPOSITE[d]) !== 0) return true;
      }
      return false;
    };
    for (const p of decoyCells) {
      const cell = cells[p.y * width + p.x]!;
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        const r = Math.floor(rng() * 4);
        if (!touchesPath(p, rotateMaskCW(cell.d, r))) {
          cell.r = r;
          placed = true;
        }
      }
      if (!placed) cell.r = Math.floor(rng() * 4);
    }

    const level: LevelData = {
      id: opts.id,
      name: opts.name,
      width,
      height,
      start: { ...start, dir: startDir },
      goal: { ...goal, dir: goalDir },
      cells,
      stepLimit: cost + opts.slack,
      solutionPath: path,
      difficulty: opts.difficulty,
      daily: opts.daily,
      dateKey: opts.dateKey,
    };

    const board = new BoardManager(level);
    if (PathValidator.isSolved(board)) continue; // 初始即解，重来
    const check = PathValidator.validateLevel(level);
    if (!check.ok) continue;
    return level;
  }
  throw new Error(`关卡生成失败: id=${opts.id} seed=${opts.seed}`);
}

/**
 * 每日挑战：由日期键（YYYY-MM-DD，北京时间）派生种子，所有玩家当天谜题一致。
 * 参数随日期确定，无需服务器。
 */
export function generateDailyLevel(dateKey: string): LevelData {
  const seed = hashString(`daily:${dateKey}`);
  const rng = mulberry32(seed);
  const width = 5 + (seed % 2);
  const height = 5 + ((seed >>> 3) % 2);
  const decoys = 4 + Math.floor(rng() * 3);
  return generateLevel({
    seed,
    width,
    height,
    minPath: 9,
    maxPath: 12,
    decoys,
    slack: 3,
    id: 0,
    name: '每日挑战',
    difficulty: 3,
    daily: true,
    dateKey,
  });
}

/** 方向常量重导出，便于工具使用 */
export { DIR_OPPOSITE };
