import { LevelData, Point, TileKind, DIR_OPPOSITE, dirFromDelta } from './types';
import { Tile } from './Tile';

export interface RotateOutcome {
  ok: boolean;
  tile: Tile | null;
  reason?: 'empty' | 'fixed' | 'out-of-bounds';
}

/**
 * BoardManager：网格与方块状态。
 * 负责创建棋盘、查询邻接关系、旋转方块、快照/恢复。
 * 不判断胜负（交给 PathValidator / GameManager）。
 */
export class BoardManager {
  readonly width: number;
  readonly height: number;
  readonly level: LevelData;
  private tiles: (Tile | null)[];

  constructor(level: LevelData) {
    this.level = level;
    this.width = level.width;
    this.height = level.height;
    this.tiles = [];
    this.build();
  }

  private build(): void {
    const { width, height, cells, start, goal } = this.level;
    this.tiles = new Array(width * height).fill(null);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = cells[y * width + x];
        if (!cell) continue;
        let kind: TileKind = cell.k ?? 'pipe';
        if (x === start.x && y === start.y) kind = 'start';
        if (x === goal.x && y === goal.y) kind = 'goal';
        this.tiles[y * width + x] = new Tile(x, y, cell.d, cell.r, cell.rot, kind);
      }
    }
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[this.index(x, y)];
  }

  get allTiles(): Tile[] {
    return this.tiles.filter((t): t is Tile => t !== null);
  }

  get rotatableCount(): number {
    return this.allTiles.filter((t) => t.rotatable).length;
  }

  /** 旋转指定格子，返回结果（不改变步数，由 GameManager 统计） */
  rotateAt(x: number, y: number): RotateOutcome {
    if (!this.inBounds(x, y)) return { ok: false, tile: null, reason: 'out-of-bounds' };
    const tile = this.tileAt(x, y);
    if (!tile) return { ok: false, tile: null, reason: 'empty' };
    if (!tile.rotatable) return { ok: false, tile, reason: 'fixed' };
    tile.rotateCW();
    return { ok: true, tile };
  }

  /**
   * 两个相邻格子是否互相连通：
   * 必须相邻（上下左右），且 A 朝 B 开口、B 朝 A 开口，缺一不可。
   */
  areAdjacentConnected(a: Tile | null, b: Tile | null): boolean {
    if (!a || !b) return false;
    const dirAB = dirFromDelta(b.x - a.x, b.y - a.y);
    if (dirAB === 0) return false;
    const dirBA = DIR_OPPOSITE[dirAB];
    return a.opensTo(dirAB) && b.opensTo(dirBA);
  }

  /** 返回与指定格子互相连通的相邻格子 */
  connectedNeighbors(tile: Tile): Tile[] {
    const result: Tile[] = [];
    const deltas: Point[] = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    for (const d of deltas) {
      const other = this.tileAt(tile.x + d.x, tile.y + d.y);
      if (other && this.areAdjacentConnected(tile, other)) result.push(other);
    }
    return result;
  }

  get startTile(): Tile {
    return this.tileAt(this.level.start.x, this.level.start.y)!;
  }

  get goalTile(): Tile {
    return this.tileAt(this.level.goal.x, this.level.goal.y)!;
  }

  /** 当前所有格子的旋转偏移（快照） */
  snapshot(): number[] {
    return this.tiles.map((t) => (t ? t.rotation : -1));
  }

  restore(snapshot: number[]): void {
    if (snapshot.length !== this.tiles.length) return;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t && snapshot[i] >= 0) t.rotation = snapshot[i];
    }
  }

  /** 恢复到关卡初始状态 */
  reset(): void {
    for (const t of this.allTiles) {
      const cell = this.level.cells[this.index(t.x, t.y)];
      if (cell) t.rotation = cell.r;
    }
  }

  /** 将参考解应用到棋盘（用于校验与提示），只改解路径上的方块 */
  applySolution(): void {
    for (const p of this.level.solutionPath) {
      const t = this.tileAt(p.x, p.y);
      if (t) t.rotation = 0;
    }
  }
}
