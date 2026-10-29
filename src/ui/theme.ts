/** 统一视觉规范：颜色、字号、间距、圆角 */
export const THEME = {
  color: {
    bgTop: '#081120',
    bgBottom: '#132740',
    panel: 'rgba(18,31,51,0.97)',
    panelBorder: 'rgba(96,140,190,0.32)',
    text: '#E9F2FF',
    textMuted: '#8CA3C2',
    textDim: '#5C7392',
    primary: '#2FD3B4',
    primaryDark: '#17A98F',
    primaryText: '#04241F',
    ghost: 'rgba(255,255,255,0.06)',
    ghostBorder: 'rgba(140,175,215,0.34)',
    danger: '#FF6B7A',
    warn: '#FFC857',
    tileBg: '#14263D',
    tileBgAlt: '#182C46',
    tileBorder: '#2A4364',
    wire: '#3BB9A4',
    wireActive: '#7BF7D9',
    wireDead: '#3E5A78',
    start: '#FFC857',
    goal: '#FF6B8A',
    goalLit: '#FFE29A',
    locked: '#22334A',
    overlay: 'rgba(4,9,18,0.72)',
    shadow: 'rgba(0,0,0,0.45)',
  },
  font: {
    family: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
    title: 92,
    h1: 56,
    h2: 40,
    body: 32,
    small: 26,
    tiny: 22,
  },
  radius: {
    panel: 36,
    button: 26,
    tile: 16,
    node: 22,
    pill: 40,
  },
  space: {
    page: 40,
    gap: 24,
  },
} as const;

export const DESIGN_WIDTH = 750;

/**
 * 最小设计高度：界面布局按 750 × 1240 起算。
 * 屏幕比 750:1240 更「宽」时（桌面浏览器、横屏、平板），按高度约束缩放并左右留白，
 * 保证任何窗口比例下都能看到完整界面，而不是把内容挤出屏幕。
 */
export const MIN_DESIGN_HEIGHT = 1240;

export interface Viewport {
  /** 设计单位 → CSS 像素 */
  scale: number;
  /** 设计单位下的内容宽（恒为 750） */
  width: number;
  /** 设计单位下的内容高（≥ MIN_DESIGN_HEIGHT） */
  height: number;
  /** 内容区左右留白（设计单位），宽屏时 > 0 */
  offsetX: number;
}

export function computeViewport(screenWidth: number, screenHeight: number): Viewport {
  const sw = Math.max(1, screenWidth);
  const sh = Math.max(1, screenHeight);
  const scale = Math.min(sw / DESIGN_WIDTH, sh / MIN_DESIGN_HEIGHT);
  const height = sh / scale;
  const offsetX = Math.max(0, (sw - DESIGN_WIDTH * scale) / 2 / scale);
  return { scale, width: DESIGN_WIDTH, height, offsetX };
}

/** 设计单位下的屏幕尺寸（宽度恒为 750，高度按视口计算） */
export function designSize(screenWidth: number, screenHeight: number): { w: number; h: number } {
  const vp = computeViewport(screenWidth, screenHeight);
  return { w: DESIGN_WIDTH, h: vp.height };
}
