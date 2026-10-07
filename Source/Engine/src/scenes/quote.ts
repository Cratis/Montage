// Quote: a big quotation mark motif, the quote revealing as one breath, attribution in
// mono. The quiet plate.

import { Scene, type Frame } from '../core/scene';
import { ambient } from '../core/canvas';
import { font, fitText } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

export class Quote extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

    const text = String(params.text ?? params.quote ?? '');
    const attribution = params.attribution ? String(params.attribution) : '';
    if (!text) return;

    // oversized quotation mark motif behind
    const qk = ease.outCubic(clamp(inv(0.05, 0.8, lt)));
    ctx.save();
    ctx.globalAlpha = qk * 0.14;
    ctx.font = font(H * 0.42, theme.fontDisplay, 700);
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.fillText('\u201C', W * 0.12, H * 0.46);
    ctx.restore();

    const fit = fitText(ctx, text, theme.fontDisplay, 500, W * 0.68, H * 0.44, 4, 72, 26);
    const lh = fit.size * 1.3;
    const blockH = fit.lines.length * lh;
    const y0 = H / 2 - blockH / 2 + (attribution ? -30 : 0);

    let delay = 0.3;
    fit.lines.forEach((line, li) => {
      const k = ease.outCubic(clamp(inv(delay, delay + 0.8, lt)));
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.font = font(fit.size, theme.fontDisplay, 500);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(line.text, W / 2, y0 + lh * (li + 1) - (lh - fit.size) + (1 - k) * 10);
        ctx.restore();
      }
      delay += 0.22;
    });

    if (attribution) {
      const ak = ease.outCubic(clamp(inv(delay + 0.1, delay + 0.6, lt)));
      if (ak > 0) {
        ctx.save();
        ctx.globalAlpha = ak;
        ctx.font = font(22, theme.fontMono, 400);
        ctx.fillStyle = theme.dim;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`\u2014 ${attribution}`, W / 2, y0 + blockH + 64);
        ctx.restore();
      }
      void withAlpha;
    }
  }
}
