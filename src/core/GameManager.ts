import { BoardManager } from './BoardManager';
import { PathValidator } from './PathValidator';
import type { GameStatus, LevelData } from './types';

export type GameEventType = 'rotate' | 'win' | 'lose' | 'reset' | 'blocked';
export interface GameEvent {
  type: GameEventType;
  x?: number;
  y?: number;
  moves?: number;
}

export interface RotateResult {
  ok: boolean;
  changed: boolean;
  won: boolean;
  lost: boolean;
  reason?: 'out-of-bounds' | 'empty' | 'fixed' | 'game-over';
}

/**
 * GameManager：单局游戏状态与生命周期。
 * 所有胜负判定都来自 PathValidator 的真实连通性检查，与动画/点击次数无关。
 */
export class GameManager {
  readonly level: LevelData;
  readonly board: BoardManager;
  private _moves = 0;
  private _status: GameStatus = 'playing';
  private _hintsUsed = 0;
  private _extraSteps = 0;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(level: LevelData) {
    this.level = level;
    this.board = new BoardManager(level);
    this._status = 'playing';
  }

  get moves(): number {
    return this._moves;
  }

  get stepLimit(): number {
    return this.level.stepLimit + this._extraSteps;
  }

  /** 通过激励视频等途径获得的额外步数（不改变关卡数据） */
  grantExtraSteps(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this._extraSteps += Math.floor(n);
    if (this._status === 'lost' && this._moves < this.stepLimit) {
      this._status = 'playing';
    }
  }

  get movesLeft(): number {
    return Math.max(0, this.stepLimit - this._moves);
  }

  get status(): GameStatus {
    return this._status;
  }

  get isOver(): boolean {
    return this._status === 'won' || this._status === 'lost';
  }

  get hintsUsed(): number {
    return this._hintsUsed;
  }

  get solved(): boolean {
    return PathValidator.isSolved(this.board);
  }

  onEvent(cb: (e: GameEvent) => void): void {
    this.listeners.push(cb);
  }

  private emit(e: GameEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  /** 点击格子：旋转 90° 并结算步数/胜负 */
  rotate(x: number, y: number): RotateResult {
    if (this.isOver) {
      return { ok: false, changed: false, won: this._status === 'won', lost: this._status === 'lost', reason: 'game-over' };
    }
    const outcome = this.board.rotateAt(x, y);
    if (!outcome.ok) {
      this.emit({ type: 'blocked', x, y });
      return { ok: false, changed: false, won: false, lost: false, reason: outcome.reason };
    }

    this._moves += 1;
    this.emit({ type: 'rotate', x, y, moves: this._moves });

    // 先判胜利：最后一步刚好接通也算赢
    if (PathValidator.isSolved(this.board)) {
      this._status = 'won';
      this.emit({ type: 'win', moves: this._moves });
      return { ok: true, changed: true, won: true, lost: false };
    }
    if (this._moves >= this.stepLimit) {
      this._status = 'lost';
      this.emit({ type: 'lose', moves: this._moves });
      return { ok: true, changed: true, won: false, lost: true };
    }
    return { ok: true, changed: true, won: false, lost: false };
  }

  /** 重试：棋盘、步数、状态完全重置 */
  retry(): void {
    this.board.reset();
    this._moves = 0;
    this._status = 'playing';
    this.emit({ type: 'reset' });
  }

  /** 使用一次提示（免费，不依赖广告） */
  useHint(): boolean {
    if (this.isOver) return false;
    this._hintsUsed += 1;
    return true;
  }

  /** 提示：返回下一个仍需要旋转的解路径方块（没有则返回 null） */
  nextHintTile(): { x: number; y: number } | null {
    for (const p of this.level.solutionPath) {
      const t = this.board.tileAt(p.x, p.y);
      if (t && t.rotatable && t.turnsToSolution !== 0) return { x: p.x, y: p.y };
    }
    return null;
  }
}
