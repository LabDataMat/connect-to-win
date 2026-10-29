import { generateDailyLevel } from './LevelGenerator';
import type { LevelData } from './types';

/**
 * DailyChallengeManager：每日挑战。
 * 以北京时间（UTC+8）日期为键，用确定性种子生成谜题，
 * 所有玩家同一天得到完全相同的关卡，无需服务器。
 */
export class DailyChallengeManager {
  private cache = new Map<string, LevelData>();

  /** 由时间戳得到北京时间的日期键 YYYY-MM-DD */
  static dateKeyOf(date: Date = new Date()): string {
    const tzOffsetMs = 8 * 60 * 60 * 1000;
    const d = new Date(date.getTime() + tzOffsetMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 距离下一个自然日（北京时间）的毫秒数，用于“明日再来”倒计时 */
  static msUntilNextDay(date: Date = new Date()): number {
    const tzOffsetMs = 8 * 60 * 60 * 1000;
    const now = date.getTime() + tzOffsetMs;
    const dayMs = 24 * 60 * 60 * 1000;
    return dayMs - (now % dayMs);
  }

  getForDate(dateKey: string): LevelData {
    const cached = this.cache.get(dateKey);
    if (cached) return cached;
    const level = generateDailyLevel(dateKey);
    this.cache.set(dateKey, level);
    return level;
  }

  getToday(now: Date = new Date()): LevelData {
    return this.getForDate(DailyChallengeManager.dateKeyOf(now));
  }
}
