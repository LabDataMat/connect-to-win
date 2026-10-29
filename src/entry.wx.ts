import { bootstrap } from './main';
import { WeChatPlatform } from './platform/wechat';

/**
 * 微信小游戏入口：game.js
 * 仅创建平台适配层并启动游戏，不含任何业务逻辑。
 */
const platform = new WeChatPlatform();
const boot = bootstrap(platform);

try {
  const g = globalThis as unknown as Record<string, unknown>;
  g.__CTW__ = boot;
} catch {
  /* ignore */
}
