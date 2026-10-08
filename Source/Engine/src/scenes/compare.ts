// Comparison: two panels, left = the old way, right = the new way (accent border),
// points revealing one by one, optional verdict strip below.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, eyebrow } from '../core/canvas';
import { font, ellipsize, wrap } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';
import { enter, isPop, motionOf, slideOffset } from '../core/motion';

export class Compare extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const t = f.t, lt = f.lt;
    ambient(ctx, W, H, theme, t);

    const left = params.left ?? {};
    const right = params.right ?? {};
    const verdict = params.verdict ? String(params.verdict) : '';
    const headline = params.headline ? String(params.headline) : '';

    const hasHead = !!headline;
    if (hasHead) {
      const hk = ease.outCubic(clamp(inv(0.05, 0.6, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        ctx.font = font(46, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, headline, W * 0.86), W / 2, H * 0.15 + (1 - hk) * 12);
        ctx.restore();
      }
    }

    const gap = 28;
    const panelW = (W * 0.86 - gap) / 2;
    const panelH = verdict ? H * 0.52 : H * 0.62;
    const y0 = (hasHead ? H * 0.2 : H * 0.16) + 26;
    const lx = W * 0.07, rx = lx + panelW + gap;

    const motion = motionOf(params, 'slide');
    const drawPanel = (p: any, x: number, accent: boolean, delay: number, tag: string) => {
      const k = enter(motion, lt, delay, delay + 0.7);
      const pr = Math.min(k, 1);
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = pr;
      if (isPop(motion)) {
        const s = Math.max(0.001, Math.min(k, 1.1));
        ctx.translate(x + panelW / 2, y0 + panelH / 2);
        ctx.scale(s, s);
        ctx.translate(-(x + panelW / 2), -(y0 + panelH / 2));
      } else {
        ctx.translate(slideOffset(motion, (1 - pr) * 48), (1 - pr) * 24);
      }
      panel(ctx, x, y0, panelW, panelH, theme, { accent: accent ? theme.accent : undefined, radius: 20 });

      // tag: mono eyebrow inside the panel
      eyebrow(ctx, tag, x + 30, y0 + 44, theme, { size: 17, color: accent ? theme.accent : theme.faint });

      // title
      ctx.font = font(34, theme.fontDisplay, 600);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ellipsize(ctx, String(p.title ?? ''), panelW - 60), x + 30, y0 + 92);

      // points
      const points: string[] = Array.isArray(p.points) ? p.points.map(String) : [];
      const span = Math.max(0.4, (f.end - f.start) * 0.5);
      points.forEach((pt, i) => {
        const pk = ease.outCubic(clamp(inv(delay + 0.4 + (span * i) / Math.max(points.length, 1), delay + 0.9 + (span * (i + 1)) / Math.max(points.length, 1), t - f.start + delay)));
        if (pk <= 0) return;
        const py = y0 + 128 + i * ((panelH - 150) / Math.max(points.length, 3));
        ctx.save();
        ctx.globalAlpha = k * pk;
        const lines = (() => {
          ctx.font = font(23, theme.fontBody, 400);
          return wrap(ctx, pt, panelW - 92);
        })();
        // bullet
        ctx.fillStyle = accent ? theme.accent : theme.faint;
        ctx.beginPath();
        ctx.arc(x + 40, py + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = font(23, theme.fontBody, 400);
        ctx.fillStyle = accent ? withAlpha(theme.ink, 0.9) : theme.dim;
        lines.forEach((l, li) => ctx.fillText(l.text, x + 60, py + li * 30 + 14));
        ctx.restore();
      });
      ctx.restore();
    };

    drawPanel(left, lx, false, 0.15, 'BEFORE');
    drawPanel(right, rx, true, 0.35, 'AFTER');

    // verdict strip
    if (verdict) {
      const vk = ease.outCubic(clamp(inv(0.9, 1.6, lt)));
      if (vk > 0) {
        ctx.save();
        ctx.globalAlpha = vk;
        ctx.translate(0, (1 - vk) * 14);
        const vw = W * 0.86, vx = W * 0.07, vy = y0 + panelH + 22, vh = 64;
        ctx.fillStyle = withAlpha(theme.accent, 0.14);
        ctx.fillRect(vx, vy, vw, vh);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(vx, vy, 4, vh);
        ctx.font = font(26, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ellipsize(ctx, verdict, vw - 60), vx + 28, vy + vh / 2 + 1);
        ctx.restore();
      }
    }
  }
}
