// Canvas drawing helpers shared by scenes: panels, hairlines, chips, arrows,
// the ambient dot-grid background with one soft glow.

import type { Theme } from './theme';
import { withAlpha } from './theme';

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The ambient ground: dot grid + one violet glow near the top + hairline frame. Idempotent per frame. */
export function ambient(ctx: CanvasRenderingContext2D, W: number, H: number, theme: Theme, t = 0) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  // one restrained glow, breathing almost imperceptibly with time
  const glow = 0.09 + 0.015 * Math.sin(t * 0.6);
  const g = ctx.createRadialGradient(W * 0.5, -H * 0.15, 0, W * 0.5, -H * 0.15, H * 0.9);
  g.addColorStop(0, withAlpha(theme.accent, glow));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // dot grid
  const step = 28, r = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const ox = -6, oy = -6;
  for (let y = oy; y < H; y += step) {
    for (let x = ox; x < W; x += step) {
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
}

/** A panel: surface fill, hairline border, soft inner top light. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: Theme, opts: { accent?: string; radius?: number; alpha?: number } = {}) {
  const { accent, radius = 18, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  g.addColorStop(0, theme.surface);
  g.addColorStop(1, theme.bg2);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  if (accent) {
    const ag = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.8);
    ag.addColorStop(0, withAlpha(accent, 0.16));
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = ag;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  ctx.strokeStyle = accent ? withAlpha(theme.ink, 0.14) : theme.rule;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
  if (accent) {
    ctx.strokeStyle = withAlpha(accent, 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + radius);
    ctx.lineTo(x + 2, y + 2);
    ctx.lineTo(x + radius, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Mono technical label, letterspaced uppercase (the "eyebrow"). */
export function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, theme: Theme, opts: { color?: string; size?: number; tracking?: number; align?: 'left' | 'center' } = {}) {
  const size = opts.size ?? 22;
  const tracking = opts.tracking ?? 4;
  ctx.save();
  ctx.font = `${size}px ${theme.fontMono}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = opts.color ?? withAlpha(theme.accent, 0.95);
  const up = text.toUpperCase();
  if (opts.align === 'center') {
    const w = up.length * (ctx.measureText('M').width * 0.62 + tracking);
    x -= w / 2;
  }
  let cx = x;
  for (const ch of up) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  ctx.restore();
}

/** Small mono chip with hairline border. */
export function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, theme: Theme, opts: { size?: number; color?: string; fill?: string; border?: string; padding?: number } = {}) {
  const size = opts.size ?? 20;
  ctx.save();
  ctx.font = `${size}px ${theme.fontMono}`;
  const padX = opts.padding ?? 14, padY = size * 0.55;
  const w = ctx.measureText(text).width + padX * 2;
  const h = size + padY * 2;
  ctx.fillStyle = opts.fill ?? theme.surface;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = opts.border ?? theme.rule;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
  ctx.stroke();
  ctx.fillStyle = opts.color ?? theme.dim;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.restore();
  return { w, h };
}

/** Horizontal/vertical arrow with a head; progress 0..1 draws it on. */
export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, theme: Theme, progress = 1, color?: string) {
  const c = color ?? withAlpha(theme.ink, 0.35);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  const head = 10;
  const bodyEnd = progress * (len - head);
  ctx.save();
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * bodyEnd, y1 + uy * bodyEnd);
  ctx.stroke();
  if (progress > 0.85) {
    const hp = (progress - 0.85) / 0.15;
    const hx = x1 + ux * (len - head), hy = y1 + uy * (len - head);
    ctx.beginPath();
    ctx.moveTo(hx + ux * head * hp, hy + uy * head * hp);
    ctx.lineTo(hx - uy * head * 0.5, hy + ux * head * 0.5);
    ctx.lineTo(hx + uy * head * 0.5, hy - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Number formatting for metrics: 1234567 -> "1 234 567" (thin space), 0.42 -> "0.42". */
export function formatNumber(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  const [int, frac] = String(rounded).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  return frac ? `${grouped}.${frac}` : grouped;
}
