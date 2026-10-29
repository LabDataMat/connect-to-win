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

/** 设计单位下的屏幕尺寸（宽度恒为 750） */
export function designSize(screenWidth: number, screenHeight: number): { w: number; h: number } {
  const w = DESIGN_WIDTH;
  const h = (screenHeight / Math.max(1, screenWidth)) * DESIGN_WIDTH;
  return { w, h };
}
