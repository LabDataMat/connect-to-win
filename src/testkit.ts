/**
 * 测试入口：把纯逻辑层、UI 层与应用层打包为一个 ESM 模块，供 node:test 使用。
 * 不包含任何 DOM / 微信 API 调用。
 */
export * from './core/index';
export { AppController } from './app/AppController';
export type { AppDeps } from './app/AppController';
export { UIManager } from './ui/UIManager';
export { layout, hitTest, computeBoardRect } from './ui/layout';
export type { LayoutEnv } from './ui/layout';
export { designSize, computeViewport, THEME, DESIGN_WIDTH, MIN_DESIGN_HEIGHT } from './ui/theme';
export type { Viewport } from './ui/theme';
export { DevAdsAdapter, WeChatAdsAdapter } from './platform/ads';
export type { AdsAdapter, RewardedResult } from './platform/ads';
export type { Platform, ScreenInfo, PointerInput } from './platform/types';
export { defaultSave, SAVE_KEY, SAVE_VERSION } from './core/SaveManager';
export { GAME_CONFIG, isAdDevMode } from './config';
