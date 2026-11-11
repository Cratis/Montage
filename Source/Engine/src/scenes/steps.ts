// Steps: a numbered list where the active step lifts, takes the accent, and the rest
// recede. Progress comes from each step's `spoken` text matched against the lyrics —
// a step is active while its words are being spoken; without narration it advances
// evenly through the plate.

import { Scene, type Frame } from '../core/scene';
import type { Lyrics } from '../core/lyrics';
import { ambient, panel } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';
import { enter, isFade, motionOf, slideOffset, type MotionSpec } from '../core/motion';

interface Step { title: string; text?: string; spoken?: string }

/** The list geometry shared by every row. */
interface ListLayout {
  x0: number;
  y0: number;
  listW: number;
  rowH: number;
  spineX: number;
}

/** Which row is being painted, and how it relates to the active one. */
interface RowState {
  index: number;
  active: number;
  count: number;
}

/** The step that is active while its `spoken` words are being said (voiced shows). */
function spokenActive(steps: Step[], lyrics: Lyrics, at: number): number {
  const starts = steps.map((s) => {
    if (!s.spoken) return Number.POSITIVE_INFINITY;
    try { return lyrics.get(s.spoken).start; } catch { return Number.POSITIVE_INFINITY; }
  });
  const firstFinite = starts.findIndex((v) => Number.isFinite(v));
  let active = 0;
  for (let i = 0; i < starts.length; i++) {
    if (Number.isFinite(starts[i]!) && starts[i]! <= at + 0.15) active = i;
  }
  if (firstFinite >= 0 && at < starts[firstFinite]! - 0.2) active = firstFinite;
  return active;
}

export class Steps extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params, lyrics } = this.ctx;
    const t = f.t, lt = f.lt;
    const motion = motionOf(this.ctx.params, 'slide');
    ambient(ctx, this.ctx, t);

    const steps: Step[] = Array.isArray(params.steps) ? params.steps : [];
    if (steps.length === 0) return;
    const headline = params.headline ? String(params.headline) : '';

    const active = lyrics.lines.length > 0 && steps.some((s) => s.spoken)
      ? spokenActive(steps, lyrics, t)
      : Math.min(steps.length - 1, Math.floor(f.p * steps.length * 0.999));

    // ---- layout --------------------------------------------------------------------
    const hasHead = !!headline;
    if (hasHead) this.drawHeadline(ctx, headline, lt);

    const listW = W * 0.62;
    const x0 = W * 0.5 - listW / 2;
    const y0 = hasHead ? H * 0.26 : H * 0.2;
    const rowH = Math.min(120, (H * 0.72 - (y0 - H * 0.2)) / steps.length);
    const layout: ListLayout = { x0, y0, listW, rowH, spineX: x0 + 34 };

    // connector spine
    ctx.strokeStyle = theme.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.spineX, y0 + 34);
    ctx.lineTo(layout.spineX, y0 + rowH * (steps.length - 1) + 34);
    ctx.stroke();

    steps.forEach((s, i) => {
      const row: RowState = { index: i, active, count: steps.length };
      this.drawRow(ctx, s, layout, { row, motion, lt });
      this.drawProgress(ctx, layout, { row, p: f.p });
    });
  }

  private drawHeadline(ctx: CanvasRenderingContext2D, headline: string, lt: number): void {
    const { W, H, theme } = this.ctx;
    const hk = ease.outCubic(clamp(inv(0.1, 0.7, lt)));
    if (hk <= 0) return;
    ctx.save();
    ctx.globalAlpha = hk;
    ctx.font = font(54, theme.fontDisplay, 600);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ellipsize(ctx, headline, W * 0.8), W * 0.1, H * 0.17 + (1 - hk) * 16);
    ctx.restore();
  }

  private drawRow(ctx: CanvasRenderingContext2D, s: Step, layout: ListLayout, when: { row: RowState; motion: MotionSpec; lt: number }): void {
    const { theme } = this.ctx;
    const { x0, y0, listW, rowH, spineX } = layout;
    const { row, motion, lt } = when;
    const i = row.index;
    const isActive = i === row.active;
    const isPast = i < row.active;
    const rowY = y0 + i * rowH;

    // step activation: pops when it becomes active - or arrives per the motion preset
    const becomeT = i === 0 ? 0.15 : undefined;
    const enterK = enter(motion, lt, becomeT ?? 0, (becomeT ?? 0) + 0.5);
    const p = Math.min(enterK, 1);
    const slide = isActive ? (1 - p) * 12 + slideOffset(motion, (1 - p) * 40) : 0;

    ctx.save();
    if (isActive) {
      // panel behind the active row
      panel(ctx, { x: x0 - 18, y: rowY - 8, w: listW + 36, h: rowH - 4 }, theme, { accent: theme.accent, radius: 16 });
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

    this.drawCopy(ctx, s, { x: x0 + 96, y: cy }, { listW, isActive, isPast });
    ctx.restore();
  }

  private drawCopy(ctx: CanvasRenderingContext2D, s: Step, at: { x: number; y: number }, state: { listW: number; isActive: boolean; isPast: boolean }): void {
    const { theme } = this.ctx;
    const { listW, isActive, isPast } = state;
    ctx.textAlign = 'left';
    const titleSize = 30;
    ctx.font = font(titleSize, theme.fontDisplay, 600);
    ctx.fillStyle = isActive ? theme.ink : isPast ? withAlpha(theme.ink, 0.55) : withAlpha(theme.ink, 0.38);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ellipsize(ctx, s.title, listW - 120), at.x, at.y - 2);

    if (s.text) {
      ctx.font = font(21, theme.fontBody, 400);
      ctx.fillStyle = isActive ? theme.dim : withAlpha(theme.dim, 0.5);
      ctx.fillText(ellipsize(ctx, s.text, listW - 120), at.x, at.y + 28);
    }
  }

  /** Progress hairline on the active row. */
  private drawProgress(ctx: CanvasRenderingContext2D, layout: ListLayout, at: { row: RowState; p: number }): void {
    const { theme } = this.ctx;
    const { x0, y0, listW, rowH } = layout;
    const { row, p } = at;
    if (!(row.index === row.active && rowH > 90)) return;
    const prog = clamp(p * row.count - row.index);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x0 + 96, y0 + row.index * rowH + rowH - 22, (listW - 120) * ease.outCubic(prog), 2);
  }
}
