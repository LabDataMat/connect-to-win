import type { StorageLike } from './types';

export const SAVE_KEY = 'connect-to-win.save';
export const SAVE_VERSION = 1;

export interface LevelProgress {
  cleared: boolean;
  bestSteps: number | null;
  /** 最佳星级 0..3（0 表示未通关或旧存档） */
  stars: number;
}

export interface DailyResult {
  date: string;
  cleared: boolean;
  steps: number;
  stars?: number;
}

/** 每日挑战历史记录（只保留最近若干天） */
export interface DailyRecord {
  date: string;
  steps: number;
  stars: number;
}

export const DAILY_HISTORY_LIMIT = 30;

export interface GameSettings {
  sound: boolean;
}

export interface GameStats {
  totalMoves: number;
  totalClears: number;
  hintsUsed: number;
  playSeconds: number;
  sessions: number;
}

export interface SaveData {
  version: number;
  highestUnlocked: number;
  levels: Record<string, LevelProgress>;
  daily: DailyResult | null;
  /** 当前连续完成天数 */
  dailyStreak: number;
  /** 历史最长连续天数 */
  bestDailyStreak: number;
  /** 最近若干天的成绩（按日期倒序） */
  dailyHistory: DailyRecord[];
  settings: GameSettings;
  stats: GameStats;
  lastLevel: number;
}

export interface LoadResult {
  ok: boolean;
  recovered: boolean;
  error?: string;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    highestUnlocked: 1,
    levels: {},
    daily: null,
    dailyStreak: 0,
    bestDailyStreak: 0,
    dailyHistory: [],
    settings: { sound: true },
    stats: { totalMoves: 0, totalClears: 0, hintsUsed: 0, playSeconds: 0, sessions: 0 },
    lastLevel: 1,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toInt(v: unknown, def: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const n = Math.round(v);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * SaveManager：本地持久化。
 * 原则：任何存档异常都不能让游戏无法启动——解析失败、字段缺失、类型错误、存储不可用
 * 都退化为默认值，并返回 recovered 标记。
 */
export class SaveManager {
  private storage: StorageLike | null;
  private key: string;
  private _data: SaveData;
  private _memoryOnly = false;

  constructor(storage: StorageLike | null, key: string = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
    this._data = defaultSave();
  }

  get data(): SaveData {
    return this._data;
  }

  get memoryOnly(): boolean {
    return this._memoryOnly || this.storage === null;
  }

  load(): LoadResult {
    this._data = defaultSave();
    if (!this.storage) {
      this._memoryOnly = true;
      return { ok: false, recovered: true, error: 'storage-unavailable' };
    }
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (e) {
      this._memoryOnly = true;
      return { ok: false, recovered: true, error: `read-failed:${String(e)}` };
    }
    if (raw === null || raw === '') return { ok: true, recovered: false };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this._data = defaultSave();
      return { ok: false, recovered: true, error: 'parse-failed' };
    }
    this._data = this.sanitize(parsed);
    const recovered = !isObject(parsed) || parsed.version !== SAVE_VERSION;
    return { ok: true, recovered };
  }

  /** 把任意输入收敛为合法存档，绝不抛错 */
  private sanitize(input: unknown): SaveData {
    const d = defaultSave();
    if (!isObject(input)) return d;

    d.highestUnlocked = toInt(input.highestUnlocked, 1, 1, 999);
    d.lastLevel = toInt(input.lastLevel, 1, 1, 999);

    if (isObject(input.levels)) {
      for (const [k, v] of Object.entries(input.levels)) {
        const id = Number(k);
        if (!Number.isInteger(id) || id < 1 || id > 999) continue;
        if (!isObject(v)) continue;
        const cleared = v.cleared === true;
        const best = typeof v.bestSteps === 'number' && Number.isFinite(v.bestSteps) && v.bestSteps > 0
          ? Math.round(v.bestSteps)
          : null;
        if (!cleared && best === null) continue;
        // 旧存档没有 stars 字段：已通关的至少给 1 星
        const stars = cleared ? toInt(v.stars, 1, 1, 3) : 0;
        d.levels[String(id)] = { cleared, bestSteps: best, stars };
      }
    }

    if (isObject(input.daily)) {
      const date = typeof input.daily.date === 'string' ? input.daily.date : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        d.daily = {
          date,
          cleared: input.daily.cleared === true,
          steps: toInt(input.daily.steps, 0, 0, 99999),
        };
      }
    }

    d.dailyStreak = toInt(input.dailyStreak, 0, 0, 9999);
    d.bestDailyStreak = toInt(input.bestDailyStreak, d.dailyStreak, 0, 9999);

    if (Array.isArray(input.dailyHistory)) {
      const seen = new Set<string>();
      for (const item of input.dailyHistory) {
        if (!isObject(item)) continue;
        const date = typeof item.date === 'string' ? item.date : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
        seen.add(date);
        d.dailyHistory.push({
          date,
          steps: toInt(item.steps, 0, 0, 99999),
          stars: toInt(item.stars, 1, 0, 3),
        });
        if (d.dailyHistory.length >= DAILY_HISTORY_LIMIT) break;
      }
      d.dailyHistory.sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    if (isObject(input.settings)) {
      d.settings.sound = input.settings.sound !== false;
    }

    if (isObject(input.stats)) {
      d.stats.totalMoves = toInt(input.stats.totalMoves, 0, 0, 1e9);
      d.stats.totalClears = toInt(input.stats.totalClears, 0, 0, 1e9);
      d.stats.hintsUsed = toInt(input.stats.hintsUsed, 0, 0, 1e9);
      d.stats.playSeconds = toInt(input.stats.playSeconds, 0, 0, 1e9);
      d.stats.sessions = toInt(input.stats.sessions, 0, 0, 1e9);
    }

    // 由通关记录反推最高解锁，修复不一致存档
    let highest = 1;
    while (d.levels[String(highest)]?.cleared && highest < 999) highest++;
    d.highestUnlocked = Math.max(d.highestUnlocked, highest);

    return d;
  }

  /** 保存，永不抛错；返回是否写入成功 */
  save(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(this._data));
      return true;
    } catch {
      this._memoryOnly = true;
      return false;
    }
  }

  reset(): void {
    this._data = defaultSave();
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  /** 通关记录；返回是否刷新了最佳步数与是否解锁了下一关 */
  markLevelCleared(
    levelId: number,
    steps: number,
    totalLevels: number,
    stars = 1
  ): { newBest: boolean; unlockedNext: boolean; newStars: boolean; stars: number } {
    const key = String(levelId);
    const prev = this._data.levels[key];
    const newBest = !prev || prev.bestSteps === null || steps < prev.bestSteps;
    const prevStars = prev?.stars ?? 0;
    const nextStars = Math.max(prevStars, Math.min(3, Math.max(0, Math.round(stars))));
    this._data.levels[key] = {
      cleared: true,
      bestSteps: newBest ? steps : prev!.bestSteps,
      stars: nextStars,
    };
    this._data.stats.totalClears += 1;

    let unlockedNext = false;
    if (levelId >= this._data.highestUnlocked && levelId < totalLevels) {
      this._data.highestUnlocked = levelId + 1;
      unlockedNext = true;
    }
    this._data.highestUnlocked = Math.min(Math.max(1, this._data.highestUnlocked), totalLevels);
    return { newBest, unlockedNext, newStars: nextStars > prevStars, stars: nextStars };
  }

  /** 某关最佳星级（0 表示未通关） */
  getStars(levelId: number): number {
    return this._data.levels[String(levelId)]?.stars ?? 0;
  }

  /** 所有关卡星级之和，用于首页进度展示 */
  get totalStars(): number {
    return Object.values(this._data.levels).reduce((sum, l) => sum + (l.stars || 0), 0);
  }

  /**
   * 记录每日挑战结果，并维护连续天数与历史。
   * - 同一天多次挑战：保留更好成绩，连续天数不重复累加
   * - 隔天完成：连续 +1；中断后重新从 1 开始
   */
  recordDailyResult(dateKey: string, cleared: boolean, steps: number, stars = 1): void {
    const prev = this._data.daily;
    const sameDay = prev !== null && prev.date === dateKey;

    if (sameDay) {
      if (cleared && (!prev!.cleared || steps < prev!.steps)) {
        this._data.daily = { date: dateKey, cleared: true, steps, stars };
      }
    } else {
      this._data.daily = { date: dateKey, cleared, steps, stars };
    }

    if (!cleared) return;

    // 连续天数：仅当这一天是「昨天之后的第一天」时才累加
    if (!sameDay) {
      const yesterday = this.addDays(dateKey, -1);
      this._data.dailyStreak = prev && prev.cleared && prev.date === yesterday ? this._data.dailyStreak + 1 : 1;
    } else if (this._data.dailyStreak === 0) {
      this._data.dailyStreak = 1;
    }
    this._data.bestDailyStreak = Math.max(this._data.bestDailyStreak, this._data.dailyStreak);

    // 历史：按日期去重、保留更好成绩、最多 DAILY_HISTORY_LIMIT 条
    const idx = this._data.dailyHistory.findIndex((r) => r.date === dateKey);
    const record: DailyRecord = { date: dateKey, steps, stars };
    if (idx >= 0) {
      const old = this._data.dailyHistory[idx];
      if (steps < old.steps) this._data.dailyHistory[idx] = record;
      else if (stars > old.stars) this._data.dailyHistory[idx] = { ...old, stars };
    } else {
      this._data.dailyHistory.push(record);
    }
    this._data.dailyHistory.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (this._data.dailyHistory.length > DAILY_HISTORY_LIMIT) {
      this._data.dailyHistory.length = DAILY_HISTORY_LIMIT;
    }
  }

  /** 日期加减（与 DailyChallengeManager.addDays 同算法，避免 core 层互相依赖） */
  private addDays(dateKey: string, days: number): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!y || !m || !d) return dateKey;
    const t = Date.UTC(y, m - 1, d) + days * 86400000;
    const dt = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  get dailyStreak(): number {
    return this._data.dailyStreak;
  }

  setSound(on: boolean): void {
    this._data.settings.sound = on;
  }

  setLastLevel(id: number): void {
    this._data.lastLevel = Math.max(1, Math.round(id));
  }

  addStats(partial: Partial<GameStats>): void {
    for (const k of Object.keys(partial) as (keyof GameStats)[]) {
      const v = partial[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        this._data.stats[k] += v;
      }
    }
  }

  get clearedCount(): number {
    return Object.values(this._data.levels).filter((l) => l.cleared).length;
  }

  getBestSteps(levelId: number): number | null {
    return this._data.levels[String(levelId)]?.bestSteps ?? null;
  }

  isCleared(levelId: number): boolean {
    return this._data.levels[String(levelId)]?.cleared === true;
  }
}
