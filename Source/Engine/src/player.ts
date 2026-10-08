// Preview player: playback, scrubbing, keyboard control, a quiet HUD. The same engine
// calls the renderer uses — the preview is the export, just live.

import type { MotionEngine } from './core/engine';

export class Player {
  private audio: HTMLAudioElement | null = null;
  private raf = 0;
  private playing = false;
  private t = 0;
  private lastNow = 0;
  private loopPlate = false;
  private hudHidden = false;
  private plateRange: { id: string; start: number; end: number } | null = null;

  constructor(private engine: MotionEngine, private canvas: HTMLCanvasElement, private ui: HTMLElement) {
    window.addEventListener('keydown', (e) => this.key(e));
    this.buildUi();
    this.tick = this.tick.bind(this);
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

  start(t = 0) {
    this.seek(t);
    this.raf = requestAnimationFrame(this.tick);
    this.render();
  }

  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ': e.preventDefault(); this.toggle(); break;
      case 'ArrowRight': this.seek(this.t + (e.shiftKey ? 5 : 1)); break;
      case 'ArrowLeft': this.seek(this.t - (e.shiftKey ? 5 : 1)); break;
      case ',': this.seek(this.t - 1 / this.engine.fps); break;
      case '.': this.seek(this.t + 1 / this.engine.fps); break;
      case '[': this.jumpPlate(-1); break;
      case ']': this.jumpPlate(1); break;
      case 'l': this.loopPlate = !this.loopPlate; break;
      case 'h': this.hudHidden = !this.hudHidden; this.ui.style.display = this.hudHidden ? 'none' : ''; break;
    }
  }

  /** Play exactly one plate: seek to its start, confine to its window, stop at its end (or loop). */
  playPlate(id: string, loop = false) {
    const entry = this.engine.timeline.find((e) => e.id === id) ?? this.engine.timeline[id as unknown as number];
    if (!entry) return;
    this.loopPlate = loop;
    this.plateRange = { id: entry.id, start: entry.start, end: entry.end };
    this.seek(entry.start + 0.001);
    if (!this.playing) this.toggle();
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
    this.lastNow = performance.now();
    if (this.playing) void this.audio?.play().catch(() => {});
    else this.audio?.pause();
    this.syncPlayBtn();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.engine.duration, t));
    if (this.audio) this.audio.currentTime = this.t;
    this.render();
  }

  private tick(now: number) {
    this.raf = requestAnimationFrame(this.tick);
    if (this.playing) {
      const dt = (now - this.lastNow) / 1000;
      this.lastNow = now;
      this.t += dt;
      if (this.audio && Math.abs(this.audio.currentTime - this.t) > 0.25) this.t = this.audio.currentTime;
      const range = this.plateRange ?? (this.loopPlate ? this.plateAt(this.t) : null);
      const end = range ? range.end : this.engine.duration;
      if (this.t >= end) {
        if (range && this.loopPlate) { this.t = range.start; if (this.audio) this.audio.currentTime = this.t; }
        else { this.t = end; this.playing = false; this.audio?.pause(); this.syncPlayBtn(); }
      }
      this.render();
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
    this.playBtn = document.createElement('button');
    this.playBtn.textContent = '\u25B6';
    this.playBtn.style.cssText = 'width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(20,24,36,.9);color:#f0eee6;font-size:14px;cursor:pointer';
    this.playBtn.onclick = () => this.toggle();
    this.bar = document.createElement('input');
    this.bar.type = 'range';
    this.bar.min = '0';
    this.bar.max = '1000';
    this.bar.value = '0';
    this.bar.style.cssText = 'flex:1;accent-color:#8c7cf6;cursor:pointer';
    this.bar.oninput = () => this.seek((+this.bar.value / 1000) * this.engine.duration);
    this.label = document.createElement('span');
    this.label.style.cssText = 'min-width:190px;text-align:right;white-space:nowrap';
    this.ui.append(this.playBtn, this.bar, this.label);
    document.body.appendChild(this.ui);
  }

  private syncPlayBtn() {
    this.playBtn.textContent = this.playing ? '\u2759\u2759' : '\u25B6';
  }

  private updateUi(sceneId: string) {
    this.bar.value = String(Math.round((this.t / Math.max(this.engine.duration, 0.001)) * 1000));
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    this.label.textContent = `${mm(this.t)} / ${mm(this.engine.duration)} \u00B7 ${sceneId}${this.loopPlate ? ' \u00B7 loop' : ''}`;
  }
}
