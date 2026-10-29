import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DailyChallengeManager,
  generateDailyLevel,
  SaveManager,
  PathValidator,
  OptimalSolver,
  computeStars,
} from '../build/testkit.mjs';
import { MemoryStorage, makeApp, tapId, solveCurrentLevel } from './helpers.mjs';
import { SAVE_KEY } from '../build/testkit.mjs';

test('时区：北京时间跨日边界决定日期键', () => {
  // UTC 15:59 = 北京 23:59（同一天）
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T15:59:00Z')), '2026-10-29');
  // UTC 16:01 = 北京次日 00:01
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T16:01:00Z')), '2026-10-30');
  // UTC 00:00 = 北京 08:00（同一天）
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-10-29T00:00:00Z')), '2026-10-29');
  // 跨年
  assert.equal(DailyChallengeManager.dateKeyOf(new Date('2026-12-31T16:30:00Z')), '2027-01-01');
});

test('每日挑战：同一日期所有实例生成同一关卡', () => {
  const a = new DailyChallengeManager();
  const b = new DailyChallengeManager();
  const key = '2026-10-29';
  assert.equal(JSON.stringify(a.getForDate(key)), JSON.stringify(b.getForDate(key)));
  assert.equal(JSON.stringify(a.getForDate(key)), JSON.stringify(generateDailyLevel(key)));
});

test('每日挑战：相邻两天是不同关卡，且都合法可解', () => {
  const d1 = generateDailyLevel('2026-10-29');
  const d2 = generateDailyLevel('2026-10-30');
  assert.notEqual(JSON.stringify(d1), JSON.stringify(d2));
  for (const lv of [d1, d2]) {
    assert.equal(PathValidator.validateLevel(lv).ok, true);
    const sol = OptimalSolver.solve(lv);
    assert.equal(sol.solved, true, '每日挑战必须可解');
    assert.ok(sol.minSteps > 0);
  }
});

test('跨日启动：昨天的完成记录不影响今天', () => {
  const { app, save, platform } = makeApp();
  save.data.daily = { date: '2000-01-01', cleared: true, steps: 9 };
  app.bump();
  app.update(platform.now());
  assert.equal(app.viewState().dailyDone, false, '旧日期的记录不应算作今日已完成');

  // 今天通关后应算完成
  tapId(app, platform, 'btn.daily');
  solveCurrentLevel(app, platform);
  assert.equal(app.viewState().dailyDone, true);
  assert.equal(save.data.daily.date, DailyChallengeManager.dateKeyOf());
});

test('每日挑战成绩持久化：重启后仍可读取当天结果', () => {
  const storage = new MemoryStorage();
  const first = makeApp({ storage });
  tapId(first.app, first.platform, 'btn.daily');
  solveCurrentLevel(first.app, first.platform);
  const steps = first.app.win.steps;
  const key = first.app.level.dateKey;

  const second = makeApp({ storage });
  assert.equal(second.save.data.daily.date, key);
  assert.equal(second.save.data.daily.cleared, true);
  assert.equal(second.save.data.daily.steps, steps);
  assert.equal(second.app.viewState().dailyDone, true);
});

test('每日挑战：同一天多次挑战保留更好成绩', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  const key = '2026-10-29';
  save.recordDailyResult(key, true, 18);
  save.recordDailyResult(key, true, 22);
  assert.equal(save.data.daily.steps, 18);
  save.recordDailyResult(key, true, 12);
  assert.equal(save.data.daily.steps, 12);
});

test('每日挑战也参与星级评价', () => {
  const { app, platform } = makeApp();
  tapId(app, platform, 'btn.daily');
  const optimal = app.optimalFor(app.level);
  solveCurrentLevel(app, platform);
  assert.equal(app.win.stars, 3, '按最优解完成应为 3 星');
  assert.equal(app.win.minSteps, optimal.minSteps);
  assert.equal(computeStars(app.win.steps, optimal.minSteps), 3);
});

test('存档中的每日结果字段非法时被安全丢弃', () => {
  const raw = {
    version: 1,
    highestUnlocked: 1,
    levels: {},
    daily: { date: 'bad-date', cleared: true, steps: 5 },
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.data.daily, null);
});

test('连续天数：隔天完成累加，中断后重置', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  assert.equal(save.dailyStreak, 0);

  save.recordDailyResult('2026-10-27', true, 12, 2);
  assert.equal(save.dailyStreak, 1);

  save.recordDailyResult('2026-10-28', true, 11, 3);
  assert.equal(save.dailyStreak, 2, '连续第二天应累加');

  save.recordDailyResult('2026-10-29', true, 10, 3);
  assert.equal(save.dailyStreak, 3);

  // 中断一天后再完成，连续重新从 1 开始
  save.recordDailyResult('2026-10-31', true, 9, 1);
  assert.equal(save.dailyStreak, 1, '断档后应重置为 1');
  assert.equal(save.data.bestDailyStreak, 3, '历史最长连续应保留');
});

test('连续天数：同一天重复挑战不会重复累加', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  save.recordDailyResult('2026-10-29', true, 15, 2);
  assert.equal(save.dailyStreak, 1);
  save.recordDailyResult('2026-10-29', true, 12, 3);
  assert.equal(save.dailyStreak, 1, '同一天不应重复累加');
  assert.equal(save.data.daily.steps, 12, '保留更好成绩');
  assert.equal(save.data.daily.stars, 3);
});

test('历史记录：按日期去重、保留最近 30 天', () => {
  const save = new SaveManager(new MemoryStorage());
  save.load();
  for (let i = 0; i < 35; i++) {
    const day = String(i + 1).padStart(2, '0');
    save.recordDailyResult(`2026-01-${day}`, true, 10 + i, 2);
  }
  assert.equal(save.data.dailyHistory.length, 30, '历史最多 30 条');
  assert.equal(save.data.dailyHistory[0].date, '2026-01-35', '按日期倒序，最新的在最前');

  // 同一天重复记录不新增条目
  save.recordDailyResult('2026-01-35', true, 8, 3);
  assert.equal(save.data.dailyHistory.length, 30);
  assert.equal(save.data.dailyHistory[0].steps, 8);
});

test('旧存档没有连续天数与历史字段时安全兼容', () => {
  const raw = {
    version: 1,
    highestUnlocked: 1,
    levels: {},
    daily: { date: '2026-10-29', cleared: true, steps: 12 },
    settings: { sound: true },
    stats: {},
    lastLevel: 1,
  };
  const save = new SaveManager(new MemoryStorage({ [SAVE_KEY]: JSON.stringify(raw) }));
  save.load();
  assert.equal(save.dailyStreak, 0);
  assert.deepEqual(save.data.dailyHistory, []);
  assert.equal(save.data.daily.steps, 12);
});

test('每日挑战端到端：完成后连续天数与历史都会更新', () => {
  const { app, platform, save } = makeApp();
  tapId(app, platform, 'btn.daily');
  solveCurrentLevel(app, platform);
  assert.equal(app.game.status, 'won');

  const key = app.level.dateKey;
  assert.equal(save.dailyStreak, 1);
  assert.equal(save.data.dailyHistory[0].date, key);
  assert.equal(save.data.dailyHistory[0].stars, app.win.stars);
});
