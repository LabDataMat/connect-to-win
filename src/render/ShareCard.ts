/**
 * 每日挑战战绩卡绘制。
 * 纯 Canvas 2D 绘制，不依赖 DOM 或微信 API，因此 Web 与微信小游戏共用同一套代码，
 * 也可以在 node 里用记录型上下文做结构测试。
 */
export interface ShareCardData {
  dateKey: string;
  steps: number;
  minSteps: number;
  stars: number;
  clearedLevels: number;
  totalLevels: number;
}

const W = 750;
const H = 1000;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, filled: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : outer * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#FFD166';
    ctx.shadowColor = 'rgba(255,209,102,0.7)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,205,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** 卡片尺寸固定，便于各平台导出 */
export const SHARE_CARD_SIZE = { width: W, height: H };

export function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData): void {
  // 背景
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#07101E');
  grad.addColorStop(0.55, '#0C1B2E');
  grad.addColorStop(1, '#123049');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 装饰电路线
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#3E7EA8';
  ctx.lineWidth = 3;
  const lines: [number, number, number, number][] = [
    [-20, 120, 150, 120],
    [150, 120, 150, 230],
    [600, 260, 780, 260],
    [600, 260, 600, 140],
    [-10, 860, 120, 860],
    [120, 860, 120, 940],
    [640, 800, 790, 800],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x2, y2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3E7EA8';
    ctx.fill();
  }
  ctx.restore();

  // 顶部品牌
  ctx.fillStyle = '#7BF7D9';
  ctx.font = '600 34px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('接通就赢', W / 2, 96);
  ctx.fillStyle = 'rgba(180,205,230,0.75)';
  ctx.font = '400 24px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('每日挑战 · DAILY CHALLENGE', W / 2, 140);

  // 日期
  ctx.fillStyle = '#EAF3FF';
  ctx.font = '700 76px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(data.dateKey, W / 2, 268);

  // 卡片主体
  roundRect(ctx, 70, 320, 610, 470, 36);
  ctx.fillStyle = 'rgba(18,34,54,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,150,200,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 星级
  const starY = 400;
  const starGap = 110;
  for (let i = 0; i < 3; i++) {
    star(ctx, W / 2 + (i - 1) * starGap, starY, 46, i < data.stars);
  }

  // 步数
  ctx.fillStyle = '#EAF3FF';
  ctx.font = '700 108px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(String(data.steps), W / 2, 590);
  ctx.fillStyle = 'rgba(160,190,220,0.85)';
  ctx.font = '400 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('步完成', W / 2, 636);

  // 与最优解对比
  const diff = data.steps - data.minSteps;
  const compare =
    diff <= 0 ? `最优解 · ${data.minSteps} 步` : `最优解 ${data.minSteps} 步 · 多用 ${diff} 步`;
  ctx.fillStyle = diff <= 0 ? '#7BF7D9' : 'rgba(255,200,120,0.95)';
  ctx.font = '600 30px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(compare, W / 2, 700);

  // 底部说明
  ctx.fillStyle = 'rgba(150,180,210,0.7)';
  ctx.font = '400 26px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('同一天，所有玩家面对同一道题', W / 2, 860);
  ctx.fillStyle = 'rgba(120,150,180,0.55)';
  ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`已通关 ${data.clearedLevels} / ${data.totalLevels} 关`, W / 2, 906);

  // 边框
  roundRect(ctx, 16, 16, W - 32, H - 32, 28);
  ctx.strokeStyle = 'rgba(123,247,217,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
