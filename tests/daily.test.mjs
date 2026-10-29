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
