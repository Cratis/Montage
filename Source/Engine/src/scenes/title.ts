// Title plate: mono kicker, big display headline revealing word by word with a clipped
// rise, an accent underline sweeping beneath, optional sub-line. The opener.

import { Scene, type Frame } from '../core/scene';
import { ambient, eyebrow } from '../core/canvas';
import { fitText, font, wrap, drawWrapped, type TextLine } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, isFade, isPop, motionOf, slideOffset } from '../core/motion';

export class Title extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

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
    const centerX = W / 2;

    // per-word reveal across the whole headline, staggered by global word index
    let wordIdx = 0;
    const totalWords = Math.max(1, fit.lines.reduce((a, l) => a + l.text.split(' ').length, 0));
    const motion = motionOf(params, 'rise');

    ctx.textBaseline = 'alphabetic';
    fit.lines.forEach((line, li) => {
      const words = line.text.split(' ');
      const spaceW = ctx.measureText(' ').width;
      const lineW = words.reduce((a, w) => a + ctx.measureText(w).width, 0) + spaceW * (words.length - 1);
      let x = centerX - lineW / 2;
      const y = y0 + lh * (li + 1) - (lh - size * 0.8);
      for (const w of words) {
        const i = wordIdx++;
        const delay = 0.25 + i * (1.4 / totalWords);
        const k = enter(motion, lt, delay, delay + 0.7);
        const wordW = ctx.measureText(w).width;
        if (k > 0) {
          const isEmph = !!emphasis && w.toLowerCase().includes(emphasis.toLowerCase());
          const p = Math.min(k, 1);
          ctx.save();
          ctx.translate(x + wordW / 2, y);
          if (isPop(motion)) {
            const s = Math.max(0.001, Math.min(k, 1.22));
            ctx.scale(s, s);
          } else if (!isFade(motion)) {
            ctx.translate(slideOffset(motion, (1 - p) * 64), (1 - p) * size * 0.55);
          }
          ctx.globalAlpha = p;
          ctx.fillStyle = isEmph ? theme.accent : theme.ink;
          ctx.textAlign = 'center';
          ctx.fillText(w, 0, 0);
          ctx.restore();
        }
        x += wordW + spaceW;
      }
    });

    // accent underline sweep after the headline lands
    const uk = ease.inOutCubic(clamp(inv(0.9, 1.6, lt)));
    if (uk > 0 && !sub) {
      const uw = Math.min(W * 0.09, 140) * uk;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(centerX - uw / 2, y0 + blockH + 26, uw, 4);
    }

    // kicker above
    const kk = ease.outCubic(clamp(inv(0.05, 0.5, lt)));
    if (kk > 0) {
      ctx.save();
      ctx.globalAlpha = kk;
      ctx.translate(0, (1 - kk) * 14);
      eyebrow(ctx, kicker, centerX, y0 - 44, theme, { align: 'center', size: Math.max(18, W * 0.0115) });
      ctx.restore();
    }

    // sub-line
    if (sub) {
      const sk = ease.outCubic(clamp(inv(1.1, 1.7, lt)));
      if (sk > 0) {
        ctx.save();
        ctx.globalAlpha = sk * 0.92;
        ctx.font = font(Math.max(22, W * 0.0145), theme.fontBody, 400);
        ctx.fillStyle = theme.dim;
        ctx.textAlign = 'center';
        ctx.font = font(Math.max(22, W * 0.0145), theme.fontBody, 400);
        const subLines = wrap(ctx, sub, W * 0.6);
        const subSize = Math.max(22, W * 0.0145);
        drawWrapped(ctx, subLines, centerX, y0 + blockH + 40 + subSize, subSize, 1.35, 'center');
        ctx.restore();
      }
    }
  }
}
