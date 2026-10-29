import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const BUNDLE = 'dist/wxgame/game.js';

function makeCtx() {
  const gradient = { addColorStop() {} };
  const ctx = {
    canvas: { width: 750, height: 1334 },
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    rect() {},
    fill() {},
    stroke() {},
    fillRect() {},
    clearRect() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    fillText() {},
    measureText: () => ({ width: 12 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    drawImage() {},
  };
  return ctx;
}

/** 构造一个最小可用的微信小游戏运行环境 */
function makeWxEnv() {
  const ctx = makeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const touchHandlers = [];
  const touchEndHandlers = [];
  const storage = new Map();
  const wx = {
    createCanvas: () => canvas,
    getWindowInfo: () => ({
      windowWidth: 375,
      windowHeight: 812,
      pixelRatio: 2,
      safeArea: { top: 44, bottom: 778 },
    }),
    getStorageSync: (k) => storage.get(k) ?? '',
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    onTouchStart: (cb) => touchHandlers.push(cb),
    onTouchEnd: (cb) => touchEndHandlers.push(cb),
    onTouchCancel: (cb) => touchEndHandlers.push(cb),
    onShow: () => {},
    onHide: () => {},
    onWindowResize: () => {},
    vibrateShort: () => {},
    shareAppMessage: () => {},
  };
  return { wx, canvas, touchHandlers, touchEndHandlers, storage };
}

function performance_now(sandbox) {
  return sandbox.performance.now();
}

test('微信小游戏包：在模拟的 wx 环境中可启动并响应触摸', () => {
  if (!existsSync(BUNDLE)) {
    execFileSync(process.execPath, ['tools/build.mjs'], { stdio: 'ignore' });
  }
  const code = readFileSync(BUNDLE, 'utf8');
  assert.ok(code.length > 0, '构建产物不能为空');

  const { wx, canvas, touchHandlers, touchEndHandlers, storage } = makeWxEnv();
  let frames = 0;
  const sandbox = {
    wx,
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Set,
    Map,
    Number,
    String,
    Boolean,
    Error,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => {
      frames += 1;
      if (frames <= 3) cb();
      return frames;
    },
    cancelAnimationFrame: () => {},
    performance: { now: () => 1000 + frames * 16 },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(code, sandbox, { filename: 'game.js' }), '微信入口不应抛错');

  const boot = sandbox.__CTW__;
  assert.ok(boot && boot.app, '应挂载 __CTW__ 调试入口');
  assert.equal(boot.app.screen, 'home');
  assert.ok(canvas.width > 0 && canvas.height > 0, '画布应被设置尺寸');
  assert.equal(canvas.width, 375 * 2, '画布应按 dpr 放大');

  // 触摸“开始游戏”按钮（设计坐标 -> 屏幕坐标）
  assert.equal(touchHandlers.length, 1, '应注册触摸监听');
  assert.ok(touchEndHandlers.length >= 1, '应注册抬起监听（用于区分长按）');
  const playEl = boot.app.ui.find('btn.play');
  assert.ok(playEl, '首页应有开始按钮');
  const scale = 375 / 750;
  const playX = (playEl.rect.x + playEl.rect.w / 2) * scale;
  const playY = (playEl.rect.y + playEl.rect.h / 2) * scale;
  touchHandlers[0]({ touches: [{ clientX: playX, clientY: playY }] });
  touchEndHandlers[0]({ changedTouches: [{ clientX: playX, clientY: playY }] });
  assert.equal(boot.app.screen, 'game', '触摸后应进入关卡');

  boot.app.update(performance_now(sandbox));
  // 旋转一次方块并检查步数
  const cellEl = boot.app.ui.elements.find((e) => {
    if (e.kind !== 'cell' || !e.action) return false;
    const t = boot.app.game.board.tileAt(e.action.x, e.action.y);
    return t !== null && t.rotatable;
  });
  assert.ok(cellEl, '棋盘应有可旋转方块');
  const cx = cellEl.rect.x + cellEl.rect.w / 2;
  const cy = cellEl.rect.y + cellEl.rect.h / 2;
  touchHandlers[0]({ touches: [{ clientX: cx * scale, clientY: cy * scale }] });
  touchEndHandlers[0]({ changedTouches: [{ clientX: cx * scale, clientY: cy * scale }] });
  boot.app.update(performance_now(sandbox));
  assert.ok(boot.app.game.moves >= 1, '触摸方块应计步');

  // 存储写入（微信本地缓存）应生效
  boot.app.save.save();
  assert.ok(storage.size > 0, '应写入微信本地存储');
});
