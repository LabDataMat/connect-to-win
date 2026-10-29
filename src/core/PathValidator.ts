import { BoardManager } from './BoardManager';
import { LevelData, Point, dirFromDelta, DIR_OPPOSITE, countDirs } from './types';
import { Tile } from './Tile';

export interface LevelValidationResult {
  ok: boolean;
  errors: string[];
  /** 参考解所需旋转次数（上界，等于逐格转回解状态的总次数） */
  solutionCost: number;
  /** 解路径长度（含起终点） */
  pathLength: number;
}

/**
 * PathValidator：连通性与通关判定。
 * 判定完全基于“相邻且双向开口匹配”的真实连接关系，与点击次数、动画状态无关。
 */
export class PathValidator {
  /** 从起点出发，广度优先搜索到终点的最短连通路径；不可达返回 null */
  static findPath(board: BoardManager): Point[] | null {
    const start = board.startTile;
    const goal = board.goalTile;
    if (!start || !goal) return null;

    const key = (t: Tile) => `${t.x},${t.y}`;
    const prev = new Map<string, string | null>();
    const queue: Tile[] = [start];
    prev.set(key(start), null);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.x === goal.x && cur.y === goal.y) {
        // 回溯
        const path: Point[] = [];
        let k: string | null = key(cur);
        while (k) {
          const [x, y] = k.split(',').map(Number);
          path.push({ x, y });
          k = prev.get(k) ?? null;
        }
        return path.reverse();
      }
      for (const nb of board.connectedNeighbors(cur)) {
        const nk = key(nb);
        if (!prev.has(nk)) {
          prev.set(nk, key(cur));
          queue.push(nb);
        }
      }
    }
    return null;
  }

  /**
   * 从起点出发、电流实际能流到的最远路径（不通关时用于表现「电流到此为止」）。
   * 返回从起点到最远可达格子的路径；起点无可达邻居时返回 null。
   */
  static longestReachablePath(board: BoardManager): Point[] | null {
    const start = board.startTile;
    if (!start) return null;
    const key = (t: Tile) => `${t.x},${t.y}`;
    const prev = new Map<string, string | null>();
    const depth = new Map<string, number>();
    const queue: Tile[] = [start];
    prev.set(key(start), null);
    depth.set(key(start), 0);
    let farthest: Tile = start;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if ((depth.get(key(cur)) ?? 0) > (depth.get(key(farthest)) ?? 0)) farthest = cur;
      for (const nb of board.connectedNeighbors(cur)) {
        const nk = key(nb);
        if (!prev.has(nk)) {
          prev.set(nk, key(cur));
          depth.set(nk, (depth.get(key(cur)) ?? 0) + 1);
          queue.push(nb);
        }
      }
    }

    if (farthest === start) return null;
    const path: Point[] = [];
    let k: string | null = key(farthest);
    while (k) {
      const [x, y] = k.split(',').map(Number);
      path.push({ x, y });
      k = prev.get(k) ?? null;
    }
    return path.reverse();
  }

  /** 起点与终点是否连通（即通关） */
  static isSolved(board: BoardManager): boolean {
    return PathValidator.findPath(board) !== null;
  }

  /** 从起点出发能到达的所有格子（用于“通电”高亮） */
  static reachableFromStart(board: BoardManager): Set<string> {
    const result = new Set<string>();
    const start = board.startTile;
    if (!start) return result;
    const queue: Tile[] = [start];
    result.add(`${start.x},${start.y}`);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of board.connectedNeighbors(cur)) {
        const k = `${nb.x},${nb.y}`;
        if (!result.has(k)) {
          result.add(k);
          queue.push(nb);
        }
      }
    }
    return result;
  }

  /**
   * 参考解所需旋转次数：解路径上每个可旋转方块转回解状态所需的顺时针次数之和。
   * 这是“目标步数”的计算依据，保证关卡一定能在该步数内完成。
   */
  static solutionCost(level: LevelData): number {
    const board = new BoardManager(level);
    let cost = 0;
    for (const p of level.solutionPath) {
      const t = board.tileAt(p.x, p.y);
      if (t && t.rotatable) cost += t.turnsToSolution;
    }
    return cost;
  }

  /**
   * 关卡合法性校验（离线程序与测试共用）。
   * 检查：结构、起终点、解路径、解路径方向匹配、步数上限、初始未通关、应用参考解后确实通关。
   */
  static validateLevel(level: LevelData): LevelValidationResult {
    const errors: string[] = [];
    const { width, height, cells, start, goal } = level;

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) {
      errors.push(`尺寸非法: ${width}x${height}`);
    }
    if (!Array.isArray(cells) || cells.length !== width * height) {
      errors.push(`cells 长度 ${cells?.length} != ${width * height}`);
      return { ok: false, errors, solutionCost: 0, pathLength: 0 };
    }
    if (!Number.isInteger(level.stepLimit) || level.stepLimit < 1) {
      errors.push(`stepLimit 非法: ${level.stepLimit}`);
    }

    // 格子数据合法性
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = cells[y * width + x];
        if (!c) continue;
        if (c.d < 1 || c.d > 15) errors.push(`(${x},${y}) 方向掩码非法: ${c.d}`);
        if (countDirs(c.d) === 0) errors.push(`(${x},${y}) 没有开口`);
        if (!Number.isInteger(c.r) || c.r < 0 || c.r > 3) errors.push(`(${x},${y}) 旋转偏移非法: ${c.r}`);
      }
    }

    const inBounds = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
    if (!inBounds(start)) errors.push('起点越界');
    if (!inBounds(goal)) errors.push('终点越界');
    if (start.x === goal.x && start.y === goal.y) errors.push('起点与终点重合');
    if (!errors.length) {
      const sc = cells[start.y * width + start.x];
      const gc = cells[goal.y * width + goal.x];
      if (!sc) errors.push('起点格为空');
      else {
        if (countDirs(sc.d) !== 1) errors.push('起点必须只有一个开口');
        if (sc.rot) errors.push('起点不应可旋转');
        if (!(sc.d & start.dir)) errors.push('起点开口方向与 start.dir 不一致');
      }
      if (!gc) errors.push('终点格为空');
      else {
        if (countDirs(gc.d) !== 1) errors.push('终点必须只有一个开口');
        if (gc.rot) errors.push('终点不应可旋转');
        if (!(gc.d & goal.dir)) errors.push('终点开口方向与 goal.dir 不一致');
      }
    }

    // 参考解路径
    const path = level.solutionPath ?? [];
    if (path.length < 2) errors.push('参考解路径过短');
    if (path.length >= 2) {
      const first = path[0];
      const last = path[path.length - 1];
      if (first.x !== start.x || first.y !== start.y) errors.push('参考解未从起点开始');
      if (last.x !== goal.x || last.y !== goal.y) errors.push('参考解未到达终点');

      const seen = new Set<string>();
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!inBounds(p)) {
          errors.push(`参考解路径越界: (${p.x},${p.y})`);
          continue;
        }
        const k = `${p.x},${p.y}`;
        if (seen.has(k)) errors.push(`参考解路径重复经过 (${p.x},${p.y})`);
        seen.add(k);
        const cell = cells[p.y * width + p.x];
        if (!cell) {
          errors.push(`参考解经过空格 (${p.x},${p.y})`);
          continue;
        }
        const need: number[] = [];
        if (i > 0) {
          const d = dirFromDelta(path[i - 1].x - p.x, path[i - 1].y - p.y);
          if (d === 0) errors.push(`参考解第 ${i} 步不相邻`);
          else need.push(d);
        }
        if (i < path.length - 1) {
          const d = dirFromDelta(path[i + 1].x - p.x, path[i + 1].y - p.y);
          if (d === 0) errors.push(`参考解第 ${i} 步不相邻`);
          else need.push(d);
        }
        for (const d of need) {
          if (!(cell.d & d)) errors.push(`参考解在 (${p.x},${p.y}) 需要开口 ${d}，但方块只有 ${cell.d}`);
        }
      }
    }

    const board = new BoardManager(level);

    // 初始状态不应已通关
    if (PathValidator.isSolved(board)) errors.push('初始状态已通关（关卡无效）');

    // 应用参考解后必须真的通关（这是“存在合法解”的实证）
    const cost = PathValidator.solutionCost(level);
    board.applySolution();
    if (!PathValidator.isSolved(board)) errors.push('应用参考解后仍未通关');
    if (cost < 1) errors.push('参考解所需步数为 0（初始即解，关卡无意义）');
    // 步数上限必须容得下最优解；最优解由 OptimalSolver 在构建期写入 minSteps
    if (level.minSteps !== undefined && Number.isInteger(level.stepLimit) && level.minSteps > level.stepLimit) {
      errors.push(`最优解需要 ${level.minSteps} 步，超过步数上限 ${level.stepLimit}`);
    }

    // 起终点必须能在参考解中首尾相连（起点开口指向第二格）
    if (path.length >= 2) {
      const d = dirFromDelta(path[1].x - start.x, path[1].y - start.y);
      if (d !== 0 && d !== start.dir) errors.push('起点开口与参考解第一步方向不一致');
      const d2 = dirFromDelta(path[path.length - 2].x - goal.x, path[path.length - 2].y - goal.y);
      if (d2 !== 0 && d2 !== goal.dir) errors.push('终点开口与参考解最后一步方向不一致');
    }

    return { ok: errors.length === 0, errors, solutionCost: cost, pathLength: path.length };
  }

  /** 相邻两格方向匹配的独立检查（测试与工具使用） */
  static tilesConnect(a: Tile, b: Tile): boolean {
    const dirAB = dirFromDelta(b.x - a.x, b.y - a.y);
    if (dirAB === 0) return false;
    return a.opensTo(dirAB) && b.opensTo(DIR_OPPOSITE[dirAB]);
  }
}
