// Preview player: playback, scrubbing, keyboard control, a quiet HUD. The same engine
// calls the renderer uses — the preview is the export, just live.

import type { MontageEngine } from './core/engine';

export class Player {
  private audio: HTMLAudioElement | null = null;
  private raf = 0;
  private playing = false;
  private t = 0;
  private lastNow = 0;
  private loopPlate = false;
  private hudHidden = false;
  private plateRange: { id: string; start: number; end: number } | null = null;

  constructor(private engine: MontageEngine, private canvas: HTMLCanvasElement, private ui: HTMLElement) {
    window.addEventListener('keydown', (e) => this.key(e));
    this.buildUi();
    this.tick = this.tick.bind(this);
    // playPlate auto-starts playback, but browsers block audio until a user gesture -
    // pick the voice up on the first interaction so sync never yanks time back to zero
    window.addEventListener('pointerdown', () => {
      if (this.playing && this.audio?.paused) void this.audio.play().catch(() => {});
    });
  }

  attachAudio(src: string | null) {
    if (!src) return;
    this.audio = new Audio(src);
    this.audio.preload = 'auto';
  }

  /** Hide/show the control bar (export mode hides it). */
  setHudVisible(v: boolean) {
    this.ui.style.display = v ? '' : 'none';
  }

  get current(): number { return this.t; }

  /** Whether playback is running - hosts mirror their own UI to it. */
  get isPlaying(): boolean { return this.playing; }

  private loopRunning = false;

  /** The rAF loop runs for the lifetime of the page once started. */
  private ensureLoop() {
    if (this.loopRunning) return;
    this.loopRunning = true;
    requestAnimationFrame(this.tick);
  }

  start(t = 0) {
    this.seek(t);
    this.ensureLoop();
    this.render();
  }

  private key(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const step = e.shiftKey ? 5 : 1;
    const frame = 1 / this.engine.fps;
    const actions: Record<string, () => void> = {
      ' ': () => { e.preventDefault(); this.toggle(); },
      ArrowRight: () => this.seek(this.t + step),
      ArrowLeft: () => this.seek(this.t - step),
      ',': () => this.seek(this.t - frame),
      '.': () => this.seek(this.t + frame),
      '[': () => this.jumpPlate(-1),
      ']': () => this.jumpPlate(1),
      l: () => { this.loopPlate = !this.loopPlate; },
      h: () => { this.hudHidden = !this.hudHidden; this.ui.style.display = this.hudHidden ? 'none' : ''; },
    };
    if (Object.prototype.hasOwnProperty.call(actions, e.key)) actions[e.key]!();
  }

  /** Play exactly one plate: seek to its start, confine to its window, stop at its end (or loop).
   *  Does not autoplay - the host parks on the scene's first frame and the user presses play. */
  playPlate(id: string, loop = false) {
    const entry = this.engine.timeline.find((e) => e.id === id) ?? this.engine.timeline[id as unknown as number];
    if (!entry) return;
    this.loopPlate = loop;
    this.plateRange = { id: entry.id, start: entry.start, end: entry.end };
    this.seek(entry.start + 0.001);
    this.ensureLoop();
  }

  private jumpPlate(dir: 1 | -1) {
    const tl = this.engine.timeline;
    const next = dir > 0
      ? tl.find((e) => e.start > this.t + 0.05)
      : [...tl].reverse().find((e) => e.end < this.t - 0.05);
    if (next) {
      this.plateRange = { id: next.id, start: next.start, end: next.end };
      this.seek(next.start + 0.001);
    }
  }

  toggle() {
    this.playing = !this.playing;
    if (this.playing) {
      // parked at the end (or past it): replay from the top of the window
      const end = this.plateRange?.end ?? this.engine.duration;
      const from = this.plateRange?.start ?? 0;
      if (this.t >= end - 0.01) this.seek(from + 0.001);
      void this.audio?.play().catch(() => {});
    } else {
      this.audio?.pause();
    }
    this.lastNow = performance.now();
    this.syncPlayBtn();
  }

  /** Stop playback, keeping the current position (hosts hide the preview mid-scene). */
  pause() {
    if (this.playing) this.toggle();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.engine.duration, t));
    if (this.audio) this.audio.currentTime = this.t;
    this.render();
  }

  private tick() {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.playing) return;
    // wall clock, not the rAF timestamp - some environments hand out frozen timestamps
    const now = performance.now();
    const dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    this.t += dt;
    this.pinToVoice();
    this.stopOrLoopAtEnd();
    this.render();
  }

  /** Pin to the voice only while it is actually playing - when the browser blocks
   *  autoplay the audio sits at zero and would freeze the whole show on frame one. */
  private pinToVoice() {
    if (this.audio && !this.audio.paused && Math.abs(this.audio.currentTime - this.t) > 0.25) this.t = this.audio.currentTime;
  }

  private stopOrLoopAtEnd() {
    const range = this.plateRange ?? (this.loopPlate ? this.plateAt(this.t) : null);
    const end = range ? range.end : this.engine.duration;
    if (this.t < end) return;
    if (range && this.loopPlate) {
      this.t = range.start;
      if (this.audio) this.audio.currentTime = this.t;
    } else {
      this.t = end; this.playing = false; this.audio?.pause(); this.syncPlayBtn();
    }
  }

  private plateAt(t: number) {
    const e = this.engine.timeline.find((e) => t >= e.start && t < e.end) ?? this.engine.timeline[0]!;
    return { id: e.id, start: e.start, end: e.end };
  }

  render() {
    const id = this.engine.renderAt(this.t);
    this.updateUi(id);
  }

  // ---- minimal DOM UI -----------------------------------------------------------------
  private playBtn!: HTMLButtonElement;
  private bar!: HTMLInputElement;
  private label!: HTMLSpanElement;

  private buildUi() {
    this.ui.innerHTML = '';
    this.ui.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:14px;padding:14px 22px;background:linear-gradient(transparent, rgba(11,13,18,.92) 40%);font:500 13px "JetBrains Mono",monospace;color:#9aa1b0;z-index:10';
    this.playBtn = this.buildPlayButton();
    this.bar = this.buildScrubber();
    this.label = document.createElement('span');
    this.label.style.cssText = 'min-width:190px;text-align:right;white-space:nowrap';
    this.ui.append(this.playBtn, this.bar, this.label);
    document.body.appendChild(this.ui);
  }

  private buildPlayButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = '\u25B6';
    btn.style.cssText = 'width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(20,24,36,.9);color:#f0eee6;font-size:14px;cursor:pointer';
    btn.onclick = () => this.toggle();
    return btn;
  }

  private buildScrubber(): HTMLInputElement {
    const bar = document.createElement('input');
    bar.type = 'range';
    bar.min = '0';
    bar.max = '1000';
    bar.value = '0';
    bar.style.cssText = 'flex:1;accent-color:#8c7cf6;cursor:pointer';
    bar.oninput = () => {
      const from = this.plateRange?.start ?? 0;
      const to = this.plateRange?.end ?? this.engine.duration;
      this.seek(from + (+bar.value / 1000) * (to - from));
    };
    return bar;
  }

  private syncPlayBtn() {
    this.playBtn.textContent = this.playing ? '\u2759\u2759' : '\u25B6';
  }

  private updateUi(sceneId: string) {
    // in plate mode the HUD is scoped to the scene: its length, its zero point, its name -
    // not the full show the scene happens to sit inside
    const from = this.plateRange?.start ?? 0;
    const to = this.plateRange?.end ?? this.engine.duration;
    const len = Math.max(0.001, to - from);
    const shown = Math.min(Math.max(this.t - from, 0), len);
    this.bar.value = String(Math.round((shown / len) * 1000));
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const id = this.plateRange?.id ?? sceneId;
    this.label.textContent = `${mm(shown)} / ${mm(len)} \u00B7 ${id}${this.loopPlate ? ' \u00B7 loop' : ''}`;
  }
}
