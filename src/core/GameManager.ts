import { BoardManager } from './BoardManager';
import { PathValidator } from './PathValidator';
import type { GameStatus, LevelData } from './types';

export type GameEventType = 'rotate' | 'win' | 'lose' | 'reset' | 'blocked' | 'undo';
export interface GameEvent {
  type: GameEventType;
  x?: number;
  y?: number;
  moves?: number;
}

/** 一步操作的回退信息 */
export interface UndoEntry {
  x: number;
  y: number;
  prevRotation: number;
  prevSwitchOn: boolean;
  wasSwitch: boolean;
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
  /** 每关可撤销次数上限 */
  static readonly MAX_UNDO = 3;
  private _undosLeft = GameManager.MAX_UNDO;
  private _history: UndoEntry[] = [];
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

  /**
   * 点击格子：
   * - 普通方块 -> 旋转 90°（dir = 1 顺时针 / -1 逆时针）
   * - 闸刀开关 -> 切换开/关（同样消耗 1 步）
   * 两种情况都结算步数与胜负。
   */
  rotate(x: number, y: number, dir: 1 | -1 = 1): RotateResult {
    if (this.isOver) {
      return { ok: false, changed: false, won: this._status === 'won', lost: this._status === 'lost', reason: 'game-over' };
    }
    const tile = this.board.tileAt(x, y);
    if (!tile) {
      this.emit({ type: 'blocked', x, y });
      return { ok: false, changed: false, won: false, lost: false, reason: 'empty' };
    }

    // 先记录回退信息，再修改
    const entry: UndoEntry = {
      x,
      y,
      prevRotation: tile.rotation,
      prevSwitchOn: tile.switchOn,
      wasSwitch: tile.kind === 'switch',
    };

    if (tile.kind === 'switch') {
      this.board.toggleAt(x, y);
    } else {
      const outcome = this.board.rotateAt(x, y, dir);
      if (!outcome.ok) {
        this.emit({ type: 'blocked', x, y });
        return { ok: false, changed: false, won: false, lost: false, reason: outcome.reason };
      }
    }

    this._history.push(entry);
    if (this._history.length > 128) this._history.shift();

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
    this._history = [];
    this._undosLeft = GameManager.MAX_UNDO;
    this.emit({ type: 'reset' });
  }

  get undosLeft(): number {
    return this._undosLeft;
  }

  get canUndo(): boolean {
    return this._status === 'playing' && this._undosLeft > 0 && this._history.length > 0;
  }

  /**
   * 撤销上一步：回退方块状态并返还 1 步。
   * 每关最多 MAX_UNDO 次，避免「无限试错」让三星失去意义。
   */
  undo(): boolean {
    if (!this.canUndo) return false;
    const entry = this._history.pop();
    if (!entry) return false;
    const tile = this.board.tileAt(entry.x, entry.y);
    if (!tile) return false;

    if (entry.wasSwitch) tile.switchOn = entry.prevSwitchOn;
    else tile.rotation = entry.prevRotation;

    this._moves = Math.max(0, this._moves - 1);
    this._undosLeft -= 1;
    this._status = 'playing';
    this.emit({ type: 'undo', x: entry.x, y: entry.y, moves: this._moves });
    return true;
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
