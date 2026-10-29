import test from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, tapId, tapCell, solveCurrentLevel, tapDesign } from './helpers.mjs';
import { computeViewport, MIN_DESIGN_HEIGHT } from '../build/testkit.mjs';

test('首页 → 开始游戏 → 进入第 1 关', () => {
  const { app, platform } = makeApp();
  assert.equal(app.screen, 'home');
  assert.ok(app.ui.find('btn.play'), '首页应有开始按钮');
  tapId(app, platform, 'btn.play');
  assert.equal(app.screen, 'game');
  assert.equal(app.level.id, 1);
  assert.equal(app.game.moves, 0);
  assert.equal(app.game.status, 'playing');
  assert.ok(
    app.ui.elements.some((e) => e.kind === 'cell'),
    '棋盘格子应可点击'
  );
});

test('暂停 / 继续 / 重试 / 返回 全部可用', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  const level = app.level;

  // 先走两步
  const path = level.solutionPath;
  tapCell(app, platform, path[1].x, path[1].y);
  tapCell(app, platform, path[1].x, path[1].y);
  const movesBefore = app.game.moves;
  assert.equal(movesBefore, 2);

  tapId(app, platform, 'btn.pause');
  assert.equal(app.modal, 'pause');
  // 暂停时点击棋盘角落（弹窗之外的区域）不应计步
  const before = app.game.moves;
  const board = app.ui.board;
  tapDesign(app, platform, board.x + board.w * 0.1, board.y + board.h * 0.1);
  assert.equal(app.game.moves, before, '暂停时不应计步');

  tapId(app, platform, 'btn.resume');
  assert.equal(app.modal, null);

  tapId(app, platform, 'btn.retry');
  assert.equal(app.game.moves, 0, '重试后步数归零');
  assert.equal(app.game.status, 'playing');

  tapId(app, platform, 'btn.back');
  assert.equal(app.screen, 'levels');
  assert.equal(app.game, null);
});

test('通关后解锁下一关，最佳步数正确保存', () => {
  const { app, platform, save } = makeApp();
  tapId(app, platform, 'btn.play');
  const steps = app.level.solutionPath.reduce((sum, p) => {
    const t = app.game.board.tileAt(p.x, p.y);
    return sum + (t.rotatable ? t.turnsToSolution : 0);
  }, 0);

  solveCurrentLevel(app, platform);
  assert.equal(app.game.status, 'won', '按参考解操作后必须通关');
  assert.equal(app.modal, 'win');
  assert.equal(app.win.steps, app.game.moves);
  assert.ok(app.win.steps <= app.level.stepLimit);
  assert.equal(save.data.highestUnlocked, 2, '应解锁第 2 关');
  assert.equal(save.data.levels['1'].cleared, true);
  assert.equal(save.data.levels['1'].bestSteps, app.game.moves);
  assert.ok(app.game.moves <= steps + 1);

  tapId(app, platform, 'btn.next');
  assert.equal(app.level.id, 2);
  assert.equal(app.game.moves, 0);
});

test('提示：免费显示解路径，不需要广告', () => {
  const { app, platform, save, analytics } = makeApp();
  tapId(app, platform, 'btn.play');
  assert.equal(app.hintTiles.size, 0);
  tapId(app, platform, 'btn.hint');
  assert.ok(app.hintTiles.size > 0, '提示应高亮解路径');
  assert.equal(app.hintTiles.size, app.level.solutionPath.length);
  assert.equal(save.data.stats.hintsUsed, 1);
  assert.equal(analytics.count('ad_request'), 0, '提示不应触发广告');

  // 2.6 秒后提示自动消失
  platform.advance(3000);
  app.update(platform.now());
  assert.equal(app.hintTiles.size, 0);
});

test('失败后重试：状态完全重置', () => {
  const { app, platform } = makeApp();
  // 构造一个永远无法连通的关卡，步数用尽后进入失败状态
  const level = {
    id: 901,
    name: 'lose-test',
    width: 3,
    height: 1,
    start: { x: 0, y: 0, dir: 2 },
    goal: { x: 2, y: 0, dir: 8 },
    cells: [
      { d: 2, r: 0, rot: false, k: 'start' },
      { d: 2 | 4, r: 0, rot: true, k: 'pipe' },
      { d: 8, r: 0, rot: false, k: 'goal' },
    ],
    stepLimit: 2,
    solutionPath: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  };
  app.startLevel(level, false);
  app.game.rotate(1, 0);
  app.game.rotate(1, 0);
  app.update(platform.now());
  assert.equal(app.game.status, 'lost');
  assert.equal(app.modal, 'lose');
  assert.equal(app.ui.find('btn.extraAd'), null, '开发模式不展示广告按钮');

  tapId(app, platform, 'btn.retry');
  assert.equal(app.modal, null);
  assert.equal(app.game.moves, 0);
  assert.equal(app.game.status, 'playing');
});

test('快速连续点击不会导致状态错误', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  const p = app.level.solutionPath[1];
  const tile = app.game.board.tileAt(p.x, p.y);
  const startRotation = tile.rotation;
  const clicks = 9;
  for (let i = 0; i < clicks; i++) {
    tapCell(app, platform, p.x, p.y);
  }
  if (app.game.status === 'playing') {
    assert.equal(app.game.moves, clicks);
    assert.equal(tile.rotation, (startRotation + clicks) % 4);
  } else {
    // 中途通关后多余点击被忽略
    assert.equal(app.game.status, 'won');
    assert.ok(app.game.moves <= clicks);
  }
});

test('前后台切换：自动暂停并保持状态，恢复后可继续', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  const p = app.level.solutionPath[1];
  tapCell(app, platform, p.x, p.y);
  const moves = app.game.moves;

  app.onHide();
  assert.equal(app.modal, 'pause', '切到后台应自动暂停');
  assert.equal(app.game.moves, moves, '暂停不应改变步数');

  app.onShow();
  assert.equal(app.modal, 'pause');
  tapId(app, platform, 'btn.resume');
  assert.equal(app.modal, null);
  assert.equal(app.game.moves, moves);
});

test('关卡列表：锁定关卡不可进入，已解锁可进入', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.levels');
  assert.equal(app.screen, 'levels');
  assert.ok(app.ui.find('level.1'));
  assert.equal(app.ui.find('level.2').locked, true);

  tapDesign(app, platform, app.ui.find('level.2').rect.x + 10, app.ui.find('level.2').rect.y + 10);
  assert.equal(app.screen, 'levels', '锁定关卡不应进入');
  assert.equal(app.game, null);

  tapId(app, platform, 'level.1');
  assert.equal(app.screen, 'game');
  assert.equal(app.level.id, 1);
});

test('每日挑战：同一天进入同一谜题，通关后记录结果', () => {
  const { app, platform, save } = makeApp();
  tapId(app, platform, 'btn.daily');
  assert.equal(app.screen, 'game');
  assert.equal(app.dailyMode, true);
  assert.equal(app.level.daily, true);
  const key = app.level.dateKey;

  solveCurrentLevel(app, platform);
  assert.equal(app.game.status, 'won');
  assert.equal(app.modal, 'win');
  assert.equal(app.win.daily, true);
  assert.equal(save.data.daily.date, key);
  assert.equal(save.data.daily.cleared, true);

  tapId(app, platform, 'btn.next');
  assert.equal(app.screen, 'home', '每日挑战结束后回到首页');
});

test('设置：静音开关与清除进度（含二次确认）', () => {
  const { app, platform, save } = makeApp();
  tapId(app, platform, 'btn.settings');
  assert.equal(app.screen, 'settings');
  assert.equal(save.data.settings.sound, true);

  tapId(app, platform, 'btn.sound');
  assert.equal(save.data.settings.sound, false);
  tapId(app, platform, 'btn.sound');
  assert.equal(save.data.settings.sound, true);

  // 先造一点进度
  tapId(app, platform, 'btn.back');
  tapId(app, platform, 'btn.play');
  solveCurrentLevel(app, platform);
  tapId(app, platform, 'btn.levels');
  assert.equal(save.data.highestUnlocked, 2);

  tapId(app, platform, 'btn.back');
  tapId(app, platform, 'btn.settings');
  tapId(app, platform, 'btn.clear');
  assert.equal(app.modal, 'confirm-clear');
  tapId(app, platform, 'btn.cancel');
  assert.equal(app.modal, null);
  assert.equal(save.data.highestUnlocked, 2, '取消后进度保留');

  tapId(app, platform, 'btn.clear');
  tapId(app, platform, 'btn.confirmClear');
  assert.equal(app.modal, null);
  assert.equal(app.screen, 'home');
  assert.equal(save.data.highestUnlocked, 1, '确认后进度被清除');
  assert.deepEqual(save.data.levels, {});
});

test('布局：常见屏幕尺寸下按钮不越界、不重叠', () => {
  const sizes = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    // 桌面/横屏：比 750:1240 更宽的比例，必须靠左右留白保证完整可见
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const size of sizes) {
    const { app, platform } = makeApp(size);
    const env = app.env();
    const h = env.h;
    assert.ok(h >= MIN_DESIGN_HEIGHT - 0.5, `${size.width}x${size.height} 设计高度 ${h} 小于最小高度`);

    const check = (screenName) => {
      for (const el of app.ui.elements) {
        if (!el.action) continue;
        assert.ok(el.rect.x >= -1 && el.rect.x + el.rect.w <= 751, `${size.width}x${size.height} ${screenName} ${el.id} 水平越界`);
        assert.ok(el.rect.y >= -1 && el.rect.y + el.rect.h <= h + 1, `${size.width}x${size.height} ${screenName} ${el.id} 垂直越界`);
      }
    };

    check('home');
    const retry = app.ui.find('btn.play');
    const daily = app.ui.find('btn.daily');
    const levels = app.ui.find('btn.levels');
    assert.ok(retry.rect.y + retry.rect.h <= daily.rect.y, '首页主按钮不应重叠');
    assert.ok(daily.rect.y + daily.rect.h <= levels.rect.y, '首页主按钮不应重叠');

    tapId(app, platform, 'btn.play');
    check('game');
    const board = app.ui.board;
    assert.ok(board.w > 0 && board.h > 0, '棋盘应有尺寸');
    assert.ok(board.x >= 0 && board.x + board.w <= 750, '棋盘水平越界');
    assert.ok(board.y >= 0 && board.y + board.h <= h, '棋盘垂直越界');
    const b1 = app.ui.find('btn.retry');
    const b2 = app.ui.find('btn.hint');
    const b3 = app.ui.find('btn.pause');
    assert.ok(b1.rect.x + b1.rect.w < b2.rect.x, '底部按钮重叠');
    assert.ok(b2.rect.x + b2.rect.w < b3.rect.x, '底部按钮重叠');

    tapId(app, platform, 'btn.pause');
    check('pause-modal');
    tapId(app, platform, 'btn.home');
    tapId(app, platform, 'btn.levels');
    check('levels');
  }
});

test('页面加载与返回不会残留旧状态', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.play');
  tapCell(app, platform, app.level.solutionPath[1].x, app.level.solutionPath[1].y);
  tapId(app, platform, 'btn.back');
  assert.equal(app.screen, 'levels');
  tapId(app, platform, 'btn.back');
  assert.equal(app.screen, 'home');
  tapId(app, platform, 'btn.play');
  assert.equal(app.game.moves, 0, '重新进入关卡步数应从 0 开始');
  assert.equal(app.modal, null);
});

test('视口计算：竖屏铺满、宽屏按高度缩放并居中留白', () => {
  const phone = computeViewport(375, 812);
  assert.equal(phone.offsetX, 0, '竖屏不应有左右留白');
  assert.ok(Math.abs(phone.scale - 0.5) < 1e-9, '竖屏按宽度缩放');
  assert.ok(Math.abs(phone.height - 1624) < 1e-6);

  const wide = computeViewport(1440, 900);
  assert.ok(wide.offsetX > 0, '宽屏应有左右留白');
  assert.ok(Math.abs(wide.height - MIN_DESIGN_HEIGHT) < 1e-6, '宽屏按最小设计高度缩放');
  assert.ok(Math.abs(wide.scale - 900 / MIN_DESIGN_HEIGHT) < 1e-9);
  // 内容水平居中
  const leftGutterPx = wide.offsetX * wide.scale;
  const rightGutterPx = 1440 - (wide.offsetX + wide.width) * wide.scale;
  assert.ok(Math.abs(leftGutterPx - rightGutterPx) < 0.5, '左右留白应对称');

  const tablet = computeViewport(768, 1024);
  assert.ok(tablet.offsetX > 0, '4:3 平板也应有留白');
  assert.ok(tablet.height >= MIN_DESIGN_HEIGHT);
});

test('宽屏下点击位置正确（含左右留白偏移）', () => {
  const { app, platform } = makeApp({ width: 1440, height: 900 });
  assert.ok(app.viewport().offsetX > 0);
  tapId(app, platform, 'btn.play');
  assert.equal(app.screen, 'game', '宽屏下点「开始游戏」应进入关卡');

  const level = app.level;
  const cell = level.solutionPath[1];
  const tile = app.game.board.tileAt(cell.x, cell.y);
  const before = tile.rotation;
  tapCell(app, platform, cell.x, cell.y);
  if (app.game.status === 'playing') {
    assert.equal(tile.rotation, (before + 1) % 4, '宽屏下点方块应旋转对应格子');
  }

  tapId(app, platform, 'btn.pause');
  assert.equal(app.modal, 'pause');
});
