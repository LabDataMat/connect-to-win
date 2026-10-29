import levelsJson from '../data/levels.json';
import type { LevelData } from './types';

/** 构建期生成的固定关卡数据（只读） */
export const LEVELS = levelsJson as unknown as LevelData[];

/**
 * LevelManager：关卡读取、查询与解锁判断。
 * 关卡数据是构建期生成的固定数据，运行时只读。
 */
export class LevelManager {
  private levels: LevelData[];

  constructor(levels: LevelData[] = LEVELS) {
    this.levels = levels;
  }

  get count(): number {
    return this.levels.length;
  }

  getLevel(id: number): LevelData | null {
    return this.levels.find((l) => l.id === id) ?? null;
  }

  all(): LevelData[] {
    return this.levels;
  }

  /** 关卡是否已解锁：第 1 关默认解锁，其余需要前一关通关 */
  isUnlocked(id: number, highestUnlocked: number): boolean {
    if (id < 1 || id > this.count) return false;
    return id <= Math.max(1, highestUnlocked);
  }

  nextLevelId(id: number): number | null {
    const idx = this.levels.findIndex((l) => l.id === id);
    if (idx < 0) return null;
    return idx + 1 < this.levels.length ? this.levels[idx + 1].id : null;
  }

  prevLevelId(id: number): number | null {
    const idx = this.levels.findIndex((l) => l.id === id);
    if (idx <= 0) return null;
    return this.levels[idx - 1].id;
  }

  /** 根据进度推算最高解锁关卡（与存档独立，用于修复存档） */
  computeHighestUnlocked(clearedIds: number[]): number {
    const cleared = new Set(clearedIds);
    let h = 1;
    while (cleared.has(h) && h < this.count) h++;
    return cleared.has(h) ? h : h;
  }
}
