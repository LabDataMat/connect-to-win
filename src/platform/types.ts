import type { StorageLike } from '../core/types';
import type { AudioContextLike } from '../core/AudioManager';
import type { AdsAdapter } from './ads';

export interface ScreenInfo {
  /** CSS 像素宽高 */
  width: number;
  height: number;
  dpr: number;
  /** 安全区上边距（CSS 像素） */
  safeTop: number;
  /** 安全区下边距（CSS 像素） */
  safeBottom: number;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

export interface PointerInput {
  x: number;
  y: number;
}

/**
 * 平台适配层：渲染器与游戏逻辑只依赖此接口，
 * Web 与微信小游戏各自实现，业务代码零改动。
 */
export interface Platform {
  readonly name: 'web' | 'wechat';
  readonly canvas: CanvasLike;
  readonly ctx: CanvasRenderingContext2D;
  readonly storage: StorageLike | null;
  readonly ads: AdsAdapter;
  readonly audio: AudioContextLike | null;
  screen(): ScreenInfo;
  now(): number;
  requestFrame(cb: () => void): void;
  onPointer(cb: (p: PointerInput) => void): void;
  onVisibility(cb: (visible: boolean) => void): void;
  vibrate(kind?: 'light' | 'medium'): void;
  share(opts: { title: string; imageUrl?: string }): void;
  log(msg: string): void;
}
