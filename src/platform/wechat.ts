import type { StorageLike } from '../core/types';
import type { AudioContextLike } from '../core/AudioManager';
import type { CanvasLike, Platform, PointerInput, ScreenInfo } from './types';
import { WeChatAdsAdapter } from './ads';

/**
 * WeChatAdapter：微信小游戏平台适配层。
 * 负责：主画布创建与尺寸、安全区、触摸事件、本地存储、前后台生命周期、
 * 分享、震动、WebAudio，以及广告能力注入。
 * 不包含任何游戏规则逻辑。
 */
export class WeChatPlatform implements Platform {
  readonly name = 'wechat' as const;
  readonly canvas: CanvasLike;
  readonly ctx: CanvasRenderingContext2D;
  readonly storage: StorageLike | null;
  readonly ads: WeChatAdsAdapter;
  readonly audio: AudioContextLike | null;
  private info: ScreenInfo;

  constructor() {
    const canvas = wx.createCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.canvas = canvas as CanvasLike;
    this.ctx = ctx as CanvasRenderingContext2D;
    this.info = WeChatPlatform.readScreen();
    this.applySize();
    this.storage = WeChatPlatform.createStorage();
    this.audio = WeChatPlatform.createAudio();
    this.ads = new WeChatAdsAdapter(wx, undefined, (m) => console.info(m));

    wx.onWindowResize?.(() => {
      this.info = WeChatPlatform.readScreen();
      this.applySize();
    });
  }

  private static readScreen(): ScreenInfo {
    try {
      const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const safe = w.safeArea ?? { top: 0, bottom: w.windowHeight ?? w.screenHeight ?? 0 };
      const height = w.windowHeight ?? w.screenHeight ?? 667;
      return {
        width: w.windowWidth ?? w.screenWidth ?? 375,
        height,
        dpr: Math.min(w.pixelRatio ?? 1, 3),
        safeTop: Math.max(0, safe.top ?? 0),
        safeBottom: Math.max(0, height - (safe.bottom ?? height)),
      };
    } catch {
      return { width: 375, height: 667, dpr: 2, safeTop: 0, safeBottom: 0 };
    }
  }

  private applySize(): void {
    this.canvas.width = Math.round(this.info.width * this.info.dpr);
    this.canvas.height = Math.round(this.info.height * this.info.dpr);
  }

  private static createStorage(): StorageLike | null {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return null;
    return {
      getItem: (k: string) => {
        try {
          const v = wx.getStorageSync(k);
          return typeof v === 'string' && v.length > 0 ? v : null;
        } catch {
          return null;
        }
      },
      setItem: (k: string, v: string) => {
        wx.setStorageSync(k, v);
      },
      removeItem: (k: string) => {
        try {
          wx.removeStorageSync(k);
        } catch {
          /* ignore */
        }
      },
    };
  }

  private static createAudio(): AudioContextLike | null {
    try {
      if (wx.createWebAudioContext) return wx.createWebAudioContext() as AudioContextLike;
      if (typeof AudioContext !== 'undefined') return new AudioContext() as unknown as AudioContextLike;
    } catch {
      /* 部分基础库/机型不支持 WebAudio，静默降级 */
    }
    return null;
  }

  screen(): ScreenInfo {
    return this.info;
  }

  now(): number {
    return Date.now();
  }

  requestFrame(cb: () => void): void {
    requestAnimationFrame(() => cb());
  }

  onPointer(cb: (p: PointerInput) => void): void {
    const handler = (e: any) => {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      cb({ x: t.clientX, y: t.clientY });
    };
    wx.onTouchStart(handler);
  }

  onVisibility(cb: (visible: boolean) => void): void {
    wx.onShow?.(() => cb(true));
    wx.onHide?.(() => cb(false));
  }

  vibrate(kind: 'light' | 'medium' = 'light'): void {
    try {
      wx.vibrateShort?.({ type: kind });
    } catch {
      /* ignore */
    }
  }

  share(opts: { title: string; imageUrl?: string }): void {
    try {
      wx.shareAppMessage({ title: opts.title, imageUrl: opts.imageUrl });
    } catch {
      /* 分享失败不影响游戏 */
    }
  }

  /** 微信：第一次 createCanvas 是主屏画布，之后返回离屏画布 */
  createOffscreenCanvas(width: number, height: number): CanvasLike | null {
    try {
      const c = wx.createCanvas();
      c.width = width;
      c.height = height;
      return c as CanvasLike;
    } catch {
      return null;
    }
  }

  /** 微信：导出临时文件后调起「分享图片」菜单；失败则退回普通分享 */
  shareCanvasImage(canvas: CanvasLike, width: number, height: number, fileName: string): boolean {
    try {
      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width,
        height,
        destWidth: width,
        destHeight: height,
        fileType: 'png',
        success: (res: { tempFilePath: string }) => {
          try {
            if (wx.showShareImageMenu) {
              wx.showShareImageMenu({ path: res.tempFilePath });
            } else {
              wx.shareAppMessage({ title: '接通就赢 · 每日挑战', imageUrl: res.tempFilePath });
            }
          } catch {
            /* ignore */
          }
        },
        fail: () => {
          try {
            wx.showToast?.({ title: '图片生成失败', icon: 'none' });
          } catch {
            /* ignore */
          }
        },
      });
      void fileName;
      return true;
    } catch {
      return false;
    }
  }

  log(msg: string): void {
    console.info(msg);
  }
}
