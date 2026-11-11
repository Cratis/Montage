// The engine: owns the canvas, loads scenes from the timeline, renders any show time
// deterministically, composites transitions, HUD, post. Same t -> same pixels, always.

import type { ShowSpec } from '../spec';
import type { TimelineEntry } from './timeline';
import { buildTimeline } from './timeline';
import type { Frame, Scene, SceneCtx } from './scene';
import { sceneClassFor } from './registry';
import type { Lyrics } from './lyrics';
import { Lyrics as LyricsClass } from './lyrics';
import { AudioData } from './audio';
import { themeOrDefault, type Theme } from './theme';
import { Hud, type Caption } from './hud';
import { postProcess } from './post';
import { clamp, hash, rng } from './util';
import { composite, type TransitionLayers } from './transitions';

/** The HUD caption shown over a scene that declares one. */
function captionFor(e: TimelineEntry): Caption {
  const delay = 0.35;
  const caption = e.spec.caption!;
  return { start: e.start + delay, end: Math.min(e.end - 0.4, e.start + delay + 4.5), fig: caption.fig, text: caption.text };
}

interface Loaded { entry: TimelineEntry; scene: Scene | null; error?: string }

export class MontageEngine {
  readonly W: number;
  readonly H: number;
  readonly fps: number;
  theme: Theme;
  timeline: TimelineEntry[] = [];
  audio: AudioData = AudioData.empty();
  lyrics: Lyrics = new LyricsClass({});
  errors: string[] = [];
  ready = false;
  private loaded = new Map<string, Loaded>();
  private canvases: [HTMLCanvasElement, HTMLCanvasElement];
  private ctxs: [CanvasRenderingContext2D, CanvasRenderingContext2D];
  private hud!: Hud;
  private lastT = -1;
  private spec: ShowSpec;
  private base: string;

  constructor(private canvas: HTMLCanvasElement, spec: ShowSpec, base = '.') {
    this.spec = spec;
    this.W = spec.width ?? 1920;
    this.H = spec.height ?? 1080;
    this.fps = spec.fps ?? 60;
    this.theme = themeOrDefault(spec.theme);
    this.base = base.replace(/\/$/, '');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvases = [document.createElement('canvas'), document.createElement('canvas')];
    this.ctxs = this.canvases.map((c) => {
      c.width = this.W; c.height = this.H;
      return c.getContext('2d', { willReadFrequently: true })!;
    }) as [CanvasRenderingContext2D, CanvasRenderingContext2D];
  }

  get duration(): number {
    return this.audio.duration || this.spec.duration || (this.timeline.at(-1)?.end ?? 0);
  }

  async init(): Promise<void> {
    await this.loadFonts();
    if (this.spec.voiceover) await Promise.all([this.loadAudio(), this.loadLyrics()]);
    this.timeline = buildTimeline(this.spec, this.lyrics.lines.length ? this.lyrics : null, this.audio.duration ? this.audio : null);

    const captions: Caption[] = [];
    for (const e of this.timeline) {
      await this.loadScene(e);
      if (e.spec.caption) captions.push(captionFor(e));
    }

    this.hud = new Hud(
      this.theme, this.W, this.H,
      { name: this.spec.brand?.name ?? 'Cratis', product: this.spec.brand?.product, markUrl: this.spec.brand?.markUrl ?? 'fonts/cratis-mark.svg', hideMark: this.spec.brand?.hideMark },
      captions,
    );
    await this.hud.load();
    this.ready = true;
  }

  private async loadFonts(): Promise<void> {
    // font-face declarations alone do not load fonts. Request the actual scene weights
    // before measuring text, or offline frames can switch metrics partway through export.
    await Promise.all([
      document.fonts.load(`600 64px ${this.theme.fontDisplay}`),
      document.fonts.load(`700 64px ${this.theme.fontDisplay}`),
      document.fonts.load(`400 24px ${this.theme.fontBody}`),
      document.fonts.load(`600 24px ${this.theme.fontBody}`),
      document.fonts.load(`400 20px ${this.theme.fontMono}`),
      document.fonts.load(`500 20px ${this.theme.fontMono}`),
    ]);
    await document.fonts.ready;
  }

  private loadAudio(): Promise<void> {
    return AudioData.load(`${this.base}/data/audio.json`).then((a) => { this.audio = a; }).catch(() => {
      // no analysis: probe the audio element for duration so timing still works
      const el = new Audio(`${this.base}/${this.spec.voiceover}`);
      return new Promise<void>((res) => {
        el.addEventListener('loadedmetadata', () => { this.audio = AudioData.empty(el.duration); res(); });
        el.addEventListener('error', () => { this.audio = AudioData.empty(this.spec.duration ?? 0); res(); });
        setTimeout(() => res(), 4000);
      });
    });
  }

  private loadLyrics(): Promise<void> {
    return fetch(`${this.base}/data/lyrics.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no lyrics'))))
      .then((j) => { this.lyrics = new LyricsClass(j); })
      .catch(() => { this.lyrics = new LyricsClass({}); });
  }

  /** Construct and initialise one scene; a failing scene is recorded and rendered as an error plate. */
  private async loadScene(e: TimelineEntry): Promise<void> {
    const ctx: SceneCtx = {
      W: this.W, H: this.H, id: e.id, spec: e.spec, params: e.spec.params ?? {},
      theme: this.theme, audio: this.audio, lyrics: this.lyrics, base: this.base,
    };
    let scene: Scene | null = null;
    try {
      scene = new (sceneClassFor(e.type))(ctx);
      await scene.init();
    } catch (err) {
      const msg = String((err as Error)?.stack ?? err);
      this.errors.push(`[${e.id}] ${msg}`);
      console.error(`scene ${e.id} failed`, err);
      scene = null;
    }
    this.loaded.set(e.id, { entry: e, scene });
  }

  private frameFor(e: TimelineEntry, t: number, dt: number, seeked: boolean): Frame {
    const w = this.lyrics.wordAt(t);
    const lw = w ?? this.lyrics.lastWord(t);
    return {
      t, dt,
      lt: t - e.start,
      p: clamp((t - e.start) / Math.max(1e-3, e.end - e.start)),
      start: e.start, end: e.end,
      seeked,
      a: this.audio.sample(t),
      word: lw ? { text: lw.w, progress: w ? LyricsClass.wordProgress(w, t) : 1 } : null,
      rng: rng(hash(e.id) ^ Math.floor(t * 10000)),
    };
  }

  /**
   * Render show time t onto the canvas. Out-of-window t counts as a seek. Returns the
   * scene id that was frontmost.
   */
  renderAt(t: number): string {
    if (!this.ready) return '';
    const seeked = this.lastT < 0 || Math.abs(t - this.lastT) > 0.25;
    this.lastT = t;

    const cur = this.entryAt(t);
    if (!cur) return '';
    const curIdx = this.timeline.indexOf(cur);
    const prev = curIdx > 0 ? this.timeline[curIdx - 1] : null;

    // transition state: the incoming scene's first tDur seconds composite over the previous.
    const tin = prev && cur.transitionIn !== 'cut'
      ? clamp((t - cur.start) / Math.max(1e-3, cur.transitionDuration))
      : 1;
    const transitioning = !!prev && tin < 1;

    const [ctxA, ctxB] = this.ctxs;
    const [cvA, cvB] = this.canvases;
    if (transitioning && prev) {
      this.drawScene(prev, ctxA, { time: Math.min(t, prev.end - 1e-3), seeked }); // outgoing holds its final frame
      this.drawScene(cur, ctxB, { time: t, seeked });
    } else {
      this.drawScene(cur, ctxB, { time: Math.max(cur.start, Math.min(t, cur.end - 1e-3)), seeked });
    }

    // final canvas: HUD + post
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (transitioning) this.composite(cvA, cvB, cur.transitionIn, tin);
    else ctx.drawImage(cvB, 0, 0);
    this.hud.draw(ctx, t, cur.type);
    postProcess(ctx, this.W, this.H, t);
    return cur.id;
  }

  /** The entry playing at t. Unvoiced gaps belong to the preceding scene, not the show's endcard. */
  private entryAt(t: number): TimelineEntry | undefined {
    const entries = this.timeline;
    const idx = entries.findIndex((e) => t >= e.start && t < e.end);
    // Falling back to the last entry here flashed the closing card between unrelated plates.
    return idx >= 0 ? entries[idx] : (entries.filter(e => e.start <= t).at(-1) ?? entries[0]);
  }

  /** Render one scene at the given time onto a layer canvas; a failed scene shows the error plate. */
  private drawScene(e: TimelineEntry, c: CanvasRenderingContext2D, at: { time: number; seeked: boolean }): void {
    const rec = this.loaded.get(e.id)!;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    try {
      if (!rec.scene) this.errorPlate(c);
      else rec.scene.render(this.frameFor(e, at.time, at.seeked ? 0 : 1 / this.fps, at.seeked), c);
    } catch (err) {
      console.error(`scene ${e.id} render error`, err);
      this.errorPlate(c);
    }
    c.restore();
  }

  private errorPlate(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#200a0a';
    c.fillRect(0, 0, this.W, this.H);
  }

  /** Composite B over A with the given transition, into the visible canvas. */
  private composite(a: HTMLCanvasElement, b: HTMLCanvasElement, kind: string, k: number) {
    const layers: TransitionLayers = {
      ctx: this.canvas.getContext('2d', { willReadFrequently: true })!,
      a, b, W: this.W, H: this.H, accent: this.theme.accent,
    };
    composite(layers, kind, k);
  }

  /** RGBA pixels of the final canvas (for the offline renderer). */
  pixels(): Uint8ClampedArray {
    return this.canvas.getContext('2d')!.getImageData(0, 0, this.W, this.H).data;
  }

  /** PNG data URL of the current canvas (for stills). */
  png(): string {
    return this.canvas.toDataURL('image/png');
  }
}
