// Image: one or more pictures on screen, each treated with its own motion - a Ken
// Burns drift, a zoom, a pan - inside rounded panels that stagger in. An optional
// headline and caption line sit beneath. The plate for screenshots, product shots,
// logos and anything else the show points at. Each image may carry a `describe`
// note: what should happen to it, in plain language - the direction the planner
// (or a human) wrote for this image.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, roundRect, type Rect } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';
import { enter, isFade, isPop, motionOf, slideOffset, type MotionSpec } from '../core/motion';

interface ImageSpec { src?: string; headline?: string; text?: string; motion?: string; describe?: string }

const IMAGE_MOTIONS = new Set(['kenburns', 'zoom-in', 'zoom-out', 'pan', 'slide', 'pop', 'fade']);

/** Where an image sits in its panel: scale and drift. */
interface Treatment { scale: number; panX: number; panY: number }

/** One panel being painted: its image spec, rectangle, timing and entrance. */
interface PanelState {
  spec: ImageSpec;
  index: number;
  rect: Rect;
  delay: number;
  motion: MotionSpec;
}

/** The per-image treatment, deterministic from the eased local progress `e`. */
function treatmentOf(kind: string, e: number, drift: { dir: number; rect: Rect }): Treatment {
  const { dir, rect: p } = drift;
  let scale = 1.08, panX = 0, panY = 0;
  if (kind === 'kenburns') {
    scale = 1.06 + 0.08 * e;
    panX = dir * (e - 0.5) * p.w * 0.05;
    panY = -dir * (e - 0.5) * p.h * 0.04;
  } else if (kind === 'zoom-in') scale = 1.0 + 0.12 * e;
  else if (kind === 'zoom-out') scale = 1.14 - 0.12 * e;
  else if (kind === 'pan') { scale = 1.16; panX = dir * (e - 0.5) * p.w * 0.1; }
  return { scale, panX, panY };
}

/** The panel rectangles for n images (1, 2 or up to 4). */
function panelRects(W: number, H: number, n: number): Rect[] {
  const gap = 28;
  if (n === 1) {
    const pw = W * 0.6, ph = H * 0.54;
    return [{ x: W / 2 - pw / 2, y: H * 0.22, w: pw, h: ph }];
  }
  if (n === 2) {
    const pw = (W * 0.86 - gap) / 2, ph = H * 0.5;
    return [
      { x: W * 0.07, y: H * 0.22, w: pw, h: ph },
      { x: W * 0.07 + pw + gap, y: H * 0.22, w: pw, h: ph },
    ];
  }
  const count = Math.min(n, 4);
  const pw = (W * 0.9 - gap * (count - 1)) / count;
  const ph = H * 0.44;
  return Array.from({ length: count }, (_, i) => ({
    x: W * 0.05 + i * (pw + gap), y: H * 0.24, w: pw, h: ph,
  }));
}


export class ImageScene extends Scene {
  private imgs: (HTMLImageElement | null)[] = [];

  override async init(): Promise<void> {
    const specs = this.specs();
    this.imgs = await Promise.all(specs.map((s) => this.load(s.src)));
  }

  private specs(): ImageSpec[] {
    const raw = Array.isArray(this.ctx.params.images) ? this.ctx.params.images : [];
    return raw.filter((i: any) => i && i.src).slice(0, 4);
  }

  private async load(src?: string): Promise<HTMLImageElement | null> {
    if (!src) return null;
    const img = new Image();
    img.src = this.ctx.base + '/' + String(src).replace(/^\.\//, '').replace(/^\//, '');
    try { await img.decode(); return img; } catch { return null; }
  }

  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const specs = this.specs();
    const motion = motionOf(params, 'rise');
    const panels = panelRects(W, H, Math.max(1, specs.length));

    specs.forEach((s, i) => {
      const delay = 0.15 + i * 0.18;
      this.drawPanel(ctx, f, { spec: s, index: i, rect: panels[i]!, delay, motion });
    });

    const underY = panels[0]!.y + panels[0]!.h + H * 0.075;
    this.drawUnderline(ctx, params.headline ? String(params.headline) : '', params.text ? String(params.text) : '', { lt, underY });
  }

  /** One panel with per-image motion. */
  private drawPanel(ctx: CanvasRenderingContext2D, f: Frame, panelState: PanelState): void {
    const { theme } = this.ctx;
    const { spec: s, rect: p, delay, motion } = panelState;
    const lt = f.lt;
    const k = enter(motion, lt, delay, delay + 0.7);
    if (k <= 0) return;
    const pr = Math.min(k, 1);

    ctx.save();
    ctx.globalAlpha = pr;
    if (isPop(motion)) {
      const sc = Math.max(0.001, Math.min(k, 1.08));
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.scale(sc, sc);
      ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
    } else if (!isFade(motion)) {
      ctx.translate(slideOffset(motion, (1 - pr) * 48), (1 - pr) * 24);
    }

    panel(ctx, p, theme, { radius: 18 });
    this.drawPicture(ctx, f, panelState);
    if (s.headline) this.drawCaptionChip(ctx, s.headline, { rect: p, delay, lt, alpha: pr });
    ctx.restore();
  }

  private drawPicture(ctx: CanvasRenderingContext2D, f: Frame, panelState: PanelState): void {
    const { theme } = this.ctx;
    const { spec: s, index: i, rect: p, delay } = panelState;
    const img = this.imgs[i];
    const kind = IMAGE_MOTIONS.has(String(s.motion)) ? String(s.motion) : 'kenburns';
    if (img && (img.naturalWidth ?? 0) > 0) {
      // cover-fit with the per-image treatment, deterministic from local time
      const prog = clamp((f.lt - delay) / Math.max(0.4, (f.end - f.start) - delay));
      const e = ease.outCubic(prog);
      const dir = i % 2 === 0 ? 1 : -1;
      const { scale, panX, panY } = treatmentOf(kind, e, { dir, rect: p });

      const iw = img.naturalWidth, ih = img.naturalHeight;
      const cover = Math.max(p.w / iw, p.h / ih) * scale;
      const dw = iw * cover, dh = ih * cover;
      const dx = p.x + (p.w - dw) / 2 + panX;
      const dy = p.y + (p.h - dh) / 2 + panY;

      ctx.save();
      roundRect(ctx, p, 14);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      // no image loaded: a quiet placeholder cross, so the panel never reads as broken
      ctx.save();
      roundRect(ctx, p, 14);
      ctx.clip();
      ctx.strokeStyle = withAlpha(theme.faint ?? theme.ruleSoft, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.4, p.y + p.h * 0.35);
      ctx.lineTo(p.x + p.w * 0.6, p.y + p.h * 0.65);
      ctx.moveTo(p.x + p.w * 0.6, p.y + p.h * 0.35);
      ctx.lineTo(p.x + p.w * 0.4, p.y + p.h * 0.65);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Per-image caption chip, bottom-left inside the panel. */
  private drawCaptionChip(ctx: CanvasRenderingContext2D, headline: string, at: { rect: Rect; delay: number; lt: number; alpha: number }): void {
    const { theme } = this.ctx;
    const { rect: p, delay, lt, alpha } = at;
    const ck = ease.outCubic(clamp(inv(delay + 0.35, delay + 0.8, lt)));
    if (ck <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha * ck;
    ctx.font = font(20, theme.fontMono, 500);
    const label = ellipsize(ctx, headline, p.w - 32);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
    roundRect(ctx, { x: p.x + 12, y: p.y + p.h - 44, w: tw + 24, h: 30 }, 8);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x + 24, p.y + p.h - 44 + 15);
    ctx.restore();
  }

  /** Scene headline + caption line under the panels. */
  private drawUnderline(ctx: CanvasRenderingContext2D, headline: string, text: string, at: { lt: number; underY: number }): void {
    const { W, theme } = this.ctx;
    const { lt, underY } = at;
    if (headline) {
      const hk = ease.outCubic(clamp(inv(0.55, 1.1, lt)));
      this.drawCaptionLine(ctx, { alpha: hk, size: 44, text: headline, maxW: W * 0.86, y: underY + (1 - hk) * 10 }, theme.ink, 'display');
    }
    if (text) {
      const tk = ease.outCubic(clamp(inv(0.75, 1.3, lt)));
      this.drawCaptionLine(ctx, { alpha: tk * 0.9, size: 24, text: text, maxW: W * 0.8, y: underY + (headline ? 44 : 0) + (1 - tk) * 8 }, theme.dim, 'body');
    }
  }

  /** One centered caption line; skipped while it is still invisible. */
  private drawCaptionLine(ctx: CanvasRenderingContext2D, line: { alpha: number; size: number; text: string; maxW: number; y: number }, color: string, face: 'display' | 'body'): void {
    const { W, theme } = this.ctx;
    if (line.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = line.alpha;
    ctx.font = face === 'display' ? font(line.size, theme.fontDisplay, 600) : font(line.size, theme.fontBody, 400);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ellipsize(ctx, line.text, line.maxW), W / 2, line.y);
    ctx.restore();
  }
}
