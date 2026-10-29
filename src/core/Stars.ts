/**
 * 星级评价规则。
 *
 * 基准是最优步数（由 OptimalSolver 独立求解得出，不是设计者填的数字）：
 * - 3 星：步数 ≤ 最优步数（等价于找到了最优解）
 * - 2 星：步数 ≤ 最优步数 + 容错（随最优步数按比例放宽，至少 2 步）
 * - 1 星：在步数上限内完成即可
 *
 * 容错比例随难度收紧：早期关卡宽一些，后期关卡更苛刻。
 */
export const MAX_STARS = 3;

/** 2 星容错：最优步数的 20%，最少 2 步 */
export function twoStarSlack(minSteps: number): number {
  if (!Number.isFinite(minSteps) || minSteps <= 0) return 2;
  return Math.max(2, Math.ceil(minSteps * 0.2));
}

export function starThresholds(minSteps: number): { three: number; two: number } {
  const three = Math.max(1, Math.round(minSteps));
  return { three, two: three + twoStarSlack(three) };
}

export function computeStars(steps: number, minSteps: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  if (!Number.isFinite(minSteps) || minSteps <= 0) return 1;
  const { three, two } = starThresholds(minSteps);
  if (steps <= three) return 3;
  if (steps <= two) return 2;
  return 1;
}

export function starLabel(stars: number): string {
  if (stars >= 3) return '完美';
  if (stars === 2) return '不错';
  if (stars === 1) return '通关';
  return '未通关';
}
