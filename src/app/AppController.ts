import { GAME_CONFIG } from '../config';
import { AnalyticsAdapter } from '../core/AnalyticsAdapter';
import { AudioManager } from '../core/AudioManager';
import { DailyChallengeManager } from '../core/DailyChallengeManager';
import { GameManager } from '../core/GameManager';
import { LevelManager } from '../core/LevelManager';
import { SaveManager } from '../core/SaveManager';
import type { LevelData } from '../core/types';
import type { Platform } from '../platform/types';
import { UIManager } from '../ui/UIManager';
import { DESIGN_WIDTH, designSize } from '../ui/theme';
import type { LayoutEnv } from '../ui/layout';
import type { Action, Modal, RenderEffect, Screen, ViewState, WinSummary } from '../ui/types';

export interface AppDeps {
  platform: Platform;
  save: SaveManager;
  levels: LevelManager;
  daily: DailyChallengeManager;
  audio: AudioManager;
  analytics: AnalyticsAdapter;
}

/**
 * AppController：应用状态机与业务流程。
 * 串联 GameManager / SaveManager / UIManager / 平台能力，是唯一修改游戏数据的地方。
 * 渲染层只读取 ViewState，不反向修改状态。
 */
export class AppController {
  readonly ui = new UIManager();
  screen: Screen = 'home';
  modal: Modal = null;
  game: GameManager | null = null;
  level: LevelData | null = null;
  dailyMode = false;
  win: WinSummary | null = null;
  toastMsg: string | null = null;
  hintTiles = new Set<string>();
  effects: RenderEffect[] = [];
  revision = 0;

  private toastUntil = 0;
  private hintUntil = 0;
  private playSecondsAcc = 0;
  private lastFrame = 0;
  private cachedView: ViewState | null = null;
  private destroyed = false;

  constructor(private deps: AppDeps) {}

  private get platform(): Platform {
    return this.deps.platform;
  }

  private get save(): SaveManager {
    return this.deps.save;
  }

  start(): void {
    const result = this.save.load();
    if (result.recovered) {
      this.deps.analytics.log('save_recovered', { error: result.error ?? 'version-or-shape' });
    }
    this.save.data.stats.sessions += 1;
    this.deps.audio.setEnabled(this.save.data.settings.sound);
    this.save.setLastLevel(Math.min(this.save.data.highestUnlocked, this.deps.levels.count));
    this.save.save();
    this.screen = 'home';
    this.modal = null;
    this.bump();
    this.deps.analytics.log('app_open', {
      version: GAME_CONFIG.version,
      platform: this.platform.name,
      recovered: result.recovered,
    });
  }

  env(): LayoutEnv {
    const s = this.platform.screen();
    const { h } = designSize(s.width, s.height);
    const scale = s.width / DESIGN_WIDTH;
    return {
      w: DESIGN_WIDTH,
      h,
      safeTop: s.safeTop / scale + 12,
      safeBottom: s.safeBottom / scale + 12,
    };
  }

  private bump(): void {
    this.revision += 1;
    this.cachedView = null;
  }

  private toast(msg: string, ms = 1800): void {
    this.toastMsg = msg;
    this.toastUntil = this.platform.now() + ms;
    this.bump();
  }

  viewState(now = this.platform.now()): ViewState {
    if (this.cachedView) return this.cachedView;
    const key = DailyChallengeManager.dateKeyOf();
    const view: ViewState = {
      screen: this.screen,
      modal: this.modal,
      level: this.level,
      game: this.game,
      save: this.save.data,
      levelCount: this.deps.levels.count,
      dailyKey: key,
      adAvailable: this.platform.ads.isRewardedAvailable(),
      toast: this.toastMsg,
      win: this.win,
      dailyDone: this.save.data.daily?.date === key && this.save.data.daily?.cleared === true,
      dailyMode: this.dailyMode,
      hintTiles: this.hintTiles,
      now,
    };
    this.cachedView = view;
    return view;
  }

  update(now: number): void {
    if (this.destroyed) return;
    this.ui.updatePress(now);
    let changed = false;
    if (this.toastMsg && now > this.toastUntil) {
      this.toastMsg = null;
      changed = true;
    }
    if (this.hintTiles.size > 0 && now > this.hintUntil) {
      this.hintTiles.clear();
      changed = true;
    }
    if (changed) this.bump();

    // 统计游戏时长（仅在进行中的关卡内累计）
    if (this.screen === 'game' && this.game && !this.game.isOver && this.modal === null && this.lastFrame > 0) {
      const dt = Math.min(1000, now - this.lastFrame);
      if (dt > 0) {
        this.playSecondsAcc += dt / 1000;
        if (this.playSecondsAcc >= 10) {
          const whole = Math.floor(this.playSecondsAcc);
          this.save.data.stats.playSeconds += whole;
          this.playSecondsAcc -= whole;
        }
      }
    }
    this.lastFrame = now;

    this.ui.update(this.viewState(now), this.env(), this.revision);
  }

  /** 屏幕坐标（CSS 像素）点击 */
  tap(clientX: number, clientY: number): void {
    const s = this.platform.screen();
    const scale = s.width / DESIGN_WIDTH;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const x = clientX / scale;
    const y = clientY / scale;
    this.ui.update(this.viewState(), this.env(), this.revision);
    const el = this.ui.findAt(x, y);
    if (el) this.ui.press(el.id, this.platform.now());
    const action = this.ui.tap(x, y);
    if (action) {
      this.deps.audio.resume();
      this.dispatch(action);
    }
  }

  dispatch(action: Action): void {
    switch (action.type) {
      case 'home':
        this.leaveGame('home');
        break;
      case 'back':
        if (this.screen === 'game') this.leaveGame(this.dailyMode ? 'home' : 'levels');
        else this.leaveGame('home');
        break;
      case 'openLevels':
        this.leaveGame('levels');
        break;
      case 'openSettings':
        this.screen = 'settings';
        this.modal = null;
        this.bump();
        this.deps.analytics.log('open_settings');
        break;
      case 'selectLevel':
        this.selectLevel(action.id);
        break;
      case 'openDaily':
        this.startDaily();
        break;
      case 'cell':
        this.tapCell(action.x, action.y);
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.modal = null;
        this.bump();
        this.deps.analytics.log('resume');
        break;
      case 'retry':
        this.retry();
        break;
      case 'hint':
        this.showHint();
        break;
      case 'next':
        this.goNext();
        break;
      case 'replay':
        this.retry();
        break;
      case 'toggleSound':
        this.toggleSound();
        break;
      case 'clearProgress':
        this.modal = 'confirm-clear';
        this.bump();
        break;
      case 'confirmClear':
        this.clearProgress();
        break;
      case 'closeModal':
        this.modal = null;
        this.bump();
        break;
      case 'about':
        this.modal = 'about';
        this.bump();
        break;
      case 'share':
        this.platform.share({ title: GAME_CONFIG.shareTitle });
        this.deps.analytics.log('share', { from: this.screen });
        this.toast('已调起分享');
        break;
      case 'extraStepsAd':
        void this.requestExtraSteps();
        break;
      case 'noop':
      default:
        break;
    }
  }

  // ---------- 关卡流程 ----------

  private selectLevel(id: number): void {
    const level = this.deps.levels.getLevel(id);
    if (!level) {
      this.toast('关卡不存在');
      return;
    }
    if (!this.deps.levels.isUnlocked(id, this.save.data.highestUnlocked)) {
      this.toast('请先通关前一关');
      return;
    }
    this.startLevel(level, false);
  }

  private startDaily(): void {
    const level = this.deps.daily.getToday();
    this.startLevel(level, true);
  }

  startLevel(level: LevelData, daily: boolean): void {
    this.level = level;
    this.dailyMode = daily;
    this.game = new GameManager(level);
    this.game.onEvent((e) => this.handleGameEvent(e));
    this.screen = 'game';
    this.modal = null;
    this.win = null;
    this.hintTiles.clear();
    this.save.setLastLevel(daily ? this.save.data.lastLevel : level.id);
    this.save.save();
    this.bump();
    this.deps.analytics.log(daily ? 'daily_start' : 'level_start', {
      id: level.id,
      limit: level.stepLimit,
      size: `${level.width}x${level.height}`,
      dateKey: daily ? level.dateKey ?? '' : '',
    });
  }

  private leaveGame(target: Screen): void {
    if (this.screen === 'game' && this.game) {
      this.deps.analytics.log('level_leave', { id: this.level?.id ?? 0, moves: this.game.moves });
      this.save.save();
    }
    this.screen = target;
    this.modal = null;
    this.game = null;
    this.level = null;
    this.win = null;
    this.dailyMode = false;
    this.hintTiles.clear();
    this.bump();
  }

  private tapCell(x: number, y: number): void {
    const game = this.game;
    if (!game || this.screen !== 'game' || this.modal !== null) return;
    if (game.isOver) return;
    const res = game.rotate(x, y);
    if (res.ok) {
      this.deps.audio.play('rotate');
      this.platform.vibrate('light');
      this.save.data.stats.totalMoves += 1;
      this.effects.push({ type: 'rotate', x, y, time: this.platform.now() });
      this.bump();
    } else if (res.reason === 'fixed') {
      this.toast('起点和终点不能旋转', 1200);
    }
  }

  private handleGameEvent(e: { type: string; moves?: number; x?: number; y?: number }): void {
    if (e.type === 'win') this.onWin();
    else if (e.type === 'lose') this.onLose();
  }

  private onWin(): void {
    const game = this.game;
    const level = this.level;
    if (!game || !level) return;
    const steps = game.moves;
    let summary: WinSummary;

    if (this.dailyMode) {
      const key = DailyChallengeManager.dateKeyOf();
      this.save.recordDailyResult(key, true, steps);
      summary = {
        levelId: 0,
        steps,
        limit: game.stepLimit,
        best: steps,
        newBest: true,
        unlockedNext: false,
        hasNext: false,
        daily: true,
      };
      this.deps.analytics.log('daily_win', { steps, limit: game.stepLimit, dateKey: key });
    } else {
      const r = this.save.markLevelCleared(level.id, steps, this.deps.levels.count);
      const next = this.deps.levels.nextLevelId(level.id);
      summary = {
        levelId: level.id,
        steps,
        limit: game.stepLimit,
        best: this.save.getBestSteps(level.id),
        newBest: r.newBest,
        unlockedNext: r.unlockedNext,
        hasNext: next !== null,
        daily: false,
      };
      this.deps.analytics.log('level_win', {
        id: level.id,
        steps,
        limit: game.stepLimit,
        newBest: r.newBest,
      });
    }

    this.save.save();
    this.win = summary;
    this.modal = 'win';
    this.hintTiles.clear();
    this.effects.push({ type: 'win', time: this.platform.now() });
    this.deps.audio.play('win');
    this.platform.vibrate('medium');
    this.bump();

    // 插屏广告：只在配置了广告位、且每 N 关一次的自然节点出现
    if (!this.dailyMode && this.platform.ads.isInterstitialAvailable() && level.id % GAME_CONFIG.interstitialEveryNLevels === 0) {
      void this.platform.ads.showInterstitial('level-win');
    }
  }

  private onLose(): void {
    const game = this.game;
    if (!game) return;
    this.modal = 'lose';
    this.effects.push({ type: 'lose', time: this.platform.now() });
    this.deps.audio.play('lose');
    this.save.save();
    this.bump();
    this.deps.analytics.log('level_lose', { id: this.level?.id ?? 0, moves: game.moves, limit: game.stepLimit });
  }

  private retry(): void {
    const game = this.game;
    if (!game) {
      this.modal = null;
      this.bump();
      return;
    }
    game.retry();
    this.modal = null;
    this.win = null;
    this.hintTiles.clear();
    this.bump();
    this.deps.audio.play('tap');
    this.deps.analytics.log('level_retry', { id: this.level?.id ?? 0 });
  }

  private pause(): void {
    if (!this.game || this.game.isOver) return;
    this.modal = 'pause';
    this.save.save();
    this.bump();
    this.deps.analytics.log('pause');
  }

  private goNext(): void {
    const level = this.level;
    if (!level) return;
    const nextId = this.deps.levels.nextLevelId(level.id);
    if (nextId === null) {
      this.leaveGame('levels');
      return;
    }
    const next = this.deps.levels.getLevel(nextId);
    if (!next) {
      this.leaveGame('levels');
      return;
    }
    this.startLevel(next, false);
  }

  private showHint(): void {
    const game = this.game;
    const level = this.level;
    if (!game || !level || game.isOver) return;
    if (!game.useHint()) return;
    this.hintTiles = new Set(level.solutionPath.map((p) => `${p.x},${p.y}`));
    this.hintUntil = this.platform.now() + 2600;
    this.save.data.stats.hintsUsed += 1;
    this.save.save();
    this.deps.audio.play('hint');
    this.effects.push({ type: 'hint', time: this.platform.now() });
    this.bump();
    this.deps.analytics.log('hint_used', { id: level.id, hints: game.hintsUsed });
  }

  private toggleSound(): void {
    const next = !this.save.data.settings.sound;
    this.save.setSound(next);
    this.deps.audio.setEnabled(next);
    this.save.save();
    this.bump();
    if (next) this.deps.audio.play('tap');
    this.deps.analytics.log('toggle_sound', { on: next });
  }

  private clearProgress(): void {
    this.save.reset();
    this.save.data.settings.sound = true;
    this.save.save();
    this.deps.audio.setEnabled(true);
    this.modal = null;
    this.screen = 'home';
    this.game = null;
    this.level = null;
    this.win = null;
    this.bump();
    this.toast('本地进度已清除');
    this.deps.analytics.log('progress_cleared');
  }

  /** 激励视频换取额外步数：只有平台确认完整播放才发放 */
  private async requestExtraSteps(): Promise<void> {
    const game = this.game;
    if (!game) return;
    this.deps.analytics.log('ad_request', { scene: 'extra-steps', id: this.level?.id ?? 0 });
    const res = await this.platform.ads.showRewarded('extra-steps');
    this.deps.analytics.log('ad_result', { scene: 'extra-steps', completed: res.completed, reason: res.reason ?? '' });
    if (res.completed) {
      game.grantExtraSteps(GAME_CONFIG.rewardedExtraSteps);
      this.modal = null;
      this.bump();
      this.toast(`获得 ${GAME_CONFIG.rewardedExtraSteps} 步额外机会`);
    } else if (res.reason === 'dev-mode' || res.reason === 'no-ad-unit') {
      this.toast('开发模式：未配置广告，暂不可用');
    } else {
      this.toast('广告未完整播放，未发放奖励');
    }
  }

  // ---------- 生命周期 ----------

  onHide(): void {
    this.save.save();
    if (this.screen === 'game' && this.game && !this.game.isOver && this.modal === null) {
      this.modal = 'pause';
      this.bump();
    }
    this.deps.analytics.log('app_hide', { screen: this.screen });
  }

  onShow(): void {
    this.lastFrame = 0;
    this.deps.analytics.log('app_show', { screen: this.screen });
    this.bump();
  }

  consumeEffects(): RenderEffect[] {
    if (this.effects.length === 0) return [];
    const list = this.effects;
    this.effects = [];
    return list;
  }

  destroy(): void {
    this.destroyed = true;
    this.save.save();
  }
}
