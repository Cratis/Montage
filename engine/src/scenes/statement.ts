// Statement: one big centered line with an accent phrase, for beats that are a claim
// rather than a narration of words. Also the fallback when a spec uses an unknown type.

import { Scene, type Frame } from '../core/scene';
import { ambient, eyebrow } from '../core/canvas';
import { fitText, font, type TextLine } from '../core/text';
import { ease, clamp, inv } from '../core/util';

export class Statement extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

    const kicker = params.kicker ? String(params.kicker) : '';
    const text = String(params.headline ?? params.text ?? this.ctx.spec.caption?.text ?? '');
    const accentPhrase = params.accent ? String(params.accent) : '';

    const fit = fitText(ctx, text, theme.fontDisplay, 600, W * 0.72, H * 0.5, 3, 104, 36);
    const lh = fit.size * 1.16;
    const blockH = fit.lines.length * lh;
    const y0 = H / 2 - blockH / 2;

    // char-level wipe reveal per line, staggered
    let lineDelay = 0.2;
    fit.lines.forEach((line: TextLine, li: number) => {
      const k = ease.outCubic(clamp(inv(lineDelay, lineDelay + 0.9, lt)));
      ctx.save();
      ctx.font = font(fit.size, theme.fontDisplay, 600);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      const x = W / 2;
      const y = y0 + lh * (li + 1) - (lh - fit.size * 0.8);
      const shown = Math.round(line.text.length * k);
      const visible = line.text.slice(0, shown);
      if (accentPhrase && line.text.includes(accentPhrase)) {
        // draw the line, then overpaint the accent phrase
        ctx.fillStyle = theme.ink;
        ctx.fillText(visible, x, y);
        const idx = line.text.indexOf(accentPhrase);
        const beforeW = ctx.measureText(line.text.slice(0, idx)).width;
        const phraseW = ctx.measureText(accentPhrase).width;
        const shownInPhrase = Math.max(0, shown - idx);
        if (shownInPhrase > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - ctx.measureText(line.text).width / 2 + beforeW, y - fit.size, phraseW * (shownInPhrase / accentPhrase.length) + 2, fit.size * 1.6);
          ctx.clip();
          ctx.fillStyle = theme.accent;
          ctx.fillText(visible, x, y);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = theme.ink;
        ctx.fillText(visible, x, y);
      }
      ctx.restore();
      lineDelay += 0.18;
    });

    if (kicker) {
      const kk = ease.outCubic(clamp(inv(0.05, 0.5, lt)));
      if (kk > 0) {
        ctx.save();
        ctx.globalAlpha = kk;
        eyebrow(ctx, kicker, W / 2, y0 - 44, this.ctx.theme, { align: 'center', size: Math.max(18, W * 0.0115) });
        ctx.restore();
      }
    }
  }
}
