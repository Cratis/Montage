// Steps: a numbered list where the active step lifts, takes the accent, and the rest
// recede. Progress comes from each step's `spoken` text matched against the lyrics —
// a step is active while its words are being spoken; without narration it advances
// evenly through the plate.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv, lerp } from '../core/util';
import { withAlpha } from '../core/theme';
import { enter, isFade, motionOf, slideOffset } from '../core/motion';

interface Step { title: string; text?: string; spoken?: string }

export class Steps extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params, lyrics } = this.ctx;
    const t = f.t, lt = f.lt;
    const motion = motionOf(this.ctx.params, 'slide');
    ambient(ctx, W, H, theme, t);

    const steps: Step[] = Array.isArray(params.steps) ? params.steps : [];
    if (steps.length === 0) return;
    const headline = params.headline ? String(params.headline) : '';

    // ---- active step index ---------------------------------------------------------
    let active = 0;
    const at = t;
    if (lyrics.lines.length > 0 && steps.some((s) => s.spoken)) {
      const starts = steps.map((s) => {
        if (!s.spoken) return Number.POSITIVE_INFINITY;
        try { return lyrics.get(s.spoken).start; } catch { return Number.POSITIVE_INFINITY; }
      });
      const firstFinite = starts.findIndex((v) => Number.isFinite(v));
      active = 0;
      for (let i = 0; i < starts.length; i++) {
        if (Number.isFinite(starts[i]!) && starts[i]! <= at + 0.15) active = i;
      }
      if (firstFinite >= 0 && at < starts[firstFinite]! - 0.2) active = firstFinite;
    } else {
      active = Math.min(steps.length - 1, Math.floor(f.p * steps.length * 0.999));
    }

    // ---- layout --------------------------------------------------------------------
    const hasHead = !!headline;
    const headSize = hasHead ? 54 : 0;
    if (hasHead) {
      const hk = ease.outCubic(clamp(inv(0.1, 0.7, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        ctx.font = font(headSize, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, headline, W * 0.8), W * 0.1, H * 0.17 + (1 - hk) * 16);
        ctx.restore();
      }
    }

    const listW = W * 0.62;
    const x0 = W * 0.5 - listW / 2;
    const y0 = hasHead ? H * 0.26 : H * 0.2;
    const rowH = Math.min(120, (H * 0.72 - (y0 - H * 0.2)) / steps.length);

    // connector spine
    const spineX = x0 + 34;
    ctx.strokeStyle = theme.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(spineX, y0 + 34);
    ctx.lineTo(spineX, y0 + rowH * (steps.length - 1) + 34);
    ctx.stroke();

    steps.forEach((s, i) => {
      const isActive = i === active;
      const isPast = i < active;
      const rowY = y0 + i * rowH;

      // step activation: pops when it becomes active - or arrives per the motion preset
      const becomeT = i === 0 ? 0.15 : undefined;
      const enterK = enter(motion, lt, becomeT ?? 0, (becomeT ?? 0) + 0.5);
      const p = Math.min(enterK, 1);
      const act = isActive ? clamp(inv(-1, 0.0001, -1) /* placeholder */, 0, 1) : 0;
      void act;

      const slide = isActive ? (1 - p) * 12 + slideOffset(motion, (1 - p) * 40) : 0;

      ctx.save();
      if (isActive) {
        // panel behind the active row
        panel(ctx, x0 - 18, rowY - 8, listW + 36, rowH - 4, theme, { accent: theme.accent, radius: 16 });
        if (isFade(motion)) ctx.globalAlpha = Math.max(0, p);
      }
      ctx.translate(slide, 0);

      // number chip
      const chipR = 34;
      const cx = spineX, cy = rowY + 34;
      ctx.beginPath();
      ctx.arc(cx, cy, chipR, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? theme.accent : isPast ? withAlpha(theme.accent, 0.18) : theme.surface;
      ctx.fill();
      ctx.strokeStyle = isActive ? withAlpha(theme.accent, 0.9) : theme.rule;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = font(20, theme.fontMono, 500);
      ctx.fillStyle = isActive ? '#0b0d12' : isPast ? theme.accent : theme.faint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1).padStart(2, '0'), cx, cy + 1);

      // copy
      const tx = x0 + 96;
      ctx.textAlign = 'left';
      const titleSize = 30;
      ctx.font = font(titleSize, theme.fontDisplay, 600);
      ctx.fillStyle = isActive ? theme.ink : isPast ? withAlpha(theme.ink, 0.55) : withAlpha(theme.ink, 0.38);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ellipsize(ctx, s.title, listW - 120), tx, cy - 2);

      if (s.text) {
        ctx.font = font(21, theme.fontBody, 400);
        ctx.fillStyle = isActive ? theme.dim : withAlpha(theme.dim, 0.5);
        ctx.fillText(ellipsize(ctx, s.text, listW - 120), tx, cy + 28);
      }
      ctx.restore();

      // progress hairline on the active row
      if (isActive && rowH > 90) {
        const prog = clamp(f.p * steps.length - i);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(tx, rowY + rowH - 22, (listW - 120) * ease.outCubic(prog), 2);
      }
      void lerp;
    });
  }
}
