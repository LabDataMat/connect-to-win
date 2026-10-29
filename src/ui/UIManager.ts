import { hitTest, layout } from './layout';
import type { LayoutEnv } from './layout';
import type { Action, LayoutResult, Rect, UIElement, ViewState } from './types';

/**
 * UIManager：界面状态与交互。
 * - 根据 ViewState 生成可点击元素（布局是纯函数，便于测试）
 * - 命中测试（弹窗打开时只命中弹窗层）
 * - 按压反馈状态
 * 真正的业务动作由 AppController 处理，UI 层不直接改游戏数据。
 */
export class UIManager {
  private result: LayoutResult = { elements: [], board: null };
  private revision = -1;
  private lastView: ViewState | null = null;
  private pressed: { id: string; until: number } | null = null;

  update(view: ViewState, env: LayoutEnv, revision: number): void {
    this.lastView = view;
    if (revision !== this.revision) {
      this.result = layout(view, env);
      this.revision = revision;
    }
  }

  /** 每帧都可能变化的按压反馈（不触发重新布局） */
  updatePress(now: number): void {
    if (this.pressed && now > this.pressed.until) this.pressed = null;
  }

  press(id: string, now: number): void {
    this.pressed = { id, until: now + 110 };
  }

  get pressedId(): string | null {
    return this.pressed?.id ?? null;
  }

  get elements(): UIElement[] {
    return this.result.elements;
  }

  get board(): Rect | null {
    return this.result.board;
  }

  /** 按 id 查找元素；同名元素以最上层（后绘制）为准 */
  find(id: string): UIElement | null {
    for (let i = this.result.elements.length - 1; i >= 0; i--) {
      if (this.result.elements[i].id === id) return this.result.elements[i];
    }
    return null;
  }

  /** 找到坐标下最上层的可交互元素（含 disabled，仅用于按压反馈） */
  findAt(x: number, y: number): UIElement | null {
    const modalOpen = this.lastView ? this.lastView.modal !== null : false;
    for (let i = this.result.elements.length - 1; i >= 0; i--) {
      const el = this.result.elements[i];
      if (!el.action || el.disabled) continue;
      if (modalOpen && el.layer !== 'modal') continue;
      const r = el.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return el;
    }
    return null;
  }

  /** 设计单位坐标下的点击，返回对应动作 */
  tap(x: number, y: number): Action | null {
    const modalOpen = this.lastView ? this.lastView.modal !== null : false;
    const el = hitTest(this.result.elements, x, y, modalOpen);
    return el?.action ?? null;
  }
}
