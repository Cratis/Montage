// Image: one or more pictures on screen, each treated with its own motion - a Ken
// Burns drift, a zoom, a pan - inside rounded panels that stagger in. An optional
// headline and caption line sit beneath. The plate for screenshots, product shots,
// logos and anything else the show points at. Each image may carry a `describe`
// note: what should happen to it, in plain language - the direction the planner
// (or a human) wrote for this image.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, eyebrow } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';
import { enter, isFade, isPop, motionOf, slideOffset } from '../core/motion';

interface ImageSpec { src?: string; headline?: string; text?: string; motion?: string; describe?: string }

const IMAGE_MOTIONS = new Set(['kenburns', 'zoom-in', 'zoom-out', 'pan', 'slide', 'pop', 'fade']);

/** Rounded-rect path without relying on ctx.roundRect (older lib doms). */
function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

    const specs = this.specs();
    const motion = motionOf(params, 'rise');

    // ---- panel layout --------------------------------------------------------------
    const n = Math.max(1, specs.length);
    const gap = 28;
    let panels: { x: number; y: number; w: number; h: number }[] = [];
    if (n === 1) {
      const pw = W * 0.6, ph = H * 0.54;
      panels = [{ x: W / 2 - pw / 2, y: H * 0.22, w: pw, h: ph }];
    } else if (n === 2) {
      const pw = (W * 0.86 - gap) / 2, ph = H * 0.5;
      panels = [
        { x: W * 0.07, y: H * 0.22, w: pw, h: ph },
        { x: W * 0.07 + pw + gap, y: H * 0.22, w: pw, h: ph },
      ];
    } else {
      const count = Math.min(n, 4);
      const pw = (W * 0.9 - gap * (count - 1)) / count;
      const ph = H * 0.44;
      panels = Array.from({ length: count }, (_, i) => ({
        x: W * 0.05 + i * (pw + gap), y: H * 0.24, w: pw, h: ph,
      }));
    }

    // ---- panels with per-image motion ----------------------------------------------
    specs.forEach((s, i) => {
      const p = panels[i]!;
      const delay = 0.15 + i * 0.18;
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

      panel(ctx, p.x, p.y, p.w, p.h, theme, { radius: 18 });

      const img = this.imgs[i];
      const kind = IMAGE_MOTIONS.has(String(s.motion)) ? String(s.motion) : 'kenburns';
      if (img && (img.naturalWidth ?? 0) > 0) {
        // cover-fit with the per-image treatment, deterministic from local time
        const prog = clamp((lt - delay) / Math.max(0.4, (f.end - f.start) - delay));
        const e = ease.outCubic(prog);
        let scale = 1.08, panX = 0, panY = 0;
        const dir = i % 2 === 0 ? 1 : -1;
        if (kind === 'kenburns') {
          scale = 1.06 + 0.08 * e;
          panX = dir * (e - 0.5) * p.w * 0.05;
          panY = -dir * (e - 0.5) * p.h * 0.04;
        } else if (kind === 'zoom-in') scale = 1.0 + 0.12 * e;
        else if (kind === 'zoom-out') scale = 1.14 - 0.12 * e;
        else if (kind === 'pan') { scale = 1.16; panX = dir * (e - 0.5) * p.w * 0.1; }

        const iw = img.naturalWidth, ih = img.naturalHeight;
        const cover = Math.max(p.w / iw, p.h / ih) * scale;
        const dw = iw * cover, dh = ih * cover;
        const dx = p.x + (p.w - dw) / 2 + panX;
        const dy = p.y + (p.h - dh) / 2 + panY;

        ctx.save();
        roundedPath(ctx, p.x, p.y, p.w, p.h, 14);
        ctx.clip();
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      } else {
        // no image loaded: a quiet placeholder cross, so the panel never reads as broken
        ctx.save();
        roundedPath(ctx, p.x, p.y, p.w, p.h, 14);
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

      // per-image caption chip, bottom-left inside the panel
      if (s.headline) {
        const ck = ease.outCubic(clamp(inv(delay + 0.35, delay + 0.8, lt)));
        if (ck > 0) {
          ctx.save();
          ctx.globalAlpha = pr * ck;
          ctx.font = font(20, theme.fontMono, 500);
          const label = ellipsize(ctx, s.headline, p.w - 32);
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
          roundedPath(ctx, p.x + 12, p.y + p.h - 44, tw + 24, 30, 8);
          ctx.fill();
          ctx.fillStyle = theme.ink;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, p.x + 24, p.y + p.h - 44 + 15);
          ctx.restore();
        }
      }
      ctx.restore();
    });

    // ---- scene headline + caption line under the panels ----------------------------
    const headline = params.headline ? String(params.headline) : '';
    const text = params.text ? String(params.text) : '';
    const underY = panels[0]!.y + panels[0]!.h + H * 0.075;
    if (headline) {
      const hk = ease.outCubic(clamp(inv(0.55, 1.1, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        ctx.font = font(44, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, headline, W * 0.86), W / 2, underY + (1 - hk) * 10);
        ctx.restore();
      }
    }
    if (text) {
      const tk = ease.outCubic(clamp(inv(0.75, 1.3, lt)));
      if (tk > 0) {
        ctx.save();
        ctx.globalAlpha = tk * 0.9;
        ctx.font = font(24, theme.fontBody, 400);
        ctx.fillStyle = theme.dim;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, text, W * 0.8), W / 2, underY + (headline ? 44 : 0) + (1 - tk) * 8);
        ctx.restore();
      }
    }
  }
}
