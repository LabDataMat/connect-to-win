import { AppController } from './app/AppController';
import { AnalyticsAdapter } from './core/AnalyticsAdapter';
import { AudioManager } from './core/AudioManager';
import { DailyChallengeManager } from './core/DailyChallengeManager';
import { LevelManager } from './core/LevelManager';
import { SaveManager } from './core/SaveManager';
import { CanvasRenderer } from './render/Renderer';
import type { Platform } from './platform/types';

export interface BootResult {
  app: AppController;
  renderer: CanvasRenderer;
  stop: () => void;
}

/**
 * 启动游戏：组装依赖、注册输入与生命周期、启动渲染循环。
 * Web 与微信小游戏共用此入口，平台差异全部由 Platform 实现吸收。
 */
export function bootstrap(platform: Platform): BootResult {
  const save = new SaveManager(platform.storage);
  const levels = new LevelManager();
  const daily = new DailyChallengeManager();
  const audio = new AudioManager(platform.audio, save.data.settings.sound);
  const analytics = new AnalyticsAdapter((e) => {
    if (platform.name === 'web') console.debug(`[analytics] ${e.name}`, e.params);
  });

  const app = new AppController({ platform, save, levels, daily, audio, analytics });
  const renderer = new CanvasRenderer(platform);

  app.start();

  platform.onPointer((p) => app.tap(p.x, p.y));
  platform.onVisibility((visible) => {
    if (visible) app.onShow();
    else app.onHide();
  });

  let running = true;
  const frame = () => {
    if (!running) return;
    const now = platform.now();
    app.update(now);
    renderer.draw(
      app.viewState(now),
      { elements: app.ui.elements, board: app.ui.board },
      app.consumeEffects(),
      now,
      app.ui.pressedId
    );
    platform.requestFrame(frame);
  };
  platform.requestFrame(frame);

  return {
    app,
    renderer,
    stop: () => {
      running = false;
      app.destroy();
    },
  };
}
