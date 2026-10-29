/**
 * AudioManager：程序化合成音效（WebAudio / 微信 WebAudioContext 通用）。
 * 不依赖任何外部音频文件，避免版权与包体问题；音频不可用时静默降级。
 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
  linearRampToValueAtTime?(value: number, endTime: number): void;
}

export interface AudioNodeLike {
  connect(dest: AudioNodeLike): AudioNodeLike;
}

export interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioContextLike {
  currentTime: number;
  destination: AudioNodeLike;
  state?: string;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume?(): Promise<void>;
}

export type SoundName = 'tap' | 'rotate' | 'win' | 'lose' | 'hint' | 'unlock';

interface NoteSpec {
  freq: number;
  dur: number;
  type: string;
  gain: number;
  delay: number;
}

const SOUNDS: Record<SoundName, NoteSpec[]> = {
  tap: [{ freq: 720, dur: 0.05, type: 'sine', gain: 0.12, delay: 0 }],
  rotate: [
    { freq: 420, dur: 0.05, type: 'triangle', gain: 0.16, delay: 0 },
    { freq: 620, dur: 0.06, type: 'triangle', gain: 0.12, delay: 0.03 },
  ],
  hint: [{ freq: 880, dur: 0.09, type: 'sine', gain: 0.14, delay: 0 }],
  unlock: [
    { freq: 523.25, dur: 0.1, type: 'sine', gain: 0.16, delay: 0 },
    { freq: 783.99, dur: 0.14, type: 'sine', gain: 0.14, delay: 0.08 },
  ],
  win: [
    { freq: 523.25, dur: 0.12, type: 'sine', gain: 0.18, delay: 0 },
    { freq: 659.25, dur: 0.12, type: 'sine', gain: 0.16, delay: 0.1 },
    { freq: 783.99, dur: 0.16, type: 'sine', gain: 0.16, delay: 0.2 },
    { freq: 1046.5, dur: 0.22, type: 'sine', gain: 0.14, delay: 0.32 },
  ],
  lose: [
    { freq: 300, dur: 0.14, type: 'sawtooth', gain: 0.12, delay: 0 },
    { freq: 220, dur: 0.2, type: 'sawtooth', gain: 0.1, delay: 0.12 },
  ],
};

export class AudioManager {
  private ctx: AudioContextLike | null;
  private enabled: boolean;

  constructor(ctx: AudioContextLike | null, enabled = true) {
    this.ctx = ctx;
    this.enabled = enabled;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 微信/浏览器在首次用户交互前音频上下文可能挂起，需要恢复 */
  resume(): void {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        void this.ctx.resume().catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx) return;
    const notes = SOUNDS[name];
    if (!notes) return;
    try {
      const ctx = this.ctx;
      const base = ctx.currentTime;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = n.type;
        const t0 = base + n.delay;
        osc.frequency.setValueAtTime(n.freq, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.gain), t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + n.dur + 0.02);
      }
    } catch {
      /* 音频失败不影响游戏 */
    }
  }
}
