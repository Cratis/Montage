// Title plate: mono kicker, big display headline revealing word by word with a clipped
// rise, an accent underline sweeping beneath, optional sub-line. The opener.

import { Scene, type Frame } from '../core/scene';
import { ambient, eyebrow } from '../core/canvas';
import { fitText, font, wrap, drawWrapped, type TextLine } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, isFade, isPop, motionOf, slideOffset, type MotionSpec } from '../core/motion';

/** Where the headline block sits on the canvas. */
interface Headline {
  lines: TextLine[];
  size: number;
  lh: number;
  blockH: number;
  y0: number;
  centerX: number;
}

/** Everything one word needs to be revealed. */
interface WordReveal {
  motion: MotionSpec;
  lt: number;
  size: number;
  totalWords: number;
  color: string;
  align: CanvasTextAlign;
  index: number;
  width: number;
}

export class Title extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const kicker = String(params.kicker ?? this.ctx.spec.caption?.text ?? 'MOTION');
    const headline = String(params.headline ?? params.title ?? this.ctx.spec.id);
    const sub = params.sub ? String(params.sub) : '';
    const emphasis = String(params.emphasis ?? '');

    // Headline layout (computed per frame — cheap and deterministic).
    const fit = fitText(ctx, headline, theme.fontDisplay, 700, W * 0.78, H * 0.5, 3, 128, 44);
    const size = fit.size;
    ctx.font = font(size, theme.fontDisplay, 700);

    const lh = size * 1.14;
    const blockH = fit.lines.length * lh;
    const y0 = H / 2 - blockH / 2 + (sub ? -H * 0.03 : 0);
    const layout: Headline = { lines: fit.lines, size, lh, blockH, y0, centerX: W / 2 };

    this.drawHeadline(ctx, layout, emphasis, lt);
    if (!sub) this.drawUnderline(ctx, layout, lt);
    this.drawKicker(ctx, layout, kicker, lt);
    if (sub) this.drawSub(ctx, layout, sub, lt);
  }

  /** Per-word reveal across the whole headline, staggered by global word index. */
  private drawHeadline(ctx: CanvasRenderingContext2D, layout: Headline, emphasis: string, lt: number): void {
    const { theme, params } = this.ctx;
    const { lines, size, lh, y0, centerX } = layout;
    let wordIdx = 0;
    const totalWords = Math.max(1, lines.reduce((a, l) => a + l.text.split(' ').length, 0));
    const motion = motionOf(params, 'rise');

    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, li) => {
      const words = line.text.split(' ');
      const spaceW = ctx.measureText(' ').width;
      const lineW = words.reduce((a, w) => a + ctx.measureText(w).width, 0) + spaceW * (words.length - 1);
      let x = centerX - lineW / 2;
      const y = y0 + lh * (li + 1) - (lh - size * 0.8);
      for (const w of words) {
        const i = wordIdx++;
        const wordW = ctx.measureText(w).width;
        const isEmph = !!emphasis && w.toLowerCase().includes(emphasis.toLowerCase());
        const reveal: WordReveal = { motion, lt, size, totalWords, color: isEmph ? theme.accent : theme.ink, align: 'center', index: i, width: wordW };
        this.drawWord(ctx, w, { x, y }, reveal);
        x += wordW + spaceW;
      }
    });
  }

  private drawWord(ctx: CanvasRenderingContext2D, word: string, at: { x: number; y: number }, reveal: WordReveal): void {
    const { motion, lt, size, totalWords, index, width: wordW } = reveal;
    const delay = 0.25 + index * (1.4 / totalWords);
    const k = enter(motion, lt, delay, delay + 0.7);
    if (!(k > 0)) return;
    const p = Math.min(k, 1);
    ctx.save();
    ctx.translate(at.x + wordW / 2, at.y);
    if (isPop(motion)) {
      const s = Math.max(0.001, Math.min(k, 1.22));
      ctx.scale(s, s);
    } else if (!isFade(motion)) {
      ctx.translate(slideOffset(motion, (1 - p) * 64), (1 - p) * size * 0.55);
    }
    ctx.globalAlpha = p;
    ctx.fillStyle = reveal.color;
    ctx.textAlign = reveal.align;
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }

  /** Accent underline sweep after the headline lands. */
  private drawUnderline(ctx: CanvasRenderingContext2D, layout: Headline, lt: number): void {
    const { W, theme } = this.ctx;
    const uk = ease.inOutCubic(clamp(inv(0.9, 1.6, lt)));
    if (!(uk > 0)) return;
    const uw = Math.min(W * 0.09, 140) * uk;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(layout.centerX - uw / 2, layout.y0 + layout.blockH + 26, uw, 4);
  }

  private drawKicker(ctx: CanvasRenderingContext2D, layout: Headline, kicker: string, lt: number): void {
    const { W, theme } = this.ctx;
    const kk = ease.outCubic(clamp(inv(0.05, 0.5, lt)));
    if (!(kk > 0)) return;
    ctx.save();
    ctx.globalAlpha = kk;
    ctx.translate(0, (1 - kk) * 14);
    eyebrow(ctx, kicker, { x: layout.centerX, y: layout.y0 - 44 }, { theme, align: 'center', size: Math.max(18, W * 0.0115) });
    ctx.restore();
  }

  private drawSub(ctx: CanvasRenderingContext2D, layout: Headline, sub: string, lt: number): void {
    const { W, theme } = this.ctx;
    const sk = ease.outCubic(clamp(inv(1.1, 1.7, lt)));
    if (!(sk > 0)) return;
    ctx.save();
    ctx.globalAlpha = sk * 0.92;
    ctx.font = font(Math.max(22, W * 0.0145), theme.fontBody, 400);
    ctx.fillStyle = theme.dim;
    ctx.textAlign = 'center';
    ctx.font = font(Math.max(22, W * 0.0145), theme.fontBody, 400);
    const subLines = wrap(ctx, sub, W * 0.6);
    const subSize = Math.max(22, W * 0.0145);
    drawWrapped(ctx, subLines, layout.centerX, layout.y0 + layout.blockH + 40 + subSize, subSize, 1.35, 'center');
    ctx.restore();
  }
}
