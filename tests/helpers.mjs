import {
  AppController,
  SaveManager,
  LevelManager,
  DailyChallengeManager,
  AudioManager,
  AnalyticsAdapter,
  DevAdsAdapter,
  DESIGN_WIDTH,
} from '../build/testkit.mjs';

/** 内存存储，可模拟读写失败 */
export class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.failWrites = false;
    this.failReads = false;
    this.writeCount = 0;
  }
  getItem(k) {
    if (this.failReads) throw new Error('read-fail');
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (this.failWrites) throw new Error('quota-exceeded');
    this.writeCount += 1;
    this.map.set(k, v);
  }
  removeItem(k) {
    this.map.delete(k);
  }
  raw(key) {
    return this.map.get(key) ?? null;
  }
}

/** 假平台：无 DOM、无微信 API，时间可控 */
export class FakePlatform {
  constructor(opts = {}) {
    this.name = 'web';
    this.canvas = { width: 0, height: 0, getContext: () => null };
    this.ctx = null;
    this.storage = opts.storage ?? new MemoryStorage();
    this.ads = opts.ads ?? new DevAdsAdapter();
    this.audio = null;
    this._screen = {
      width: opts.width ?? 375,
      height: opts.height ?? 812,
      dpr: opts.dpr ?? 2,
      safeTop: opts.safeTop ?? 0,
      safeBottom: opts.safeBottom ?? 0,
    };
    this._now = 1000;
    this.pointerCbs = [];
    this.visCbs = [];
    this.shareCalls = 0;
  }
  screen() {
    return this._screen;
  }
  now() {
    return this._now;
  }
  advance(ms) {
    this._now += ms;
  }
  requestFrame() {}
  onPointer(cb) {
    this.pointerCbs.push(cb);
  }
  onVisibility(cb) {
    this.visCbs.push(cb);
  }
  vibrate() {}
  share() {
    this.shareCalls += 1;
  }
  log() {}
  emitVisibility(visible) {
    for (const cb of this.visCbs) cb(visible);
  }
  resize(width, height) {
    this._screen = { ...this._screen, width, height };
  }
}

export function makeApp(opts = {}) {
  const platform = new FakePlatform(opts);
  const save = new SaveManager(platform.storage);
  const levels = new LevelManager();
  const daily = new DailyChallengeManager();
  const audio = new AudioManager(null, true);
  const analytics = new AnalyticsAdapter();
  const app = new AppController({ platform, save, levels, daily, audio, analytics });
  app.start();
  app.update(platform.now());
  return { app, platform, save, levels, daily, analytics };
}

/** 设计坐标 -> 屏幕坐标 */
function toClient(platform, x, y) {
  const scale = platform.screen().width / DESIGN_WIDTH;
  return { x: x * scale, y: y * scale };
}

export function tapDesign(app, platform, x, y) {
  const p = toClient(platform, x, y);
  app.tap(p.x, p.y);
  app.update(platform.now());
}

export function findElement(app, id) {
  app.update(app.ui.elements.length ? 0 : 0);
  return app.ui.find(id);
}

export function tapId(app, platform, id) {
  app.update(platform.now());
  const el = app.ui.find(id);
  if (!el) throw new Error(`元素不存在: ${id}（当前界面 ${app.screen}）`);
  tapDesign(app, platform, el.rect.x + el.rect.w / 2, el.rect.y + el.rect.h / 2);
  return el;
}

export function tapCell(app, platform, x, y) {
  app.update(platform.now());
  const el = app.ui.find(`cell.${x}.${y}`);
  if (!el) throw new Error(`格子不存在: ${x},${y}`);
  tapDesign(app, platform, el.rect.x + el.rect.w / 2, el.rect.y + el.rect.h / 2);
}

/** 按参考解把每格转回解状态（步数与 solutionCost 一致） */
export function solveCurrentLevel(app, platform) {
  const level = app.level;
  for (const p of level.solutionPath) {
    if (!app.game || app.game.status === 'won') break;
    const tile = app.game.board.tileAt(p.x, p.y);
    const turns = tile.turnsToSolution;
    for (let i = 0; i < turns; i++) {
      if (app.game.status === 'won') break;
      tapCell(app, platform, p.x, p.y);
    }
  }
}

export { AppController, SaveManager, LevelManager, DailyChallengeManager, AudioManager, AnalyticsAdapter, DevAdsAdapter };
