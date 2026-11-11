// Metric: a big number counting up with an out-expo settle, a label beneath, optional
// delta chip (amber) and a sparkline that draws itself on. The plate for one strong stat.

import { Scene, type Frame } from '../core/scene';
import { ambient, formatNumber, chip } from '../core/canvas';
import { font } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, motionOf } from '../core/motion';
import { withAlpha } from '../core/theme';

/** Format a value for display according to the metric's `format` param. */
function formatValue(kind: string, v: number): string {
  switch (kind) {
    case 'percent': return `${Math.round(v * 100) / 100}%`;
    case 'currency': return `$${formatNumber(Math.round(v))}`;
    case 'x': return `${Math.round(v * 10) / 10}\u00D7`;
    default: return formatNumber(Math.round(v * 10) / 10);
  }
}

export class Metric extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const value = Number(params.value ?? 0);
    const kind = String(params.format ?? 'number');
    const prefix = params.prefix ? String(params.prefix) : '';
    const label = params.label ? String(params.label) : '';
    const delta = params.delta != null ? String(params.delta) : '';
    const spark: number[] = Array.isArray(params.spark) ? params.spark.map(Number) : [];

    // count-up (the default): settles by 65% of the plate; 'fade' just reveals the final value
    const motion = motionOf(params, 'count');
    const k = Math.max(0, Math.min(1, enter(motion, lt, 0.2, (f.end - f.start) * 0.65)));
    const current = motion.preset === 'fade' ? value : value * k;
    const revealAlpha = motion.preset === 'fade' ? k : 1;

    const numStr = `${prefix}${formatValue(kind, current)}`;
    this.drawNumber(ctx, numStr, lt, revealAlpha);
    if (label) this.drawLabel(ctx, label, lt);
    if (delta) this.drawDelta(ctx, delta, lt);
    if (spark.length > 1) this.drawSpark(ctx, spark, f);
  }

  private drawNumber(ctx: CanvasRenderingContext2D, numStr: string, lt: number, revealAlpha: number): void {
    const { W, H, theme } = this.ctx;
    const numSize = Math.min(260, W * 0.13);
    ctx.font = font(numSize, theme.fontDisplay, 700);
    const nk = ease.outExpo(clamp(inv(0.15, 0.9, lt)));

    ctx.save();
    ctx.translate(0, (1 - nk) * 26);
    ctx.globalAlpha = nk * revealAlpha;
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(numStr, W / 2, H * 0.52);
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, label: string, lt: number): void {
    const { W, H, theme } = this.ctx;
    const lk = ease.outCubic(clamp(inv(0.5, 1.1, lt)));
    if (!(lk > 0)) return;
    ctx.save();
    ctx.globalAlpha = lk * 0.95;
    ctx.font = font(30, theme.fontBody, 400);
    ctx.fillStyle = theme.dim;
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H * 0.52 + 52);
    ctx.restore();
  }

  /** Delta chip, amber. */
  private drawDelta(ctx: CanvasRenderingContext2D, delta: string, lt: number): void {
    const { W, H, theme } = this.ctx;
    const dk = ease.outBack(clamp(inv(0.9, 1.4, lt)));
    if (!(dk > 0)) return;
    ctx.save();
    ctx.translate(W / 2, H * 0.52 + 96);
    ctx.scale(dk, dk);
    ctx.globalAlpha = Math.min(1, dk);
    const text = `${delta.startsWith('-') ? '' : '+'}${delta}`;
    chip(ctx, text, { x: -70, y: 0 }, { theme, size: 20, color: theme.signal, border: withAlpha(theme.signal, 0.4), fill: withAlpha(theme.signal, 0.08) });
    ctx.restore();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, spark: number[], f: Frame): void {
    const { W, H, theme } = this.ctx;
    const sk = ease.inOutCubic(clamp(inv(0.7, 2.2, f.lt)));
    if (!(sk > 0)) return;
    const sw = W * 0.3, sh = 90;
    const sx = W / 2 - sw / 2, sy = H * 0.72;
    const min = Math.min(...spark), max = Math.max(...spark);
    const range = max - min || 1;
    const pts = spark.map((v, i) => ({
      x: sx + (i / (spark.length - 1)) * sw,
      y: sy + sh - ((v - min) / range) * sh,
    }));
    const shown = Math.max(2, Math.ceil(pts.length * sk));
    ctx.save();
    ctx.strokeStyle = withAlpha(theme.accent, 0.9);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.slice(0, shown).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // head dot
    const head = pts[shown - 1]!;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5 + 2 * f.a.vonset, 0, Math.PI * 2);
    ctx.fill();
    // baseline
    ctx.strokeStyle = theme.ruleSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy + sh);
    ctx.lineTo(sx + sw, sy + sh);
    ctx.stroke();
    ctx.restore();
  }
}
