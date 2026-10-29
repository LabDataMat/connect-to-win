/**
 * 关卡生成工具：生成 30 个固定关卡并写入 src/data/levels.ts
 * 运行：npm run levels
 *
 * 关卡不是随机堆砌：每关显式指定网格尺寸、解路径长度区间、干扰块数量与步数冗余，
 * 生成后由 PathValidator 逐关校验（存在合法解 / 初始未通关 / 步数上限足够）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateLevel } from '../src/core/LevelGenerator';
import { PathValidator } from '../src/core/PathValidator';
import { hashString } from '../src/core/LevelGenerator';
import type { LevelData } from '../src/core/types';

// 工具会被 esbuild 打包到 build/tools，因此以工作目录（项目根）为基准
const root = process.cwd();

interface LevelPlan {
  w: number;
  h: number;
  min: number;
  max: number;
  decoys: number;
  slack: number;
  diff: number;
  name: string;
}

const PLANS: LevelPlan[] = [
  { w: 3, h: 3, min: 4, max: 5, decoys: 2, slack: 6, diff: 1, name: '第一次通电' },
  { w: 3, h: 3, min: 4, max: 5, decoys: 2, slack: 5, diff: 1, name: '两根导线' },
  { w: 4, h: 3, min: 5, max: 6, decoys: 3, slack: 5, diff: 1, name: '绕个弯' },
  { w: 4, h: 4, min: 6, max: 7, decoys: 5, slack: 4, diff: 2, name: '多出来的接口' },
  { w: 4, h: 4, min: 6, max: 8, decoys: 5, slack: 4, diff: 2, name: '小方阵' },
  { w: 5, h: 4, min: 7, max: 9, decoys: 7, slack: 4, diff: 2, name: '干扰项' },
  { w: 5, h: 4, min: 8, max: 10, decoys: 8, slack: 3, diff: 2, name: '电流回路' },
  { w: 5, h: 5, min: 8, max: 10, decoys: 12, slack: 3, diff: 3, name: '横向布线' },
  { w: 5, h: 5, min: 9, max: 11, decoys: 11, slack: 3, diff: 3, name: '交错线缆' },
  { w: 5, h: 5, min: 10, max: 12, decoys: 12, slack: 3, diff: 3, name: '十格之内' },
  { w: 5, h: 5, min: 10, max: 12, decoys: 13, slack: 3, diff: 3, name: '三通分流' },
  { w: 6, h: 5, min: 11, max: 13, decoys: 15, slack: 3, diff: 3, name: '死路陷阱' },
  { w: 6, h: 5, min: 11, max: 14, decoys: 14, slack: 2, diff: 3, name: '窄路' },
  { w: 6, h: 6, min: 12, max: 15, decoys: 18, slack: 2, diff: 4, name: '电闸' },
  { w: 6, h: 6, min: 13, max: 16, decoys: 18, slack: 2, diff: 4, name: '满载' },
  { w: 6, h: 6, min: 13, max: 16, decoys: 18, slack: 2, diff: 4, name: '宽屏电网' },
  { w: 6, h: 6, min: 14, max: 17, decoys: 17, slack: 2, diff: 4, name: '回路分叉' },
  { w: 6, h: 6, min: 14, max: 17, decoys: 18, slack: 2, diff: 4, name: '静默电流' },
  { w: 7, h: 6, min: 15, max: 18, decoys: 22, slack: 2, diff: 4, name: '网格迷宫' },
  { w: 7, h: 6, min: 15, max: 19, decoys: 22, slack: 2, diff: 4, name: '过载' },
  { w: 7, h: 6, min: 16, max: 19, decoys: 23, slack: 2, diff: 5, name: '保险丝' },
  { w: 7, h: 7, min: 17, max: 20, decoys: 28, slack: 2, diff: 5, name: '紧凑布线' },
  { w: 7, h: 7, min: 17, max: 20, decoys: 28, slack: 2, diff: 5, name: '脉冲' },
  { w: 7, h: 7, min: 18, max: 21, decoys: 27, slack: 2, diff: 5, name: '高压区' },
  { w: 8, h: 7, min: 18, max: 22, decoys: 33, slack: 2, diff: 5, name: '主干线' },
  { w: 8, h: 7, min: 19, max: 23, decoys: 32, slack: 2, diff: 5, name: '并网' },
  { w: 8, h: 7, min: 20, max: 24, decoys: 31, slack: 2, diff: 5, name: '变压器' },
  { w: 8, h: 8, min: 20, max: 24, decoys: 38, slack: 2, diff: 5, name: '八乘八' },
  { w: 8, h: 8, min: 21, max: 25, decoys: 37, slack: 2, diff: 5, name: '城市电网' },
  { w: 8, h: 8, min: 22, max: 28, decoys: 35, slack: 2, diff: 5, name: '接通就赢' },
];

function build(): LevelData[] {
  const levels: LevelData[] = [];
  let prevPath = 0;
  let prevCost = 0;
  let prevArea = 0;

  for (let i = 0; i < PLANS.length; i++) {
    const plan = PLANS[i];
    const id = i + 1;
    const area = plan.w * plan.h;
    if (area < prevArea) throw new Error(`关卡 ${id} 网格面积小于上一关`);

    let chosen: { level: LevelData; pathLength: number; cost: number } | null = null;
    // 用不同种子重试，直到满足难度曲线约束（路径不缩短、参考步数不下降、单关增幅受控）
    for (let k = 0; k < 400 && !chosen; k++) {
      const level = generateLevel({
        seed: hashString(`connect-to-win:level:${id}:${k}`),
        width: plan.w,
        height: plan.h,
        minPath: plan.min,
        maxPath: plan.max,
        decoys: plan.decoys,
        slack: plan.slack,
        id,
        name: plan.name,
        difficulty: plan.diff,
      });
      const check = PathValidator.validateLevel(level);
      if (!check.ok) continue;
      if (check.pathLength < prevPath) continue;
      if (check.solutionCost < prevCost) continue;
      if (check.solutionCost > prevCost + 12) continue;
      chosen = { level, pathLength: check.pathLength, cost: check.solutionCost };
    }
    if (!chosen) throw new Error(`关卡 ${id} 在约束下生成失败`);

    prevPath = chosen.pathLength;
    prevCost = chosen.cost;
    prevArea = area;
    levels.push(chosen.level);
    console.log(
      `L${String(id).padStart(2, '0')} ${plan.w}x${plan.h} 路径${chosen.pathLength} 成本${chosen.cost} 上限${chosen.level.stepLimit} 干扰${plan.decoys} ${plan.name}`
    );
  }
  return levels;
}

const levels = build();
const outDir = resolve(root, 'src/data');
mkdirSync(outDir, { recursive: true });
const body = JSON.stringify(levels, null, 0);
writeFileSync(resolve(outDir, 'levels.json'), body, 'utf8');
console.log(`\n已写入 src/data/levels.json，共 ${levels.length} 关，约 ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`);
