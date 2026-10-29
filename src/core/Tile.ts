import { DirMask, TileKind, Point, rotateMaskCW, dirFromDelta, Dir } from './types';

/**
 * Tile：单个电路方块。
 * 只负责“自身方向 + 旋转”的纯逻辑，不涉及渲染与输入。
 */
export class Tile {
  readonly x: number;
  readonly y: number;
  /** 解状态下的方向（不可变基准） */
  readonly baseDirs: DirMask;
  readonly rotatable: boolean;
  readonly kind: TileKind;
  /** 当前旋转偏移 0..3，顺时针次数 */
  private _rotation: number;

  constructor(x: number, y: number, baseDirs: DirMask, rotation: number, rotatable: boolean, kind: TileKind) {
    this.x = x;
    this.y = y;
    this.baseDirs = baseDirs;
    this._rotation = ((rotation % 4) + 4) % 4;
    this.rotatable = rotatable;
    this.kind = kind;
  }

  get rotation(): number {
    return this._rotation;
  }

  set rotation(v: number) {
    this._rotation = ((v % 4) + 4) % 4;
  }

  /** 当前实际开口方向 */
  get dirs(): DirMask {
    return rotateMaskCW(this.baseDirs, this._rotation);
  }

  get point(): Point {
    return { x: this.x, y: this.y };
  }

  /** 顺时针旋转 90°，不可旋转的方块返回 false */
  rotateCW(): boolean {
    if (!this.rotatable) return false;
    this._rotation = (this._rotation + 1) % 4;
    return true;
  }

  /** 回到解状态需要顺时针旋转的次数（0..3） */
  get turnsToSolution(): number {
    return (4 - this._rotation) % 4;
  }

  /** 是否朝向指定方向开口 */
  opensTo(dir: Dir): boolean {
    return (this.dirs & dir) !== 0;
  }

  /** 是否朝向另一个方块开口（只看自身） */
  opensToward(other: Tile): boolean {
    const dir = dirFromDelta(other.x - this.x, other.y - this.y);
    return dir !== 0 && this.opensTo(dir);
  }

  clone(): Tile {
    return new Tile(this.x, this.y, this.baseDirs, this._rotation, this.rotatable, this.kind);
  }
}
