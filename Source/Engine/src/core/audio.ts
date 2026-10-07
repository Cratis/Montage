// Voice envelope analysis (data/audio.json), sampled at arbitrary show time.
// Produced by the editor backend (ffmpeg decode -> RMS at 100 Hz + word onsets).

export interface AudioJSON {
  duration: number;
  fps?: number;
  features?: Record<string, number[]>;
  onsets?: Record<string, [number, number][]>;
}

export interface AudioSample {
  rms: number;
  vocal: number;
  /** Decaying pulse at the most recent word onset. */
  vonset: number;
}

const FEATURES = ['rms', 'vocal'] as const;

export class AudioData {
  duration: number;
  private fps: number;
  private feat: Record<string, Float32Array> = {};
  onsets: Record<string, [number, number][]>;

  constructor(j: AudioJSON) {
    this.duration = +j.duration || 0;
    this.fps = +(j.fps ?? 100);
    for (const k of FEATURES) this.feat[k] = Float32Array.from(j.features?.[k] ?? []);
    this.onsets = j.onsets ?? {};
  }

  static empty(duration = 0): AudioData {
    return new AudioData({ duration, fps: 100, features: {}, onsets: {} });
  }

  static async load(url: string): Promise<AudioData> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`audio analysis not found: ${url}`);
    return new AudioData(await r.json());
  }

  /** Linear-interpolated envelope at t. */
  env(name: string, t: number): number {
    const a = this.feat[name];
    if (!a || a.length === 0) return 0;
    const x = t * this.fps;
    const i = Math.floor(x);
    if (i < 0) return a[0] ?? 0;
    if (i >= a.length - 1) return a[a.length - 1] ?? 0;
    const f = x - i;
    return a[i]! * (1 - f) + a[i + 1]! * f;
  }

  /** Sum of decaying pulses from onsets of a kind before t. */
  hit(kind: string, t: number, halfLife = 0.14): number {
    const list = this.onsets[kind];
    if (!list || list.length === 0) return 0;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]![0] <= t) lo = m + 1; else hi = m; }
    let v = 0;
    for (let i = lo - 1; i >= 0 && i >= lo - 6; i--) {
      const [ot, s] = list[i]!;
      const dt = t - ot;
      if (dt > halfLife * 8) break;
      v = Math.max(v, s * Math.pow(0.5, dt / halfLife));
    }
    return v;
  }

  sample(t: number): AudioSample {
    return { rms: this.env('rms', t), vocal: this.env('vocal', t), vonset: this.hit('vocal', t) };
  }
}
