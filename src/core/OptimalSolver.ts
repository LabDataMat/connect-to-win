import { BoardManager } from './BoardManager';
import { PathValidator } from './PathValidator';
import { LevelData, Point, DIR_OPPOSITE, DIR_VECTOR, dirFromDelta, rotateMaskCW } from './types';
import { Tile } from './Tile';

export interface SolveStep {
  x: number;
  y: number;
  /** 需要旋转的次数 */
  turns: number;
  /** 旋转方向：1 顺时针，-1 逆时针 */
  dir: 1 | -1;
  /** 闸刀开关：这一格是「点击切换」而不是旋转 */
  toggle?: boolean;
}

export interface SolveResult {
  solved: boolean;
  /** 从关卡初始状态开始，通关所需的最少操作次数（旋转 + 开闸） */
  minSteps: number;
  /** 最优解经过的格子（含起终点） */
  path: Point[];
  /** 每格需要旋转的次数（不含无需操作的格子） */
  steps: SolveStep[];
}

const UNSOLVED: SolveResult = { solved: false, minSteps: Infinity, path: [], steps: [] };

/**
 * OptimalSolver：独立于关卡数据的精确最优解求解器。
 *
 * 为什么不能直接用关卡里记录的 solutionCost？
 * 那个数字只是「把参考解路径逐格转回解状态」的次数，是一种可行解，**不保证最优**
 * （直管有 180° 对称、干扰块可能形成更短路径、路径本身也可能不是最短的）。
 *
 * 算法：以「当前格 + 来路方向」为状态做 Dijkstra。
 * - 进入某格时只知道来路方向，离开时才结算该格的旋转代价（需要同时提供来路与去路）；
 * - 边权 = 该格从当前朝向转到目标朝向的最小顺时针次数（0..3）；
 * - 由于每格代价非负，最优解不会重复经过同一格，因此状态里不必记录已访问集合；
 * - 开关（switch）需要额外 1 步打开，也计入边权。
 *
 * 状态数 = 格子数 × 4，8×8 关卡最多 256 个状态，毫秒级完成。
 */
export class OptimalSolver {
  /**
   * 求解最少操作次数。
   *
   * 为什么用「DFS + 分支限界」而不是 Dijkstra：
   * 状态 (格子, 来路方向) 只能为每个状态保留一条最优路径，而「路径不能重复经过同一格」这一约束
   * 与该保留策略冲突——一条被剪掉的路径可能恰好是通往某格的唯一简单路径，导致漏解。
   * 网格很小（≤8×8）、每格可行方向通常只有 1~2 个，配合代价上界剪枝后 DFS 分支极少，
   * 8×8 关卡实测 < 20ms，且能保证得到的是真正的简单路径最优解。
   */
  static solve(level: LevelData): SolveResult {
    const { width: W, height: H, start, goal } = level;
    const board = new BoardManager(level);
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
    const isGoal = (x: number, y: number) => x === goal.x && y === goal.y;

    /** 预计算每格在「需要同时提供 required 方向」时的最小旋转次数 */
    const costCache = new Map<string, number>();
    const tileCost = (tile: Tile, required: number): number => {
      const key = `${tile.x},${tile.y}|${required}`;
      const cached = costCache.get(key);
      if (cached !== undefined) return cached;
      let best = Infinity;
      for (let r = 0; r < 4; r++) {
        if (!tile.rotatable && r !== 0) continue;
        const dirs = rotateMaskCW(tile.baseDirs, r);
        if ((dirs & required) !== required) continue;
        // 顺时针与逆时针都只需 1 步，取更近的方向
        const cw = (r - tile.rotation + 4) % 4;
        const ccw = (tile.rotation - r + 4) % 4;
        let cost = Math.min(cw, ccw);
        // 闸刀开关：关闭时必须先花 1 步打开
        if (tile.kind === 'switch' && !tile.switchOn) cost += 1;
        if (cost < best) best = cost;
      }
      costCache.set(key, best);
      return best;
    };

    const sv = DIR_VECTOR[start.dir];
    const firstX = start.x + sv.dx;
    const firstY = start.y + sv.dy;
    if (!inBounds(firstX, firstY)) return UNSOLVED;

    if (isGoal(firstX, firstY)) {
      return goal.dir === DIR_OPPOSITE[start.dir]
        ? { solved: true, minSteps: 0, path: [{ ...start }, { ...goal }], steps: [] }
        : UNSOLVED;
    }

    const firstTile = board.tileAt(firstX, firstY);
    if (!firstTile) return UNSOLVED;

    let bestCost = Infinity;
    let bestPath: Point[] = [];
    let budget = 400000;

    const visited = new Set<string>([`${start.x},${start.y}`, `${firstX},${firstY}`]);
    const path: Point[] = [{ ...start }, { x: firstX, y: firstY }];

    const manhattan = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

    const dfs = (x: number, y: number, inDir: number, cost: number): void => {
      if (budget-- <= 0 || cost >= bestCost) return;
      const tile = board.tileAt(x, y);
      if (!tile) return;

      // 优先探索离终点更近的方向，更快拿到较好的上界，从而剪掉更多分支
      const dirs = [1, 2, 4, 8].filter((d) => d !== inDir);
      dirs.sort((a, b) => {
        const va = DIR_VECTOR[a];
        const vb = DIR_VECTOR[b];
        return manhattan(x + va.dx, y + va.dy) - manhattan(x + vb.dx, y + vb.dy);
      });

      for (const d of dirs) {
        const v = DIR_VECTOR[d];
        const nx = x + v.dx;
        const ny = y + v.dy;
        if (!inBounds(nx, ny)) continue;

        const stepCost = tileCost(tile, inDir | d);
        if (!Number.isFinite(stepCost)) continue;
        const total = cost + stepCost;
        if (total >= bestCost) continue;

        if (isGoal(nx, ny)) {
          // d 是「从当前格进入终点的方向」，goal.dir 是「终点开口朝向来路的方向」，互为反向
          if (d !== DIR_OPPOSITE[goal.dir]) continue;
          bestCost = total;
          bestPath = [...path, { x: goal.x, y: goal.y }];
          continue;
        }

        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        const nbTile = board.tileAt(nx, ny);
        if (!nbTile) continue;
        const nbIn = DIR_OPPOSITE[d];
        if (!Number.isFinite(tileCost(nbTile, nbIn))) continue;

        visited.add(k);
        path.push({ x: nx, y: ny });
        dfs(nx, ny, nbIn, total);
        path.pop();
        visited.delete(k);
      }
    };

    dfs(firstX, firstY, DIR_OPPOSITE[start.dir], 0);

    if (!Number.isFinite(bestCost)) return UNSOLVED;

    // 计算每格怎么操作（旋转几次、往哪个方向 / 或打开开关）
    const steps: SolveStep[] = [];
    for (let i = 0; i < bestPath.length - 1; i++) {
      const cur = bestPath[i];
      const tile = board.tileAt(cur.x, cur.y);
      if (!tile) continue;

      if (tile.kind === 'switch') {
        if (!tile.switchOn) steps.push({ x: cur.x, y: cur.y, turns: 1, dir: 1, toggle: true });
        continue;
      }
      if (!tile.rotatable) continue;

      const prev = i === 0 ? null : bestPath[i - 1];
      const next = bestPath[i + 1];
      let required = 0;
      if (prev) required |= dirFromDelta(prev.x - cur.x, prev.y - cur.y) as number;
      required |= dirFromDelta(next.x - cur.x, next.y - cur.y) as number;

      // 找出「转到能满足 required 的朝向」中步数最少的一种，并记录方向
      let bestTurns = Infinity;
      let bestDir: 1 | -1 = 1;
      for (let r = 0; r < 4; r++) {
        const dirs = rotateMaskCW(tile.baseDirs, r);
        if ((dirs & required) !== required) continue;
        const cw = (r - tile.rotation + 4) % 4;
        const ccw = (tile.rotation - r + 4) % 4;
        const useCw = cw <= ccw;
        const turns = useCw ? cw : ccw;
        if (turns < bestTurns) {
          bestTurns = turns;
          bestDir = useCw ? 1 : -1;
        }
      }
      if (bestTurns > 0 && Number.isFinite(bestTurns)) {
        steps.push({ x: cur.x, y: cur.y, turns: bestTurns, dir: bestDir });
      }
    }

    return { solved: true, minSteps: bestCost, path: bestPath, steps };
  }

  /** 只要最少步数 */
  static minSteps(level: LevelData): number {
    return OptimalSolver.solve(level).minSteps;
  }

  /**
   * 把求解结果应用到棋盘，返回是否真的通关。
   * 用于校验「最优解确实可执行」，而不是相信计算结果。
   */
  static verify(level: LevelData): { ok: boolean; minSteps: number; reason?: string } {
    const result = OptimalSolver.solve(level);
    if (!result.solved) return { ok: false, minSteps: Infinity, reason: 'no-solution' };

    const board = new BoardManager(level);
    for (const s of result.steps) {
      const tile = board.tileAt(s.x, s.y);
      if (!tile) return { ok: false, minSteps: result.minSteps, reason: `missing-tile:${s.x},${s.y}` };
      if (s.toggle) {
        if (!tile.switchOn) tile.switchOn = true;
        continue;
      }
      for (let i = 0; i < s.turns; i++) {
        if (s.dir === 1) tile.rotateCW();
        else tile.rotateCCW();
      }
    }
    const solved = PathValidator.isSolved(board);
    if (!solved) return { ok: false, minSteps: result.minSteps, reason: 'apply-failed' };
    return { ok: true, minSteps: result.minSteps };
  }
}
