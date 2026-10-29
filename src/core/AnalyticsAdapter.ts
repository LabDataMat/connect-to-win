/**
 * AnalyticsAdapter：游戏事件记录接口。
 * 首版不接第三方统计 SDK，也不上报任何个人信息：
 * 事件只写入内存环形缓冲（便于本地调试），可通过 sink 注入平台实现（例如接入微信自定义分析）。
 */
export interface AnalyticsEvent {
  name: string;
  time: number;
  params: Record<string, string | number | boolean>;
}

export type AnalyticsSink = (event: AnalyticsEvent) => void;

export class AnalyticsAdapter {
  private buffer: AnalyticsEvent[] = [];
  private maxBuffer: number;
  private sink: AnalyticsSink | null;
  private enabled: boolean;

  constructor(sink: AnalyticsSink | null = null, opts: { maxBuffer?: number; enabled?: boolean } = {}) {
    this.sink = sink;
    this.maxBuffer = opts.maxBuffer ?? 200;
    this.enabled = opts.enabled ?? true;
  }

  log(name: string, params: Record<string, string | number | boolean> = {}): void {
    if (!this.enabled) return;
    const event: AnalyticsEvent = { name, time: Date.now(), params };
    this.buffer.push(event);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    if (this.sink) {
      try {
        this.sink(event);
      } catch {
        /* 统计失败不影响游戏 */
      }
    }
  }

  get events(): readonly AnalyticsEvent[] {
    return this.buffer;
  }

  count(name: string): number {
    return this.buffer.filter((e) => e.name === name).length;
  }

  /** 本地聚合：每个事件出现的次数（仅内存，不上报） */
  counts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const e of this.buffer) result[e.name] = (result[e.name] ?? 0) + 1;
    return result;
  }

  /** 本地聚合：某事件的数值字段之和（如 session 时长） */
  sum(name: string, key: string): number {
    let total = 0;
    for (const e of this.buffer) {
      if (e.name !== name) continue;
      const v = e.params[key];
      if (typeof v === 'number' && Number.isFinite(v)) total += v;
    }
    return total;
  }

  clear(): void {
    this.buffer.length = 0;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }
}
