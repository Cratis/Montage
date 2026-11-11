// Statement: one big centered line with an accent phrase, for beats that are a claim
// rather than a narration of words. Also the fallback when a spec uses an unknown type.

import { Scene, type Frame } from '../core/scene';
import { ambient, eyebrow } from '../core/canvas';
import { fitText, font, type TextLine } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, isFade, isPop, motionOf, slideOffset, type MotionSpec } from '../core/motion';

/** One line of the statement: where it sits and how far it has revealed. */
interface LineReveal {
  size: number;
  y: number;
  k: number;
  motion: MotionSpec;
  accentPhrase: string;
}

export class Statement extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const kicker = params.kicker ? String(params.kicker) : '';
    const text = String(params.headline ?? params.text ?? this.ctx.spec.caption?.text ?? '');
    const accentPhrase = params.accent ? String(params.accent) : '';

    const fit = fitText(ctx, text, theme.fontDisplay, 600, W * 0.72, H * 0.5, 3, 104, 36);
    const lh = fit.size * 1.16;
    const blockH = fit.lines.length * lh;
    const y0 = H / 2 - blockH / 2;

    // char-level wipe reveal per line, staggered - or the storyboard's motion preset
    let lineDelay = 0.2;
    const motion = motionOf(params, 'wipe');
    fit.lines.forEach((line: TextLine, li: number) => {
      const k = enter(motion, lt, lineDelay, lineDelay + 0.9);
      const y = y0 + lh * (li + 1) - (lh - fit.size * 0.8);
      this.drawLine(ctx, line, { size: fit.size, y, k, motion, accentPhrase });
      lineDelay += 0.18;
    });

    if (kicker) this.drawKicker(ctx, kicker, { lt, y: y0 - 44 });
  }

  private drawLine(ctx: CanvasRenderingContext2D, line: TextLine, reveal: LineReveal): void {
    const { W, theme } = this.ctx;
    const { size, y, k, motion, accentPhrase } = reveal;
    const p = Math.min(k, 1);
    ctx.save();
    ctx.font = font(size, theme.fontDisplay, 600);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.translate(W / 2, y);
    if (isPop(motion)) {
      const s = Math.max(0.001, Math.min(k, 1.18));
      ctx.scale(s, s);
    } else if (!isFade(motion)) {
      ctx.translate(slideOffset(motion, (1 - p) * 72), 0);
    }
    ctx.globalAlpha = p;
    const shown = Math.round(line.text.length * k);
    const visible = line.text.slice(0, shown);
    ctx.fillStyle = theme.ink;
    ctx.fillText(visible, 0, 0);
    if (accentPhrase && line.text.includes(accentPhrase)) this.overpaintAccent(ctx, line, { phrase: accentPhrase, shown, visible, size });
    ctx.restore();
  }

  /** Overpaint the accent phrase on a line that is already drawn. */
  private overpaintAccent(ctx: CanvasRenderingContext2D, line: TextLine, accent: { phrase: string; shown: number; visible: string; size: number }): void {
    const { theme } = this.ctx;
    const { phrase, shown, visible, size } = accent;
    const idx = line.text.indexOf(phrase);
    const beforeW = ctx.measureText(line.text.slice(0, idx)).width;
    const phraseW = ctx.measureText(phrase).width;
    const shownInPhrase = Math.max(0, shown - idx);
    if (shownInPhrase <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-ctx.measureText(line.text).width / 2 + beforeW, -size, phraseW * (shownInPhrase / phrase.length) + 2, size * 1.6);
    ctx.clip();
    ctx.fillStyle = theme.accent;
    ctx.fillText(visible, 0, 0);
    ctx.restore();
  }

  private drawKicker(ctx: CanvasRenderingContext2D, kicker: string, at: { lt: number; y: number }): void {
    const { W, theme } = this.ctx;
    const kk = ease.outCubic(clamp(inv(0.05, 0.5, at.lt)));
    if (kk <= 0) return;
    ctx.save();
    ctx.globalAlpha = kk;
    eyebrow(ctx, kicker, { x: W / 2, y: at.y }, { theme, align: 'center', size: Math.max(18, W * 0.0115) });
    ctx.restore();
  }
}
