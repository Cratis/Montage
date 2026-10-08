// Chart: bars or a line drawing themselves on with stagger, hairline axes, accent on
// the max value. Made for one clean series — the language of the infographic, not a
// spreadsheet.

import { Scene, type Frame } from '../core/scene';
import { ambient, eyebrow } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, isFade, isPop, motionOf } from '../core/motion';
import { withAlpha } from '../core/theme';

export class Chart extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const t = f.t, lt = f.lt;
    ambient(ctx, W, H, theme, t);

    const type = String(params.type ?? 'bar');
    const labels: string[] = Array.isArray(params.labels) ? params.labels.map(String) : [];
    const values: number[] = Array.isArray(params.values) ? params.values.map(Number) : [];
    const title = params.title ? String(params.title) : '';
    const kicker = params.kicker ? String(params.kicker) : '';
    if (values.length === 0) return;

    const max = Math.max(...values, 0.0001);

    if (title) {
      const hk = ease.outCubic(clamp(inv(0.05, 0.6, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        ctx.font = font(42, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'center';
        ctx.fillText(ellipsize(ctx, title, W * 0.8), W / 2, H * 0.16 + (1 - hk) * 10);
        ctx.restore();
      }
    }
    if (kicker) {
      const kk = ease.outCubic(clamp(inv(0.02, 0.4, lt)));
      if (kk > 0) {
        ctx.save();
        ctx.globalAlpha = kk;
        eyebrow(ctx, kicker, W / 2, (title ? H * 0.16 : H * 0.19) - 36, theme, { align: 'center', size: 17 });
        ctx.restore();
      }
    }

    const x0 = W * 0.12, x1 = W * 0.88;
    const y0 = H * 0.3, y1 = H * 0.8;
    const plotW = x1 - x0, plotH = y1 - y0;

    // gridlines
    ctx.strokeStyle = theme.ruleSoft;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = y0 + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    // baseline
    ctx.strokeStyle = theme.rule;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const maxIdx = values.indexOf(max);
    const span = Math.max(0.6, (f.end - f.start) * 0.55);

    if (type === 'line') {
      const pts = values.map((v, i) => ({
        x: x0 + (i / (values.length - 1)) * plotW,
        y: y1 - (v / max) * plotH * 0.92,
      }));
      const k = ease.inOutCubic(clamp(inv(0.4, 0.4 + span, lt)));
      const shownN = Math.max(2, Math.ceil(values.length * k));
      ctx.save();
      // area fill under the shown portion
      const grad = ctx.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, withAlpha(theme.accent, 0.22));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      pts.slice(0, shownN).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (shownN > 1) {
        ctx.lineTo(pts[shownN - 1]!.x, y1);
        ctx.lineTo(pts[0]!.x, y1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.slice(0, shownN).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      // dots (skip last while still drawing)
      pts.forEach((p, i) => {
        if (i >= shownN) return;
        const isMax = i === maxIdx;
        ctx.fillStyle = isMax ? theme.signal : theme.bg;
        ctx.strokeStyle = isMax ? theme.signal : theme.accent;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isMax ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    } else {
      const n = values.length;
      const slot = plotW / n;
      const barW = Math.min(96, slot * 0.55);
      const motion = motionOf(params, 'grow');
      values.forEach((v, i) => {
        const bk = Math.max(0, Math.min(1, enter(motion, lt, 0.35 + (span * i) / n, 0.35 + (span * (i + 1)) / n)));
        if (bk <= 0) return;
        const h = (v / max) * plotH * bk;
        const x = x0 + slot * i + (slot - barW) / 2;
        const y = y1 - h;
        const isMax = i === maxIdx;
        ctx.save();
        if (isFade(motion)) ctx.globalAlpha = bk;
        else if (isPop(motion)) {
          // overshoot scale around the bar's own baseline corner
          ctx.translate(x + barW / 2, y1);
          ctx.scale(bk, bk);
          ctx.translate(-(x + barW / 2), -y1);
        }
        ctx.fillStyle = isMax ? theme.accent : withAlpha(theme.accent, 0.38);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, [8, 8, 0, 0]);
        ctx.fill();
        // value label on settle
        if (bk > 0.9) {
          ctx.save();
          ctx.globalAlpha = (bk - 0.9) * 10;
          ctx.font = font(21, theme.fontMono, 500);
          ctx.fillStyle = isMax ? theme.ink : theme.dim;
          ctx.textAlign = 'center';
          ctx.fillText(String(Math.round(v * 100) / 100), x + barW / 2, y - 12);
          ctx.restore();
        }
        ctx.restore();
      });
    }

    // labels
    labels.forEach((l, i) => {
      const lk = ease.outCubic(clamp(inv(0.5 + i * 0.06, 0.9 + i * 0.06, lt)));
      if (lk <= 0) return;
      ctx.save();
      ctx.globalAlpha = lk * 0.8;
      ctx.font = font(20, theme.fontMono, 400);
      ctx.fillStyle = theme.dim;
      ctx.textAlign = 'center';
      const x = type === 'line'
        ? x0 + (i / Math.max(labels.length - 1, 1)) * plotW
        : x0 + (plotW / values.length) * i + plotW / values.length / 2;
      ctx.fillText(ellipsize(ctx, l, type === 'line' ? plotW / labels.length : plotW / values.length), x, y1 + 40);
      ctx.restore();
    });
  }
}
