import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage, makeApp, tapId, solveCurrentLevel } from './helpers.mjs';
import { SaveManager, SAVE_KEY, SAVE_VERSION, defaultSave } from '../build/testkit.mjs';

test('进度保存与重启恢复', () => {
  const storage = new MemoryStorage();
  const save1 = new SaveManager(storage);
  save1.load();
  save1.markLevelCleared(1, 5, 30);
  save1.markLevelCleared(2, 7, 30);
  save1.setSound(false);
  save1.addStats({ totalMoves: 12, hintsUsed: 2 });
  assert.equal(save1.save(), true);

  const save2 = new SaveManager(storage);
  const result = save2.load();
  assert.equal(result.ok, true);
  assert.equal(result.recovered, false);
  assert.equal(save2.data.highestUnlocked, 3);
  assert.equal(save2.data.levels['1'].bestSteps, 5);
  assert.equal(save2.data.levels['2'].cleared, true);
  assert.equal(save2.data.settings.sound, false);
  assert.equal(save2.data.stats.totalMoves, 12);
});

test('最佳步数只记录更优成绩', () => {
  const storage = new MemoryStorage();
  const save = new SaveManager(storage);
  save.load();

  const r1 = save.markLevelCleared(1, 8, 30);
  assert.equal(r1.newBest, true);
  assert.equal(save.getBestSteps(1), 8);

  const r2 = save.markLevelCleared(1, 12, 30);
  assert.equal(r2.newBest, false);
  assert.equal(save.getBestSteps(1), 8, '更差的成绩不应覆盖最佳');

  const r3 = save.markLevelCleared(1, 6, 30);
  assert.equal(r3.newBest, true);
  assert.equal(save.getBestSteps(1), 6);
});

test('解锁进度：通关后解锁下一关，且不超过总关数', () => {
  const storage = new MemoryStorage();
  const save = new SaveManager(storage);
  save.load();
  assert.equal(save.data.highestUnlocked, 1);

  save.markLevelCleared(1, 4, 30);
  assert.equal(save.data.highestUnlocked, 2);

  // 依次通关到最后一关
  for (let id = 2; id <= 30; id++) save.markLevelCleared(id, 10, 30);
  assert.equal(save.data.highestUnlocked, 30, '最高解锁关卡不应超过总关数');

  const last = save.markLevelCleared(30, 8, 30);
  assert.equal(last.unlockedNext, false, '最后一关不再解锁新关卡');
  assert.equal(save.data.highestUnlocked, 30);
});

test('每日挑战结果：同一天保留最好成绩', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  save.recordDailyResult('2026-10-29', true, 12);
  save.recordDailyResult('2026-10-29', true, 15);
  assert.equal(save.data.daily.steps, 12);
  save.recordDailyResult('2026-10-30', true, 9);
  assert.equal(save.data.daily.date, '2026-10-30');
  assert.equal(save.data.daily.steps, 9);
});

test('损坏存档：JSON 解析失败不会导致启动失败', () => {
  const storage = new MemoryStorage({ [SAVE_KEY]: '{not-json' });
  const save = new SaveManager(storage);
  const result = save.load();
  assert.equal(result.ok, false);
  assert.equal(result.recovered, true);
  assert.equal(result.error, 'parse-failed');
  assert.deepEqual(save.data, defaultSave());
});

test('异常存档：字段类型错误会被收敛为合法值', () => {
  const bad = {
    version: 99,
    highestUnlocked: 'abc',
    levels: [1, 2, 3],
    daily: { date: 'not-a-date', cleared: 'yes', steps: -5 },
    settings: { sound: 'no' },
    stats: { totalMoves: -10, totalClears: 'x', hintsUsed: 3 },
    lastLevel: null,
  };
  const storage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(bad) });
  const save = new SaveManager(storage);
  const result = save.load();
  assert.equal(result.recovered, true);
  assert.equal(save.data.highestUnlocked, 1);
  assert.deepEqual(save.data.levels, {});
  assert.equal(save.data.daily, null);
  assert.equal(save.data.settings.sound, true);
  assert.equal(save.data.stats.totalMoves, 0);
  assert.equal(save.data.stats.hintsUsed, 3);
  assert.equal(save.data.version, SAVE_VERSION);
});

test('部分损坏：合法关卡记录保留，非法记录丢弃', () => {
  const raw = {
    version: SAVE_VERSION,
    highestUnlocked: 3,
    levels: {
      1: { cleared: true, bestSteps: 6 },
      2: { cleared: 'yes', bestSteps: 0 },
      3: { cleared: true, bestSteps: -2 },
      x: { cleared: true, bestSteps: 1 },
    },
    daily: null,
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.data.levels['1'].bestSteps, 6);
  assert.equal(save.data.levels['2'], undefined, '非法记录应丢弃');
  assert.equal(save.data.levels['3'].bestSteps, null);
  assert.equal(save.data.levels['x'], undefined);
});

test('解锁关卡可由通关记录自动修复', () => {
  const raw = {
    version: SAVE_VERSION,
    highestUnlocked: 1,
    levels: {
      1: { cleared: true, bestSteps: 4 },
      2: { cleared: true, bestSteps: 5 },
    },
    daily: null,
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.data.highestUnlocked, 3, '已通关 1、2 关应解锁第 3 关');
});

test('存储不可读：降级为内存存档，游戏仍可运行', () => {
  const storage = new MemoryStorage();
  storage.failReads = true;
  const save = new SaveManager(storage);
  const result = save.load();
  assert.equal(result.recovered, true);
  assert.equal(save.memoryOnly, true);
  assert.equal(save.data.highestUnlocked, 1);
});

test('存储写入失败：不影响游戏进行', () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const { app, platform, save } = makeApp({ storage });
  assert.equal(save.save(), false);
  tapId(app, platform, 'btn.play');
  assert.equal(app.screen, 'game');
  solveCurrentLevel(app, platform);
  assert.equal(app.game.status, 'won', '即使无法写盘，玩法也应正常');
});

test('清除进度：删除存储并回到初始状态', () => {
  const storage = new MemoryStorage();
  const save = new SaveManager(storage);
  save.load();
  save.markLevelCleared(1, 4, 30);
  save.save();
  assert.ok(storage.raw(SAVE_KEY));

  save.reset();
  assert.equal(storage.raw(SAVE_KEY), null);
  assert.equal(save.data.highestUnlocked, 1);
});

test('应用重启后从存档恢复进度（端到端）', () => {
  const storage = new MemoryStorage();
  const first = makeApp({ storage });
  tapId(first.app, first.platform, 'btn.play');
  solveCurrentLevel(first.app, first.platform);
  assert.equal(first.save.data.highestUnlocked, 2);
  const best = first.save.getBestSteps(1);

  // 模拟重启：新 AppController 读取同一份存储
  const second = makeApp({ storage });
  assert.equal(second.save.data.highestUnlocked, 2);
  assert.equal(second.save.getBestSteps(1), best);
  assert.equal(second.app.ui.find('btn.play').label, '继续第 2 关');
});
