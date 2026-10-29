import type { GameManager } from '../core/GameManager';
import type { LevelData } from '../core/types';
import type { SaveData } from '../core/SaveManager';

export type Screen = 'home' | 'levels' | 'game' | 'settings';
export type Modal = null | 'pause' | 'win' | 'lose' | 'confirm-clear' | 'about';

export type Action =
  | { type: 'home' }
  | { type: 'back' }
  | { type: 'openLevels' }
  | { type: 'openSettings' }
  | { type: 'openDaily' }
  | { type: 'selectLevel'; id: number }
  | { type: 'cell'; x: number; y: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'retry' }
  | { type: 'hint' }
  | { type: 'next' }
  | { type: 'replay' }
  | { type: 'toggleSound' }
  | { type: 'clearProgress' }
  | { type: 'confirmClear' }
  | { type: 'closeModal' }
  | { type: 'about' }
  | { type: 'share' }
  | { type: 'extraStepsAd' }
  | { type: 'noop' };

export type ElementKind = 'button' | 'text' | 'panel' | 'cell' | 'levelNode' | 'icon';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UIElement {
  id: string;
  kind: ElementKind;
  rect: Rect;
  label?: string;
  sub?: string;
  action?: Action;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger' | 'plain';
  /** levelNode 用：1..5 星难度 */
  value?: number;
  /** levelNode 用：是否锁定/是否通关 */
  locked?: boolean;
  cleared?: boolean;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: 'center' | 'left';
  /** 绘制/命中层级：弹窗打开时只有 modal 层可点击 */
  layer?: 'base' | 'modal';
}

export interface WinSummary {
  levelId: number;
  steps: number;
  limit: number;
  best: number | null;
  newBest: boolean;
  unlockedNext: boolean;
  hasNext: boolean;
  daily: boolean;
}

export interface ViewState {
  screen: Screen;
  modal: Modal;
  level: LevelData | null;
  game: GameManager | null;
  save: SaveData;
  levelCount: number;
  dailyKey: string;
  adAvailable: boolean;
  toast: string | null;
  win: WinSummary | null;
  dailyDone: boolean;
  dailyMode: boolean;
  /** 提示高亮的格子集合（"x,y"） */
  hintTiles: Set<string>;
  now: number;
}

/** 渲染层特效事件（由 AppController 产生，Renderer 消费） */
export interface RenderEffect {
  type: 'rotate' | 'win' | 'lose' | 'hint';
  x?: number;
  y?: number;
  time: number;
}

export interface LayoutResult {
  elements: UIElement[];
  board: Rect | null;
}
