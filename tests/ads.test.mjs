import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, tapId } from './helpers.mjs';
import { DevAdsAdapter, WeChatAdsAdapter, GameManager, GAME_CONFIG, isAdDevMode } from '../build/testkit.mjs';

const N = 1;
const E = 2;
const S = 4;
const W = 8;

/** 无法连通的测试关卡（肘形管），用于稳定进入失败状态 */
function impossibleLevel(limit = 2) {
  return {
    id: 900,
    name: 'ad-test',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: E },
    goal: { x: 2, y: 0, dir: W },
    cells: [
      { d: E, r: 0, rot: false, k: 'start' },
      { d: E | S, r: 0, rot: true, k: 'pipe' },
      { d: W, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: limit,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
}

class FakeAds {
  constructor(result, available = true) {
    this.mode = 'prod';
    this.result = result;
    this.available = available;
    this.calls = [];
  }
  isRewardedAvailable() {
    return this.available;
  }
  async showRewarded(scene) {
    this.calls.push(scene);
    return this.result;
  }
  isInterstitialAvailable() {
    return false;
  }
  async showInterstitial() {
    return false;
  }
}

function forceLose(app) {
  app.startLevel(impossibleLevel(2), false);
  app.dispatch({ type: 'cell', x: 1, y: 0 });
  app.dispatch({ type: 'cell', x: 1, y: 0 });
}

test('开发模式广告：不可用、不展示、不发放奖励', async () => {
  assert.equal(isAdDevMode(), true, '默认配置应为开发模式');
  const ads = new DevAdsAdapter();
  assert.equal(ads.mode, 'dev');
  assert.equal(ads.isRewardedAvailable(), false);
  assert.equal(ads.isInterstitialAvailable(), false);
  const res = await ads.showRewarded('test');
  assert.equal(res.completed, false);
  assert.equal(res.reason, 'dev-mode');
  const shown = await ads.showInterstitial('test');
  assert.equal(shown, false);
});

test('失败弹窗：开发模式下不展示广告按钮，点击广告也不会给奖励', async () => {
  const { app, platform } = makeApp();
  forceLose(app);
  app.update(platform.now());
  assert.equal(app.game.status, 'lost');
  assert.equal(app.modal, 'lose');
  assert.equal(app.ui.find('btn.extraAd'), null, '未配置广告时不应出现广告按钮');

  const limitBefore = app.game.stepLimit;
  app.dispatch({ type: 'extraStepsAd' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(app.game.stepLimit, limitBefore, '开发模式不得发放额外步数');
  assert.equal(app.game.status, 'lost');
  assert.match(app.toastMsg ?? '', /开发模式/);
});

test('激励视频完整播放后才发放额外步数', async () => {
  const ads = new FakeAds({ completed: true });
  const { app, platform } = makeApp({ ads });
  forceLose(app);
  app.update(platform.now());
  assert.ok(app.ui.find('btn.extraAd'), '配置广告位后应出现广告按钮');

  const limitBefore = app.game.stepLimit;
  tapId(app, platform, 'btn.extraAd');
  await new Promise((r) => setTimeout(r, 20));

  assert.deepEqual(ads.calls, ['extra-steps']);
  assert.equal(app.game.stepLimit, limitBefore + GAME_CONFIG.rewardedExtraSteps);
  assert.equal(app.game.status, 'playing', '获得步数后应可继续');
  assert.equal(app.modal, null);
});

test('提前关闭广告：不发放奖励', async () => {
  const ads = new FakeAds({ completed: false, reason: 'closed-early' });
  const { app, platform } = makeApp({ ads });
  forceLose(app);
  app.update(platform.now());
  const limitBefore = app.game.stepLimit;
  tapId(app, platform, 'btn.extraAd');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(app.game.stepLimit, limitBefore);
  assert.equal(app.game.status, 'lost');
  assert.match(app.toastMsg ?? '', /未完整播放/);
});

test('微信广告适配器：未配置广告位时不可用', async () => {
  const fakeWx = { createRewardedVideoAd: () => ({ onError() {}, onClose() {}, show: () => Promise.resolve() }) };
  const config = { ...GAME_CONFIG, rewardedAdUnitId: '', interstitialAdUnitId: '' };
  const adapter = new WeChatAdsAdapter(fakeWx, config);
  assert.equal(adapter.isRewardedAvailable(), false);
  const res = await adapter.showRewarded('x');
  assert.equal(res.completed, false);
  assert.equal(res.reason, 'no-ad-unit');
});

test('微信广告适配器：onClose.isEnded 决定是否发放奖励', async () => {
  let closeCb = null;
  const fakeAd = {
    onClose(cb) {
      closeCb = cb;
    },
    offClose() {
      closeCb = null;
    },
    onError() {},
    show: () => Promise.resolve(),
    load: () => Promise.resolve(),
  };
  const fakeWx = { createRewardedVideoAd: () => fakeAd };
  const config = { ...GAME_CONFIG, rewardedAdUnitId: 'adunit-fake-123' };
  const adapter = new WeChatAdsAdapter(fakeWx, config);
  assert.equal(adapter.isRewardedAvailable(), true);

  const p1 = adapter.showRewarded('scene-a');
  await new Promise((r) => setTimeout(r, 10));
  closeCb({ isEnded: true });
  const r1 = await p1;
  assert.equal(r1.completed, true, '完整播放应发放奖励');

  const p2 = adapter.showRewarded('scene-b');
  await new Promise((r) => setTimeout(r, 10));
  closeCb({ isEnded: false });
  const r2 = await p2;
  assert.equal(r2.completed, false, '提前关闭不应发放奖励');
  assert.equal(r2.reason, 'closed-early');
});

test('微信广告适配器：播放失败时降级为加载失败，不发放奖励', async () => {
  const fakeAd = {
    onClose() {},
    offClose() {},
    onError() {},
    show: () => Promise.reject(new Error('show-failed')),
    load: () => Promise.reject(new Error('load-failed')),
  };
  const adapter = new WeChatAdsAdapter({ createRewardedVideoAd: () => fakeAd }, { ...GAME_CONFIG, rewardedAdUnitId: 'adunit-fake' });
  const res = await adapter.showRewarded('scene-c');
  assert.equal(res.completed, false);
  assert.equal(res.reason, 'load-failed');
});

test('插屏广告：仅在开关打开且配置广告位时可用', () => {
  const fakeAd = { onError() {}, show: () => Promise.resolve() };
  const wxApi = { createInterstitialAd: () => fakeAd };

  const off = new WeChatAdsAdapter(wxApi, { ...GAME_CONFIG, interstitialAdUnitId: 'unit', enableInterstitial: false });
  assert.equal(off.isInterstitialAvailable(), false);

  const on = new WeChatAdsAdapter(wxApi, { ...GAME_CONFIG, interstitialAdUnitId: 'unit', enableInterstitial: true });
  assert.equal(on.isInterstitialAvailable(), true);
});

test('广告代码与核心逻辑解耦：GameManager 不依赖任何广告接口', () => {
  const gm = new GameManager(impossibleLevel(2));
  // 核心逻辑只暴露 grantExtraSteps，由上层在平台确认后调用
  gm.grantExtraSteps(3);
  assert.equal(gm.stepLimit, 5);
  assert.equal(typeof gm.rotate, 'function');
});
