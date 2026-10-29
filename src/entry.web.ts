import { bootstrap } from './main';
import { WebPlatform } from './platform/web';
import { drawShareCard } from './render/ShareCard';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('缺少 #game canvas 元素');
}

const platform = new WebPlatform(canvas);
const boot = bootstrap(platform);

// 便于本地调试与自动化截图测试
(window as unknown as Record<string, unknown>).__CTW__ = boot;
(window as unknown as Record<string, unknown>).__CTW_CARD__ = drawShareCard;
