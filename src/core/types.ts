/**
 * 基础类型与方向位运算。
 * 方向使用位掩码表示，便于组合（分叉/三通）与旋转。
 */

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type Dir = 1 | 2 | 4 | 8;
export type DirMask = number;

export const DIRS: readonly Dir[] = [N, E, S, W] as const;

export const DIR_VECTOR: Record<number, { dx: number; dy: number }> = {
  [N]: { dx: 0, dy: -1 },
  [E]: { dx: 1, dy: 0 },
  [S]: { dx: 0, dy: 1 },
  [W]: { dx: -1, dy: 0 },
};

export const DIR_OPPOSITE: Record<number, Dir> = {
  [N]: S,
  [E]: W,
  [S]: N,
  [W]: E,
};

export const DIR_LABEL: Record<number, string> = {
  [N]: '上',
  [E]: '右',
  [S]: '下',
  [W]: '左',
};

/** 顺时针旋转一次的方向映射：上->右->下->左->上 */
export function rotateDirCW(dir: Dir): Dir {
  switch (dir) {
    case N:
      return E;
    case E:
      return S;
    case S:
      return W;
    case W:
      return N;
    default:
      throw new Error(`invalid dir: ${dir}`);
  }
}

/** 将方向集合顺时针旋转 times 次（times 可为负数，表示逆时针） */
export function rotateMaskCW(mask: DirMask, times = 1): DirMask {
  let t = ((times % 4) + 4) % 4;
  let result = mask;
  for (let i = 0; i < t; i++) {
    let next = 0;
    for (const d of DIRS) {
      if (result & d) next |= rotateDirCW(d);
    }
    result = next;
  }
  return result;
}

/** 由相邻格子的坐标差求方向；非相邻返回 0 */
export function dirFromDelta(dx: number, dy: number): Dir | 0 {
  if (dx === 0 && dy === -1) return N;
  if (dx === 1 && dy === 0) return E;
  if (dx === 0 && dy === 1) return S;
  if (dx === -1 && dy === 0) return W;
  return 0;
}

export function countDirs(mask: DirMask): number {
  let c = 0;
  for (const d of DIRS) if (mask & d) c++;
  return c;
}

export function hasDir(mask: DirMask, dir: Dir): boolean {
  return (mask & dir) !== 0;
}

export function maskToString(mask: DirMask): string {
  return DIRS.filter((d) => mask & d)
    .map((d) => DIR_LABEL[d])
    .join('');
}

/** 方块种类 */
export type TileKind = 'start' | 'goal' | 'pipe' | 'block' | 'empty';

export interface Point {
  x: number;
  y: number;
}

/** 关卡中单个格子的静态定义 */
export interface CellData {
  /** 解状态下的连接方向（位掩码）。玩家需要旋转回该方向（或其它等价合法方向） */
  d: DirMask;
  /** 初始旋转偏移（0..3），0 表示已处于解状态 */
  r: number;
  /** 是否可旋转 */
  rot: boolean;
  /** 种类，缺省为 pipe */
  k?: TileKind;
}

/** 固定关卡数据结构（也是每日挑战生成结果的数据结构） */
export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  /** 起点：位置 + 唯一开口方向 */
  start: Point & { dir: Dir };
  /** 终点：位置 + 唯一开口方向 */
  goal: Point & { dir: Dir };
  /** 按行优先排列，长度 = width * height；null 表示空格（不可放置） */
  cells: (CellData | null)[];
  /** 目标步数（步数上限） */
  stepLimit: number;
  /** 参考解路径（从起点到终点，含起终点），用于提示与合法性校验 */
  solutionPath: Point[];
  /** 是否为每日挑战 */
  daily?: boolean;
  /** 每日挑战日期键 YYYY-MM-DD */
  dateKey?: string;
  /** 难度（1..5），仅用于展示 */
  difficulty?: number;
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/** 平台无关的键值存储接口（Web: localStorage；微信: wx.setStorageSync） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
