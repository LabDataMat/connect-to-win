import type { Platform } from '../platform/types';
import { PathValidator } from '../core/PathValidator';
import { DIRS, DIR_VECTOR } from '../core/types';
import type { Tile } from '../core/Tile';
import { THEME, computeViewport } from '../ui/theme';
import type { LayoutResult, Rect, RenderEffect, UIElement, ViewState } from '../ui/types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface TileAnim {
  start: number;
  to: number;
}

const ROT_MS = 130;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

/**
 * CanvasRenderer：只负责绘制。
 * 不持有游戏状态，不做任何判定；所有信息来自 ViewState + LayoutResult。
 */
export class CanvasRenderer {
  private anims = new Map<string, TileAnim>();
  private particles: Particle[] = [];
  private lastNow = 0;
  private bgCache: { h: number; grad: CanvasGradient } | null = null;

  constructor(private platform: Platform) {}

  private get ctx(): CanvasRenderingContext2D {
    return this.platform.ctx;
  }

  draw(view: ViewState, layout: LayoutResult, effects: RenderEffect[], now: number, pressedId: string | null): void {
    const s = this.platform.screen();
    const vp = computeViewport(s.width, s.height);
    const h = vp.height;
    const ctx = this.ctx;

    const dt = this.lastNow === 0 ? 16 : Math.min(64, now - this.lastNow);
    this.lastNow = now;

    // 宽屏时内容居中，左右留白由背景与暗化层填充
    const k = vp.scale * s.dpr;
    ctx.setTransform(k, 0, 0, k, vp.offsetX * vp.scale * s.dpr, 0);
    ctx.clearRect(-vp.offsetX, 0, 750 + vp.offsetX * 2, h);

    this.drawBackground(h, now, vp.offsetX);
    this.applyEffects(effects, view, layout, now);

    if (view.screen === 'game' && layout.board && view.game) {
      this.drawBoard(view, layout.board, now);
    }
    for (const el of layout.elements) {
      this.drawElement(el, now, pressedId);
    }
    this.updateAndDrawParticles(dt);
  }

  // ---------- 背景 ----------

  private drawBackground(h: number, now: number, gutter = 0): void {
    const ctx = this.ctx;
    if (!this.bgCache || this.bgCache.h !== h) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, THEME.color.bgTop);
      grad.addColorStop(1, THEME.color.bgBottom);
      this.bgCache = { h, grad };
    }
    ctx.fillStyle = this.bgCache.grad;
    ctx.fillRect(-gutter, 0, 750 + gutter * 2, h);

    // 装饰性电路纹理（固定图案，不随帧变化）
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#2F5478';
    ctx.lineWidth = 2;
    const paths: [number, number, number, number][] = [
      [-40, 150, 120, 150],
      [120, 150, 120, 260],
      [630, 320, 790, 320],
      [630, 320, 630, 210],
      [-30, 980, 90, 980],
      [90, 980, 90, 1080],
      [660, 1180, 790, 1180],
    ];
    for (const [x1, y1, x2, y2] of paths) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x2, y2, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#2F5478';
      ctx.fill();
    }
    // 缓慢移动的光点，增加“通电”氛围
    const pulse = (now / 2600) % 1;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = THEME.color.wireActive;
    ctx.beginPath();
    ctx.arc(120, 150 + 110 * pulse, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 宽屏留白区暗化 + 内容区边界线，突出中间的游戏区域
    if (gutter > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(3,7,14,0.55)';
      ctx.fillRect(-gutter, 0, gutter, h);
      ctx.fillRect(750, 0, gutter, h);
      ctx.strokeStyle = 'rgba(96,140,190,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, h);
      ctx.moveTo(750, 0);
      ctx.lineTo(750, h);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 特效 ----------

  private applyEffects(effects: RenderEffect[], view: ViewState, layout: LayoutResult, now: number): void {
    for (const e of effects) {
      if (e.type === 'rotate' && e.x !== undefined && e.y !== undefined) {
        const tile = view.game?.board.tileAt(e.x, e.y);
        if (tile) this.anims.set(`${e.x},${e.y}`, { start: now, to: tile.rotation });
      } else if (e.type === 'win' && layout.board && view.level) {
        const b = layout.board;
        const tileSize = b.w / view.level.width;
        const gx = b.x + (view.level.goal.x + 0.5) * tileSize;
        const gy = b.y + (view.level.goal.y + 0.5) * tileSize;
        this.spawnBurst(gx, gy);
      }
    }
    // 清理过期动画
    if (this.anims.size > 0) {
      for (const [k, a] of this.anims) {
        if (now - a.start > ROT_MS + 40) this.anims.delete(k);
      }
    }
  }

  private spawnBurst(cx: number, cy: number): void {
    const colors = [THEME.color.goal, THEME.color.warn, THEME.color.wireActive, '#FFFFFF'];
    for (let i = 0; i < 34; i++) {
      const angle = (Math.PI * 2 * i) / 34 + Math.random() * 0.3;
      const speed = 0.12 + Math.random() * 0.28;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.12,
        life: 0,
        maxLife: 700 + Math.random() * 400,
        size: 4 + Math.random() * 5,
        color: colors[i % colors.length],
      });
    }
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }

  private updateAndDrawParticles(dt: number): void {
    if (this.particles.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.0006 * dt;
      const alpha = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 棋盘 ----------

  private drawBoard(view: ViewState, board: Rect, now: number): void {
    const level = view.level;
    const game = view.game;
    if (!level || !game) return;
    const ctx = this.ctx;
    const tileSize = board.w / level.width;

    // 棋盘底板
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    roundRectPath(ctx, board.x - 16, board.y - 16, board.w + 32, board.h + 32, 30);
    ctx.fillStyle = 'rgba(8,18,32,0.72)';
    ctx.fill();
    ctx.restore();
    roundRectPath(ctx, board.x - 16, board.y - 16, board.w + 32, board.h + 32, 30);
    ctx.strokeStyle = 'rgba(80,130,180,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const energized = PathValidator.reachableFromStart(game.board);
    const solved = game.status === 'won';

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const tile = game.board.tileAt(x, y);
        const r: Rect = { x: board.x + x * tileSize, y: board.y + y * tileSize, w: tileSize, h: tileSize };
        if (!tile) {
          this.drawVoidSlot(r);
          continue;
        }
        this.drawTile(tile, r, energized.has(`${x},${y}`), solved, now);
      }
    }

    // 提示：解路径高亮（半透明填充 + 描边，避免仅靠闪烁传达信息）
    if (view.hintTiles.size > 0) {
      const pulse = 0.55 + 0.25 * Math.sin(now / 220);
      ctx.save();
      for (const p of level.solutionPath) {
        const r: Rect = { x: board.x + p.x * tileSize, y: board.y + p.y * tileSize, w: tileSize, h: tileSize };
        roundRectPath(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, tileSize * 0.2);
        ctx.fillStyle = `rgba(47,211,180,${(0.14 * pulse).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(123,247,217,${pulse.toFixed(3)})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** 空格（不可放置方块）的浅槽，用于表达网格结构 */
  private drawVoidSlot(r: Rect): void {
    const ctx = this.ctx;
    const size = Math.min(r.w, r.h);
    const pad = size * 0.09;
    ctx.save();
    ctx.globalAlpha = 0.5;
    roundRectPath(ctx, r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2, size * 0.16);
    ctx.fillStyle = 'rgba(10,20,34,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,84,112,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawTile(tile: Tile, r: Rect, active: boolean, solved: boolean, now: number): void {
    const ctx = this.ctx;
    const size = Math.min(r.w, r.h);
    const pad = size * 0.05;
    const inner: Rect = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;

    const isStart = tile.kind === 'start';
    const isGoal = tile.kind === 'goal';

    // 方块底色
    roundRectPath(ctx, inner.x, inner.y, inner.w, inner.h, size * 0.18);
    ctx.fillStyle = isStart ? '#2B2416' : isGoal ? '#2A1A26' : active ? THEME.color.tileBgAlt : THEME.color.tileBg;
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(123,247,217,0.55)' : THEME.color.tileBorder;
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.stroke();

    // 旋转动画角度
    const anim = this.anims.get(`${tile.x},${tile.y}`);
    let angle = (tile.rotation * Math.PI) / 2;
    if (anim) {
      const p = Math.min(1, Math.max(0, (now - anim.start) / ROT_MS));
      const eased = 1 - Math.pow(1 - p, 3);
      angle = (anim.to * Math.PI) / 2 - (Math.PI / 2) * (1 - eased);
    }

    const wireColor = active ? THEME.color.wireActive : solved ? THEME.color.wire : THEME.color.wireDead;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineWidth = size * 0.13;
    ctx.strokeStyle = wireColor;
    if (active) {
      ctx.shadowColor = 'rgba(123,247,217,0.75)';
      ctx.shadowBlur = 14;
    }
    for (const d of DIRS) {
      if ((tile.dirs & d) === 0) continue;
      const v = DIR_VECTOR[d];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(v.dx * (size / 2), v.dy * (size / 2));
      ctx.stroke();
    }
    ctx.restore();

    // 中心枢纽
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = isStart ? THEME.color.start : isGoal ? THEME.color.goal : wireColor;
    if (active) {
      ctx.shadowColor = isStart ? 'rgba(255,200,87,0.8)' : isGoal ? 'rgba(255,107,138,0.8)' : 'rgba(123,247,217,0.8)';
      ctx.shadowBlur = 16;
    }
    ctx.fill();
    ctx.restore();

    if (isStart) this.drawBolt(cx, cy, size * 0.5);
    if (isGoal) this.drawGoalIcon(cx, cy, size * 0.5, active, now, solved);
  }

  private drawBolt(cx: number, cy: number, s: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.1, cy - s * 0.42);
    ctx.lineTo(cx - s * 0.24, cy + s * 0.04);
    ctx.lineTo(cx - s * 0.02, cy + s * 0.04);
    ctx.lineTo(cx - s * 0.08, cy + s * 0.42);
    ctx.lineTo(cx + s * 0.26, cy - s * 0.08);
    ctx.lineTo(cx + s * 0.02, cy - s * 0.08);
    ctx.closePath();
    ctx.fillStyle = THEME.color.start;
    ctx.fill();
    ctx.restore();
  }

  private drawGoalIcon(cx: number, cy: number, s: number, active: boolean, now: number, solved: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = active ? THEME.color.goalLit : THEME.color.goal;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = active ? THEME.color.goalLit : THEME.color.goal;
    ctx.fill();
    if (solved) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 200);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = THEME.color.goalLit;
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42);
        ctx.lineTo(cx + Math.cos(a) * s * 0.56, cy + Math.sin(a) * s * 0.56);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- 元素 ----------

  private drawElement(el: UIElement, now: number, pressedId: string | null): void {
    const ctx = this.ctx;
    const r = el.rect;
    switch (el.kind) {
      case 'cell':
        return;
      case 'panel': {
        if (el.id === 'modal.overlay') {
          ctx.fillStyle = THEME.color.overlay;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          return;
        }
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 16;
        roundRectPath(ctx, r.x, r.y, r.w, r.h, THEME.radius.panel);
        ctx.fillStyle = THEME.color.panel;
        ctx.fill();
        ctx.restore();
        roundRectPath(ctx, r.x, r.y, r.w, r.h, THEME.radius.panel);
        ctx.strokeStyle = THEME.color.panelBorder;
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }
      case 'button': {
        const pressed = pressedId === el.id;
        ctx.save();
        if (pressed) {
          ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
          ctx.scale(0.97, 0.97);
          ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        }
        const radius = Math.min(THEME.radius.button, r.h / 2);
        roundRectPath(ctx, r.x, r.y, r.w, r.h, radius);
        if (el.variant === 'primary') {
          const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
          grad.addColorStop(0, '#45E6C7');
          grad.addColorStop(1, THEME.color.primaryDark);
          ctx.fillStyle = grad;
          ctx.fill();
        } else if (el.variant === 'danger') {
          ctx.fillStyle = 'rgba(255,107,122,0.14)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,107,122,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (el.variant === 'plain') {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fill();
        } else {
          ctx.fillStyle = THEME.color.ghost;
          ctx.fill();
          ctx.strokeStyle = THEME.color.ghostBorder;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();

        const color =
          el.variant === 'primary' ? THEME.color.primaryText : el.variant === 'danger' ? THEME.color.danger : THEME.color.text;
        this.text(el.label ?? '', r, el.fontSize ?? THEME.font.body, color, el.variant === 'primary');
        return;
      }
      case 'text': {
        if (el.id === 'toast') {
          const tw = Math.min(660, Math.max(320, (el.label?.length ?? 0) * 30 + 70));
          const tx = (750 - tw) / 2;
          roundRectPath(ctx, tx, r.y, tw, r.h, r.h / 2);
          ctx.fillStyle = 'rgba(6,14,26,0.92)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,170,210,0.35)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          this.text(el.label ?? '', { x: tx, y: r.y, w: tw, h: r.h }, THEME.font.small, THEME.color.text, false);
          return;
        }
        this.text(el.label ?? '', r, el.fontSize ?? THEME.font.body, el.color ?? THEME.color.text, el.bold === true, el.align);
        return;
      }
      case 'levelNode': {
        const locked = el.locked === true;
        const cleared = el.cleared === true;
        roundRectPath(ctx, r.x, r.y, r.w, r.h, THEME.radius.node);
        ctx.fillStyle = locked ? THEME.color.locked : cleared ? 'rgba(47,211,180,0.14)' : THEME.color.tileBg;
        ctx.fill();
        ctx.strokeStyle = locked ? 'rgba(90,120,150,0.25)' : cleared ? THEME.color.primary : THEME.color.tileBorder;
        ctx.lineWidth = cleared ? 3 : 2;
        ctx.stroke();

        const numColor = locked ? THEME.color.textDim : cleared ? THEME.color.primary : THEME.color.text;
        ctx.save();
        ctx.font = `600 40px ${THEME.font.family}`;
        ctx.fillStyle = numColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label ?? '', r.x + r.w / 2, r.y + r.h / 2 - (el.sub ? 10 : 0));
        if (el.sub) {
          ctx.font = `400 22px ${THEME.font.family}`;
          ctx.fillStyle = locked ? THEME.color.textDim : THEME.color.textMuted;
          ctx.fillText(el.sub, r.x + r.w / 2, r.y + r.h - 26);
        }
        ctx.restore();

        if (cleared) {
          ctx.save();
          ctx.strokeStyle = THEME.color.primary;
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(r.x + r.w - 30, r.y + r.h - 26);
          ctx.lineTo(r.x + r.w - 22, r.y + r.h - 18);
          ctx.lineTo(r.x + r.w - 10, r.y + r.h - 34);
          ctx.stroke();
          ctx.restore();
        }
        return;
      }
      case 'icon': {
        this.drawLogo(r, now);
        return;
      }
      default:
        return;
    }
  }

  private drawLogo(r: Rect, now: number): void {
    const ctx = this.ctx;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const size = Math.min(r.w, r.h);
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, size * 0.28);
    const grad = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    grad.addColorStop(0, 'rgba(47,211,180,0.22)');
    grad.addColorStop(1, 'rgba(60,120,220,0.18)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(123,247,217,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = THEME.color.wireActive;
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(123,247,217,0.6)';
    ctx.shadowBlur = 12 + 6 * Math.sin(now / 500);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.3, cy);
    ctx.lineTo(cx - size * 0.08, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.08, cy);
    ctx.lineTo(cx + size * 0.3, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - size * 0.3, cy, size * 0.05, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.3, cy, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = THEME.color.start;
    ctx.fill();
    ctx.restore();
    this.drawBolt(cx, cy, size * 0.62);
  }

  private text(
    label: string,
    r: Rect,
    size: number,
    color: string,
    bold = false,
    align: 'center' | 'left' = 'center'
  ): void {
    if (!label) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${bold ? '600 ' : '400 '}${size}px ${THEME.font.family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align === 'left' ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    const x = align === 'left' ? r.x : r.x + r.w / 2;
    ctx.fillText(label, x, r.y + r.h / 2);
    ctx.restore();
  }
}
