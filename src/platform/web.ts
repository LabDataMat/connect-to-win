import type { StorageLike } from '../core/types';
import type { AudioContextLike } from '../core/AudioManager';
import type { CanvasLike, Platform, PointerInput, ScreenInfo } from './types';
import { DevAdsAdapter } from './ads';

function safeLocalStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const probe = '__ctw_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
    };
  } catch {
    return null;
  }
}

/**
 * 浏览器平台实现：用于本地开发、自动化截图与人工验收。
 * 与微信实现保持相同的输入/存储/生命周期语义。
 */
export class WebPlatform implements Platform {
  readonly name = 'web' as const;
  readonly canvas: CanvasLike;
  readonly ctx: CanvasRenderingContext2D;
  readonly storage: StorageLike | null;
  readonly ads = new DevAdsAdapter((m) => console.info(m));
  readonly audio: AudioContextLike | null;
  private info: ScreenInfo;
  private visibilityCbs: ((v: boolean) => void)[] = [];

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvas = canvasEl;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.storage = safeLocalStorage();
    this.info = this.measure();
    this.resize();

    let audio: AudioContextLike | null = null;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audio = new Ctor() as unknown as AudioContextLike;
    } catch {
      audio = null;
    }
    this.audio = audio;

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      for (const cb of this.visibilityCbs) cb(visible);
    });
  }

  private measure(): ScreenInfo {
    const width = Math.max(320, window.innerWidth);
    const height = Math.max(480, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    return { width, height, dpr, safeTop: 0, safeBottom: 0 };
  }

  private resize(): void {
    this.info = this.measure();
    this.canvas.width = Math.round(this.info.width * this.info.dpr);
    this.canvas.height = Math.round(this.info.height * this.info.dpr);
    const el = this.canvas as unknown as HTMLCanvasElement;
    if (el.style) {
      el.style.width = `${this.info.width}px`;
      el.style.height = `${this.info.height}px`;
    }
  }

  screen(): ScreenInfo {
    return this.info;
  }

  now(): number {
    return performance.now();
  }

  requestFrame(cb: () => void): void {
    requestAnimationFrame(() => cb());
  }

  onPointer(cb: (p: PointerInput) => void): void {
    const el = this.canvas as unknown as HTMLCanvasElement;
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      cb({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    });
  }

  onVisibility(cb: (visible: boolean) => void): void {
    this.visibilityCbs.push(cb);
  }

  vibrate(kind: 'light' | 'medium' = 'light'): void {
    try {
      navigator.vibrate?.(kind === 'light' ? 8 : 20);
    } catch {
      /* ignore */
    }
  }

  share(opts: { title: string; imageUrl?: string }): void {
    console.info('[share:web]', opts.title);
  }

  createOffscreenCanvas(width: number, height: number): CanvasLike | null {
    try {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    } catch {
      return null;
    }
  }

  /** Web 端：导出 PNG 并触发下载，同时在新标签页预览 */
  shareCanvasImage(canvas: CanvasLike, _width: number, _height: number, fileName: string): boolean {
    try {
      const el = canvas as unknown as HTMLCanvasElement;
      const dataUrl = el.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.lastSharedImage = dataUrl;
      return true;
    } catch {
      return false;
    }
  }

  /** 最近一次导出的图片（dataURL），便于调试与自动化验证 */
  lastSharedImage: string | null = null;

  log(msg: string): void {
    console.info(msg);
  }
}
