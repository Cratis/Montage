// Endcard: the brand row (mark + name, product on the right), a closing headline and an
// optional call to action. Fades the show out gracefully.

import { Scene, type Frame } from '../core/scene';
import { ambient } from '../core/canvas';
import { fitText, font } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

export class Endcard extends Scene {
  private mark: HTMLImageElement | null = null;

  override async init(): Promise<void> {
    const url = this.ctx.params.markUrl ?? this.ctx.base + '/fonts/cratis-mark.svg';
    const img = new Image();
    img.src = url;
    try { await img.decode(); this.mark = img; } catch { this.mark = null; }
  }

  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

    const headline = String(params.headline ?? '');
    const cta = params.cta ? String(params.cta) : '';
    const brandName = String(params.brandName ?? 'Cratis');
    const product = params.product ? String(params.product) : '';

    // brand row
    const bk = ease.outCubic(clamp(inv(0.2, 0.8, lt)));
    if (bk > 0) {
      ctx.save();
      ctx.globalAlpha = bk;
      const size = W * 0.018;
      const rowY = H * 0.2;
      if (this.mark) ctx.drawImage(this.mark, W / 2 - (ctx.measureText('').width + size) / 2 - 10, rowY - size / 2, size, size);
      ctx.font = font(26, theme.fontBody, 600);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const markW = size;
      ctx.fillText(brandName, W / 2 - (markW + ctx.measureText(brandName).width) / 2 + markW + 14, rowY);
      if (product) {
        ctx.font = font(24, theme.fontBody, 500);
        ctx.fillStyle = theme.accent;
        ctx.fillText(product, W / 2 + 120, rowY);
      }
      ctx.restore();
    }

    // closing headline
    if (headline) {
      const fit = fitText(ctx, headline, theme.fontDisplay, 700, W * 0.7, H * 0.4, 3, 96, 40);
      const lh = fit.size * 1.16;
      const y0 = H / 2 - (fit.lines.length * lh) / 2;
      let delay = 0.5;
      fit.lines.forEach((line, li) => {
        const k = ease.outExpo(clamp(inv(delay, delay + 0.8, lt)));
        if (k > 0) {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.font = font(fit.size, theme.fontDisplay, 700);
          ctx.fillStyle = theme.ink;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(line.text, W / 2, y0 + lh * (li + 1) - (lh - fit.size * 0.8) + (1 - k) * 24);
          ctx.restore();
        }
        delay += 0.15;
      });
    }

    // CTA
    if (cta) {
      const ck = ease.outCubic(clamp(inv(1.2, 1.8, lt)));
      if (ck > 0) {
        ctx.save();
        ctx.globalAlpha = ck;
        ctx.font = font(24, theme.fontMono, 400);
        ctx.fillStyle = theme.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const y = H * (headline ? 0.78 : 0.55);
        ctx.fillText(cta, W / 2, y);
        const w = ctx.measureText(cta).width;
        ctx.fillStyle = withAlpha(theme.accent, 0.6);
        ctx.fillRect(W / 2 - w / 2, y + 12, w * ease.inOutCubic(clamp(inv(1.5, 2.1, lt))), 1.5);
        ctx.restore();
      }
    }

    // fade to bg in the last half second of the show
    const outK = clamp(inv(this.ctx.spec.params?.fadeOutStart ?? 0.92, 1, f.p));
    if (outK > 0) {
      ctx.fillStyle = theme.bg;
      ctx.globalAlpha = outK;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}
