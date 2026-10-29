import { GAME_CONFIG } from '../config';
import { THEME } from './theme';
import type { Action, LayoutResult, Rect, UIElement, ViewState } from './types';

export interface LayoutEnv {
  /** 设计单位下的屏幕宽高（宽固定 750） */
  w: number;
  h: number;
  /** 安全区（设计单位） */
  safeTop: number;
  safeBottom: number;
}

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

function centerX(w: number): number {
  return (750 - w) / 2;
}

function button(
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  action: Action,
  variant: UIElement['variant'] = 'ghost',
  extra: Partial<UIElement> = {}
): UIElement {
  return { id, kind: 'button', rect: rect(x, y, w, h), label, action, variant, ...extra };
}

function text(
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  extra: Partial<UIElement> = {}
): UIElement {
  return { id, kind: 'text', rect: rect(x, y, w, h), label, fontSize, align: 'center', ...extra };
}

function panel(id: string, r: Rect): UIElement {
  return { id, kind: 'panel', rect: r };
}

/** 棋盘区域（供布局与渲染共用） */
export function computeBoardRect(
  cols: number,
  rows: number,
  env: LayoutEnv,
  bandTop: number,
  bandBottom: number
): Rect {
  const margin = 34;
  const availW = env.w - margin * 2;
  const availH = Math.max(120, bandBottom - bandTop);
  const tile = Math.min(availW / cols, availH / rows);
  const bw = tile * cols;
  const bh = tile * rows;
  return rect((env.w - bw) / 2, bandTop + (availH - bh) / 2, bw, bh);
}

function buildHome(view: ViewState, env: LayoutEnv): UIElement[] {
  const els: UIElement[] = [];
  const { h, safeTop, safeBottom } = env;
  const topY = Math.max(safeTop + 40, h * 0.1);

  els.push({ id: 'logo', kind: 'icon', rect: rect(centerX(140), topY, 140, 140), label: 'logo' });
  els.push(text('title', '接通就赢', 0, topY + 160, 750, 110, THEME.font.title, { bold: true }));
  els.push(text('subtitle', '旋转电路方块，让电流从起点流向终点', 0, topY + 268, 750, 44, THEME.font.body, {
    color: THEME.color.textMuted,
  }));

  const cleared = view.save.highestUnlocked;
  const playLabel = cleared > 1 ? `继续第 ${Math.min(cleared, view.levelCount)} 关` : '开始游戏';
  // 三个主按钮整体高度固定，按屏幕高度自适应，避免矮屏/平板重叠
  const blockH = 366;
  const bottomReserve = 200;
  const maxPlayY = h - safeBottom - bottomReserve - blockH;
  const playY = Math.max(topY + 330, Math.min(h * 0.48, maxPlayY));
  els.push(button('btn.play', playLabel, centerX(480), playY, 480, 116, { type: 'selectLevel', id: Math.min(cleared, view.levelCount) }, 'primary', {
    fontSize: THEME.font.h2,
  }));

  const dailyDone = view.dailyDone;
  els.push(
    button('btn.daily', dailyDone ? '每日挑战（今日已完成）' : '每日挑战', centerX(480), playY + 146, 480, 100, { type: 'openDaily' }, 'ghost', {
      fontSize: THEME.font.body,
    })
  );
  els.push(button('btn.levels', '选择关卡', centerX(480), playY + 266, 480, 100, { type: 'openLevels' }, 'ghost', {
    fontSize: THEME.font.body,
  }));

  els.push(button('btn.settings', '设置', 750 - 40 - 100, safeTop + 30, 100, 76, { type: 'openSettings' }, 'plain', {
    fontSize: THEME.font.small,
  }));

  const clearedCount = Object.values(view.save.levels).filter((l) => l.cleared).length;
  const totalStars = Object.values(view.save.levels).reduce((sum, l) => sum + (l.stars || 0), 0);
  const progress = `已通关 ${clearedCount} / ${view.levelCount} · ★ ${totalStars} / ${view.levelCount * 3}`;
  els.push(text('progress', progress, 0, h - safeBottom - 168, 750, 36, THEME.font.small, { color: THEME.color.textDim }));
  els.push(button('btn.share', '分享给好友', centerX(220), h - safeBottom - 116, 220, 68, { type: 'share' }, 'plain', {
    fontSize: THEME.font.small,
  }));
  els.push(text('footer', `v${GAME_CONFIG.version} · 无需联网`, 0, h - safeBottom - 42, 750, 32, THEME.font.tiny, { color: THEME.color.textDim }));

  return els;
}

function buildLevels(view: ViewState, env: LayoutEnv): UIElement[] {
  const els: UIElement[] = [];
  const { h, safeTop, safeBottom } = env;

  els.push(button('btn.back', '返回', 28, safeTop + 20, 110, 78, { type: 'back' }, 'plain', { fontSize: THEME.font.small }));
  els.push(text('levels.title', '选择关卡', 0, safeTop + 28, 750, 62, THEME.font.h1, { bold: true }));
  els.push(
    text('levels.sub', `已通关 ${Object.values(view.save.levels).filter((l) => l.cleared).length} / ${view.levelCount}`, 0, safeTop + 96, 750, 40, THEME.font.small, {
      color: THEME.color.textMuted,
    })
  );

  const cols = 5;
  const nodeW = 108;
  const nodeH = 118;
  const gapX = 22;
  const gapY = 24;
  const rows = Math.ceil(view.levelCount / cols);
  const gridW = cols * nodeW + (cols - 1) * gapX;
  const gridH = rows * nodeH + (rows - 1) * gapY;
  const x0 = (750 - gridW) / 2;
  const minY = safeTop + 170;
  const maxY = h - safeBottom - gridH - 40;
  const y0 = Math.max(minY, Math.min(maxY, (h - gridH) / 2 + 30));

  for (let i = 0; i < view.levelCount; i++) {
    const id = i + 1;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = x0 + col * (nodeW + gapX);
    const y = y0 + row * (nodeH + gapY);
    const unlocked = id <= Math.max(1, view.save.highestUnlocked);
    const cleared = view.save.levels[String(id)]?.cleared === true;
    els.push({
      id: `level.${id}`,
      kind: 'levelNode',
      rect: rect(x, y, nodeW, nodeH),
      label: String(id),
      sub: cleared ? '' : unlocked ? '' : '未解锁',
      stars: cleared ? view.save.levels[String(id)]?.stars ?? 1 : 0,
      action: unlocked ? { type: 'selectLevel', id } : undefined,
      disabled: !unlocked,
      locked: !unlocked,
      cleared,
      value: 0,
    });
  }

  return els;
}

function buildGame(view: ViewState, env: LayoutEnv): LayoutResult {
  const els: UIElement[] = [];
  const { h, safeTop, safeBottom } = env;
  const level = view.level!;
  const game = view.game!;

  els.push(button('btn.back', '返回', 24, safeTop + 16, 104, 76, { type: 'back' }, 'plain', { fontSize: THEME.font.small }));

  const title = view.dailyMode ? `每日挑战 ${view.dailyKey.slice(5)}` : `第 ${level.id} 关 · ${level.name}`;
  els.push(text('game.title', title, 130, safeTop + 20, 490, 56, 34, { bold: true }));
  els.push(
    text('game.steps', `步数 ${game.moves} / ${game.stepLimit}`, 130, safeTop + 74, 490, 40, THEME.font.small, {
      color: game.movesLeft <= 3 ? THEME.color.warn : THEME.color.textMuted,
    })
  );

  const bandTop = safeTop + 150;
  const bandBottom = h - safeBottom - 200;
  const board = computeBoardRect(level.width, level.height, env, bandTop, bandBottom);
  const tile = board.w / level.width;

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const cell = level.cells[y * level.width + x];
      if (!cell) continue;
      els.push({
        id: `cell.${x}.${y}`,
        kind: 'cell',
        rect: rect(board.x + x * tile + 2, board.y + y * tile + 2, tile - 4, tile - 4),
        action: { type: 'cell', x, y },
      });
    }
  }

  const btnW = 200;
  const btnH = 92;
  const gap = 34;
  const totalW = btnW * 3 + gap * 2;
  const startX = (750 - totalW) / 2;
  const barY = h - safeBottom - 138;
  els.push(button('btn.retry', '重试', startX, barY, btnW, btnH, { type: 'retry' }, 'ghost', { fontSize: THEME.font.body }));
  els.push(button('btn.hint', '提示', startX + btnW + gap, barY, btnW, btnH, { type: 'hint' }, 'ghost', { fontSize: THEME.font.body }));
  els.push(button('btn.pause', '暂停', startX + (btnW + gap) * 2, barY, btnW, btnH, { type: 'pause' }, 'ghost', { fontSize: THEME.font.body }));

  return { elements: els, board };
}

function buildSettings(view: ViewState, env: LayoutEnv): UIElement[] {
  const els: UIElement[] = [];
  const { h, safeTop, safeBottom } = env;
  const x = centerX(620);
  let y = safeTop + 190;

  els.push(button('btn.back', '返回', 28, safeTop + 20, 110, 78, { type: 'back' }, 'plain', { fontSize: THEME.font.small }));
  els.push(text('settings.title', '设置', 0, safeTop + 28, 750, 62, THEME.font.h1, { bold: true }));

  els.push(
    button('btn.sound', view.save.settings.sound ? '音效：开' : '音效：关', x, y, 620, 100, { type: 'toggleSound' }, 'ghost', {
      fontSize: THEME.font.body,
    })
  );
  y += 120;
  els.push(button('btn.about', '关于与隐私', x, y, 620, 100, { type: 'about' }, 'ghost', { fontSize: THEME.font.body }));
  y += 120;
  els.push(button('btn.clear', '清除本地进度', x, y, 620, 100, { type: 'clearProgress' }, 'danger', { fontSize: THEME.font.body }));
  y += 150;

  const stats = view.save.stats;
  const lines = [
    `累计通关：${stats.totalClears} 次`,
    `累计旋转：${stats.totalMoves} 步`,
    `使用提示：${stats.hintsUsed} 次`,
    `游戏时长：${Math.floor(stats.playSeconds / 60)} 分钟`,
  ];
  lines.forEach((line, i) => {
    els.push(text(`stats.${i}`, line, x, y + i * 46, 620, 40, THEME.font.small, { color: THEME.color.textMuted, align: 'left' }));
  });

  els.push(
    text('settings.note', '本游戏不收集个人信息，进度仅保存在本机。', 0, h - safeBottom - 70, 750, 40, THEME.font.tiny, {
      color: THEME.color.textDim,
    })
  );

  return els;
}

function modalBase(env: LayoutEnv, panelH: number): { els: UIElement[]; panelRect: Rect } {
  const els: UIElement[] = [];
  const panelW = 600;
  const r = rect((750 - panelW) / 2, (env.h - panelH) / 2, panelW, panelH);
  els.push({ id: 'modal.overlay', kind: 'panel', rect: rect(0, 0, 750, env.h), layer: 'modal' });
  els.push({ ...panel('modal.panel', r), layer: 'modal' });
  return { els, panelRect: r };
}

function buildModal(view: ViewState, env: LayoutEnv): UIElement[] {
  const els: UIElement[] = [];
  const modal = view.modal;
  if (!modal) return els;

  if (modal === 'pause') {
    const { els: base, panelRect } = modalBase(env, 520);
    els.push(...base);
    els.push({ ...text('modal.title', '已暂停', panelRect.x, panelRect.y + 54, panelRect.w, 60, THEME.font.h1, { bold: true }), layer: 'modal' });
    els.push({
      ...text('modal.sub', '休息一下，电路不会跑掉', panelRect.x, panelRect.y + 124, panelRect.w, 40, THEME.font.small, {
        color: THEME.color.textMuted,
      }),
      layer: 'modal',
    });
    const bx = panelRect.x + 60;
    const bw = panelRect.w - 120;
    els.push({ ...button('btn.resume', '继续游戏', bx, panelRect.y + 200, bw, 96, { type: 'resume' }, 'primary'), layer: 'modal' });
    els.push({ ...button('btn.retry', '重新开始', bx, panelRect.y + 312, bw, 88, { type: 'retry' }, 'ghost'), layer: 'modal' });
    els.push({ ...button('btn.home', '返回首页', bx, panelRect.y + 412, bw, 80, { type: 'home' }, 'plain'), layer: 'modal' });
    return els;
  }

  if (modal === 'win') {
    const win = view.win;
    const { els: base, panelRect } = modalBase(env, win?.daily ? 760 : 700);
    els.push(...base);
    const allDone = win ? !win.hasNext && !win.daily : false;
    const title = allDone ? '全部通关！' : '接通成功';
    els.push({ ...text('modal.title', title, panelRect.x, panelRect.y + 40, panelRect.w, 66, THEME.font.h1, { bold: true }), layer: 'modal' });

    // 三颗星
    const stars = win?.stars ?? 0;
    const starSize = 64;
    const starGap = 18;
    const starTotal = starSize * 3 + starGap * 2;
    const starX = (750 - starTotal) / 2;
    for (let i = 0; i < 3; i++) {
      els.push({
        id: `star.${i}`,
        kind: 'icon',
        rect: rect(starX + i * (starSize + starGap), panelRect.y + 106 + (i === 1 ? -6 : 0), starSize, starSize),
        value: i < stars ? 1 : 0,
        layer: 'modal',
      });
    }

    els.push({
      ...text(
        'modal.sub',
        win ? `${win.daily ? '今日挑战' : '本关'} ${win.steps} 步 · 最优 ${win.minSteps} 步` : '',
        panelRect.x,
        panelRect.y + 182,
        panelRect.w,
        40,
        THEME.font.body,
        { color: THEME.color.textMuted }
      ),
      layer: 'modal',
    });
    els.push({
      ...text(
        'modal.best',
        win
          ? `${win.newStars ? '新纪录！' : '最佳'} ${win.best ?? win.steps} 步${win.unlockedNext ? ' · 已解锁下一关' : ''}`
          : '',
        panelRect.x,
        panelRect.y + 228,
        panelRect.w,
        40,
        THEME.font.small,
        { color: THEME.color.primary }
      ),
      layer: 'modal',
    });
    const bx = panelRect.x + 60;
    const bw = panelRect.w - 120;
    els.push({
      ...button(
        'btn.next',
        allDone ? '返回关卡列表' : win?.daily ? '返回首页' : '下一关',
        bx,
        panelRect.y + 292,
        bw,
        96,
        allDone ? { type: 'openLevels' } : win?.daily ? { type: 'home' } : { type: 'next' },
        'primary',
        { fontSize: THEME.font.h2 }
      ),
      layer: 'modal',
    });
    if (win?.daily) {
      els.push({
        ...button('btn.shareCard', '生成战绩卡', bx, panelRect.y + 400, bw, 86, { type: 'shareCard' }, 'ghost', {
          fontSize: THEME.font.body,
        }),
        layer: 'modal',
      });
      els.push({ ...button('btn.replay', '再玩一次', bx, panelRect.y + 500, bw, 80, { type: 'replay' }, 'plain'), layer: 'modal' });
    } else {
      els.push({ ...button('btn.replay', '再玩一次', bx, panelRect.y + 400, bw, 86, { type: 'replay' }, 'ghost'), layer: 'modal' });
      els.push({ ...button('btn.levels', '关卡列表', bx, panelRect.y + 496, bw, 80, { type: 'openLevels' }, 'plain'), layer: 'modal' });
    }
    return els;
  }

  if (modal === 'lose') {
    const { els: base, panelRect } = modalBase(env, view.adAvailable ? 600 : 500);
    els.push(...base);
    const game = view.game;
    els.push({ ...text('modal.title', '步数用尽', panelRect.x, panelRect.y + 50, panelRect.w, 64, THEME.font.h1, { bold: true }), layer: 'modal' });
    els.push({
      ...text('modal.sub', game ? `已用 ${game.moves} 步，目标 ${game.stepLimit} 步` : '', panelRect.x, panelRect.y + 124, panelRect.w, 40, THEME.font.body, {
        color: THEME.color.textMuted,
      }),
      layer: 'modal',
    });
    const bx = panelRect.x + 60;
    const bw = panelRect.w - 120;
    let y = panelRect.y + 200;
    els.push({ ...button('btn.retry', '再试一次', bx, y, bw, 96, { type: 'retry' }, 'primary'), layer: 'modal' });
    y += 112;
    if (view.adAvailable) {
      els.push({
        ...button('btn.extraAd', '看视频 +3 步', bx, y, bw, 86, { type: 'extraStepsAd' }, 'ghost', { fontSize: THEME.font.body }),
        layer: 'modal',
      });
      y += 102;
    }
    els.push({ ...button('btn.levels', '返回关卡列表', bx, y, bw, 80, { type: 'openLevels' }, 'plain'), layer: 'modal' });
    return els;
  }

  if (modal === 'confirm-clear') {
    const { els: base, panelRect } = modalBase(env, 460);
    els.push(...base);
    els.push({ ...text('modal.title', '清除本地进度？', panelRect.x, panelRect.y + 60, panelRect.w, 60, THEME.font.h2, { bold: true }), layer: 'modal' });
    els.push({
      ...text('modal.sub', '所有通关记录与最佳步数将被删除，无法恢复。', panelRect.x + 40, panelRect.y + 140, panelRect.w - 80, 80, THEME.font.small, {
        color: THEME.color.textMuted,
      }),
      layer: 'modal',
    });
    const bx = panelRect.x + 60;
    const bw = (panelRect.w - 140) / 2;
    els.push({ ...button('btn.cancel', '取消', bx, panelRect.y + 270, bw, 92, { type: 'closeModal' }, 'ghost'), layer: 'modal' });
    els.push({ ...button('btn.confirmClear', '确认清除', bx + bw + 20, panelRect.y + 270, bw, 92, { type: 'confirmClear' }, 'danger'), layer: 'modal' });
    return els;
  }

  // about
  const { els: base, panelRect } = modalBase(env, 640);
  els.push(...base);
  els.push({ ...text('modal.title', '关于与隐私', panelRect.x, panelRect.y + 44, panelRect.w, 60, THEME.font.h2, { bold: true }), layer: 'modal' });
  const lines = [
    '《接通就赢》v0.1.0',
    '一款 2D 电路旋转解谜小游戏。',
    '',
    '· 进度仅保存在本机，不上传服务器',
    '· 不收集任何个人信息',
    '· 音效由程序实时合成，无外部素材',
    '· 广告仅在配置真实广告位后启用',
  ];
  lines.forEach((line, i) => {
    els.push({
      ...text(`about.${i}`, line, panelRect.x + 48, panelRect.y + 126 + i * 46, panelRect.w - 96, 40, THEME.font.small, {
        color: i === 0 ? THEME.color.text : THEME.color.textMuted,
        align: 'left',
      }),
      layer: 'modal',
    });
  });
  els.push({ ...button('btn.close', '知道了', panelRect.x + 60, panelRect.y + 520, panelRect.w - 120, 88, { type: 'closeModal' }, 'primary'), layer: 'modal' });
  return els;
}

export function layout(view: ViewState, env: LayoutEnv): LayoutResult {
  let result: LayoutResult;
  if (view.screen === 'home') result = { elements: buildHome(view, env), board: null };
  else if (view.screen === 'levels') result = { elements: buildLevels(view, env), board: null };
  else if (view.screen === 'settings') result = { elements: buildSettings(view, env), board: null };
  else result = buildGame(view, env);

  const modalEls = buildModal(view, env);
  if (modalEls.length > 0) {
    result = { elements: result.elements.concat(modalEls), board: result.board };
  }

  if (view.toast) {
    const r = rect(75, env.h - env.safeBottom - 260, 600, 74);
    result.elements.push({ id: 'toast', kind: 'text', rect: r, label: view.toast, fontSize: THEME.font.small, layer: 'modal' } as UIElement);
  }

  return result;
}

/** 命中测试：从后往前（后绘制的在上层）；有弹窗时只命中弹窗层 */
export function hitTest(elements: UIElement[], x: number, y: number, modalOpen: boolean): UIElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el.action) continue;
    if (el.disabled) continue;
    if (modalOpen && el.layer !== 'modal') continue;
    const r = el.rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return el;
  }
  return null;
}
