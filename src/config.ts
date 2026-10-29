/**
 * 全局配置。
 * 广告位 ID 默认为空：为空时广告层进入「开发模式」，不展示任何虚假广告，也不发放奖励。
 * 只有具备微信流量主资格、并在后台创建广告位后，才应填入真实 ID。
 */
export interface GameConfig {
  version: string;
  /** 激励视频广告位 ID，留空表示未配置 */
  rewardedAdUnitId: string;
  /** 插屏广告位 ID，留空表示未配置 */
  interstitialAdUnitId: string;
  /** 是否允许展示插屏广告（还需广告位 ID 非空） */
  enableInterstitial: boolean;
  /** 每通过 N 关考虑展示一次插屏（自然节点，不在失败/点击时展示） */
  interstitialEveryNLevels: number;
  /** 每次激励视频可获得的额外步数 */
  rewardedExtraSteps: number;
  /** 隐私政策地址（上线前必须填写可访问的页面） */
  privacyPolicyUrl: string;
  /** 分享文案 */
  shareTitle: string;
}

export const GAME_CONFIG: GameConfig = {
  version: '0.1.0',
  rewardedAdUnitId: '',
  interstitialAdUnitId: '',
  enableInterstitial: false,
  interstitialEveryNLevels: 5,
  rewardedExtraSteps: 3,
  privacyPolicyUrl: '',
  shareTitle: '接通就赢：转动电路，点亮终点，你能过几关？',
};

/** 当前是否处于广告开发模式（无真实广告位） */
export function isAdDevMode(): boolean {
  return !GAME_CONFIG.rewardedAdUnitId && !GAME_CONFIG.interstitialAdUnitId;
}
