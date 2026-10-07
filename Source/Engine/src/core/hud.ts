// The HUD: the persistent brand mark (safe-area corner, whole show) and the brief
// caption chips that announce each plate. Brand rule: the mark is never recoloured,
// never animated — it just sits there saying where this came from.

import type { Theme } from './theme';
import { withAlpha } from './theme';
import { ease, clamp, inv } from './util';

export interface Caption { start: number; end: number; fig?: string; text: string }

export class Hud {
  private mark: HTMLImageElement | null = null;

  constructor(
    private theme: Theme,
    private W: number,
    private H: number,
    private brand: { name?: string; product?: string; markUrl?: string; hideMark?: boolean },
    private captions: Caption[],
  ) {}

  async load() {
    if (this.brand.hideMark || !this.brand.markUrl) return;
    const img = new Image();
    img.src = new URL(this.brand.markUrl, this.base).toString();
    try { await img.decode(); this.mark = img; } catch { this.mark = null; }
  }

  private get base(): string { return location.href; }

  /** Bottom safe-area margin: 3.5% of height. */
  private margin() { return this.H * 0.05; }

  draw(ctx: CanvasRenderingContext2D, t: number, currentType: string) {
    const m = this.margin();

    // Persistent corner mark, bottom-right, ~36px on a 1920 canvas (3% of width),
    // clear space about half its height. White on the dark ground. Never animated.
    if (this.mark) {
      const size = this.W * 0.018;
      const x = this.W - m - size, y = this.H - m - size;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.mark, x, y, size, size);
      if (this.brand.name) {
        ctx.font = `500 ${size * 0.62}px ${this.theme.fontBody}`;
        ctx.fillStyle = withAlpha(this.theme.ink, 0.85);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.brand.name, x - size * 0.45, y + size / 2);
      }
      ctx.restore();
    }

    // Caption chips: fade in shortly after the cut, hold, fade.
    for (const cap of this.captions) {
      const inA = ease.outCubic(clamp(inv(cap.start, cap.start + 0.5, t)));
      const outA = 1 - ease.outCubic(clamp(inv(cap.end - 0.5, cap.end, t)));
      const alpha = Math.min(inA, outA);
      if (alpha <= 0.01) continue;
      const text = cap.fig ? `${cap.fig} \u00B7 ${cap.text}` : cap.text;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `500 ${this.W * 0.0115}px ${this.theme.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width;
      const x = m, y = this.H - m - this.W * 0.006;
      if (cap.fig) {
        ctx.fillStyle = this.theme.accent;
        ctx.fillRect(x, y - 1, this.W * 0.008, 2);
        ctx.fillText(text, x + this.W * 0.014, y);
      } else {
        ctx.fillStyle = withAlpha(this.theme.ink, 0.55);
        ctx.fillText(text, x, y);
      }
      ctx.restore();
      void currentType;
    }
  }
}
