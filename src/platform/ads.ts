import { GAME_CONFIG } from '../config';

export type AdFailureReason = 'dev-mode' | 'no-ad-unit' | 'not-supported' | 'load-failed' | 'closed-early' | 'error';

export interface RewardedResult {
  /** 只有平台明确回调“完整播放”时才为 true */
  completed: boolean;
  reason?: AdFailureReason;
}

/**
 * 广告适配层接口。
 * 与核心玩法完全解耦：GameManager 不感知广告，奖励发放由 AppController 在
 * completed === true 时显式执行。
 */
export interface AdsAdapter {
  readonly mode: 'dev' | 'prod';
  isRewardedAvailable(): boolean;
  showRewarded(scene: string): Promise<RewardedResult>;
  isInterstitialAvailable(): boolean;
  showInterstitial(scene: string): Promise<boolean>;
}

/** 开发模式广告：不展示任何内容，不发放奖励，仅记录调用 */
export class DevAdsAdapter implements AdsAdapter {
  readonly mode = 'dev' as const;
  private log: string[] = [];

  constructor(private onLog?: (msg: string) => void) {}

  isRewardedAvailable(): boolean {
    return false;
  }

  async showRewarded(scene: string): Promise<RewardedResult> {
    this.log.push(`rewarded:${scene}`);
    this.onLog?.(`[ads:dev] 未配置激励视频广告位，场景 ${scene} 不发放奖励`);
    return { completed: false, reason: 'dev-mode' };
  }

  isInterstitialAvailable(): boolean {
    return false;
  }

  async showInterstitial(scene: string): Promise<boolean> {
    this.log.push(`interstitial:${scene}`);
    this.onLog?.(`[ads:dev] 未配置插屏广告位，场景 ${scene} 跳过`);
    return false;
  }

  get calls(): readonly string[] {
    return this.log;
  }
}

/** 微信小游戏广告适配（仅在配置了真实广告位 ID 时启用） */
export class WeChatAdsAdapter implements AdsAdapter {
  readonly mode = 'prod' as const;
  private rewardedAd: any = null;
  private interstitialAd: any = null;

  constructor(
    private wxApi: any,
    private config = GAME_CONFIG,
    private onLog?: (msg: string) => void
  ) {
    if (!this.config.rewardedAdUnitId && !this.config.interstitialAdUnitId) return;
    try {
      if (this.config.rewardedAdUnitId && this.wxApi?.createRewardedVideoAd) {
        this.rewardedAd = this.wxApi.createRewardedVideoAd({ adUnitId: this.config.rewardedAdUnitId });
        this.rewardedAd.onError?.((err: unknown) => {
          this.onLog?.(`[ads] rewarded error: ${JSON.stringify(err)}`);
        });
      }
      if (this.config.interstitialAdUnitId && this.wxApi?.createInterstitialAd) {
        this.interstitialAd = this.wxApi.createInterstitialAd({ adUnitId: this.config.interstitialAdUnitId });
        this.interstitialAd.onError?.((err: unknown) => {
          this.onLog?.(`[ads] interstitial error: ${JSON.stringify(err)}`);
        });
      }
    } catch (e) {
      this.onLog?.(`[ads] init failed: ${String(e)}`);
    }
  }

  isRewardedAvailable(): boolean {
    return this.rewardedAd !== null;
  }

  isInterstitialAvailable(): boolean {
    return this.interstitialAd !== null && this.config.enableInterstitial;
  }

  /** 激励视频：只有 onClose 回调 isEnded === true 才认为完成 */
  showRewarded(scene: string): Promise<RewardedResult> {
    const ad = this.rewardedAd;
    if (!ad) return Promise.resolve({ completed: false, reason: 'no-ad-unit' });
    return new Promise<RewardedResult>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (r: RewardedResult) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        ad.offClose?.(onClose);
        resolve(r);
      };
      const onClose = (res: { isEnded?: boolean } | undefined) => {
        const ended = res?.isEnded === true;
        finish(ended ? { completed: true } : { completed: false, reason: 'closed-early' });
      };
      try {
        ad.onClose?.(onClose);
        ad.show()
          .then(() => {
            this.onLog?.(`[ads] rewarded shown: ${scene}`);
          })
          .catch(() => {
            ad.load?.()
              .then(() => ad.show())
              .catch(() => finish({ completed: false, reason: 'load-failed' }));
          });
      } catch {
        finish({ completed: false, reason: 'error' });
      }
      // 兜底：30s 未回调则视为失败，避免卡死
      timer = setTimeout(() => finish({ completed: false, reason: 'error' }), 30000);
    });
  }

  async showInterstitial(scene: string): Promise<boolean> {
    const ad = this.interstitialAd;
    if (!ad) return false;
    try {
      await ad.show();
      this.onLog?.(`[ads] interstitial shown: ${scene}`);
      return true;
    } catch {
      return false;
    }
  }
}
