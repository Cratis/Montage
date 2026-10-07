// Flow: a pipeline of nodes joined by arrows with a moving dash, lighting up as the
// narration passes each stage. Layout left-to-right (wraps to two rows past 5 nodes).

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, arrow, eyebrow } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

interface Node { label: string; sub?: string }

export class Flow extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const t = f.t, lt = f.lt;
    ambient(ctx, W, H, theme, t);

    const nodes: Node[] = Array.isArray(params.nodes) ? params.nodes : [];
    if (nodes.length === 0) return;
    const headline = params.headline ? String(params.headline) : '';
    const kicker = params.kicker ? String(params.kicker) : '';

    if (headline) {
      const hk = ease.outCubic(clamp(inv(0.05, 0.6, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        ctx.font = font(44, theme.fontDisplay, 600);
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, headline, W * 0.86), W / 2, H * 0.15 + (1 - hk) * 12);
        ctx.restore();
      }
    }
    if (kicker) {
      const kk = ease.outCubic(clamp(inv(0.02, 0.4, lt)));
      if (kk > 0) {
        ctx.save();
        ctx.globalAlpha = kk;
        eyebrow(ctx, kicker, W / 2, (headline ? H * 0.15 : H * 0.18) - 38, theme, { align: 'center', size: 17 });
        ctx.restore();
      }
    }

    // active stage: by narration progress across the plate (even), pushed by voice pulses
    const stages = nodes.length;
    const raw = f.p * stages;
    const active = Math.min(stages - 1, Math.floor(raw));
    const frac = clamp(raw - active);

    // layout
    const rows = stages > 5 ? 2 : 1;
    const perRow = Math.ceil(stages / rows);
    const nodeW = Math.min(250, (W * 0.82 - (perRow - 1) * 70) / perRow);
    const nodeH = 96;
    const totalW = perRow * nodeW + (perRow - 1) * 70;
    const x0 = W / 2 - totalW / 2;
    const rowY = (y: number) => (rows === 1 ? H * 0.52 - nodeH / 2 : (y === 0 ? H * 0.38 : H * 0.62) - nodeH / 2);

    const pos = nodes.map((_, i) => {
      const row = rows === 1 ? 0 : Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row < rows - 1 ? perRow : stages - perRow * (rows - 1);
      const rowW = inRow * nodeW + (inRow - 1) * 70;
      const rx = W / 2 - rowW / 2;
      return { x: rx + col * (nodeW + 70), y: rowY(row) };
    });

    nodes.forEach((n, i) => {
      const { x, y } = pos[i]!;
      const appear = ease.outBack(clamp(inv(0.15 + i * 0.12, 0.55 + i * 0.12, lt)));
      const isActive = i === active;
      const isPast = i < active;

      ctx.save();
      ctx.translate(x + nodeW / 2, y + nodeH / 2);
      ctx.scale(appear, appear);
      ctx.translate(-(x + nodeW / 2), -(y + nodeH / 2));

      // pulse when the stage is active and mid-transition to the next
      const pulse = isActive ? Math.sin(frac * Math.PI) : 0;
      if (isActive) panel(ctx, x - 6 * pulse, y - 6 * pulse, nodeW + 12 * pulse, nodeH + 12 * pulse, theme, { accent: theme.accent, radius: 18 });
      panel(ctx, x, y, nodeW, nodeH, theme, { accent: undefined, radius: 16 });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(25, theme.fontDisplay, 600);
      ctx.fillStyle = isActive ? theme.ink : isPast ? withAlpha(theme.ink, 0.72) : withAlpha(theme.ink, 0.45);
      ctx.fillText(ellipsize(ctx, n.label, nodeW - 32), x + nodeW / 2, y + (n.sub ? nodeH / 2 - 8 : nodeH / 2 + 8));

      if (n.sub) {
        ctx.font = font(17, theme.fontMono, 400);
        ctx.fillStyle = isActive ? theme.dim : theme.faint;
        ctx.fillText(ellipsize(ctx, n.sub, nodeW - 32), x + nodeW / 2, y + nodeH / 2 + 20);
      }

      // stage index tag
      ctx.font = font(14, theme.fontMono, 500);
      ctx.fillStyle = isActive ? theme.accent : theme.faint;
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 16, y + 24);
      ctx.restore();

      // arrow to next
      if (i < nodes.length - 1) {
        const a = pos[i]!, b = pos[i + 1]!;
        const sameRow = Math.abs(a.y - b.y) < 1;
        const ax = sameRow ? a.x + nodeW : a.x + nodeW / 2;
        const ay = sameRow ? a.y + nodeH / 2 : a.y + nodeH;
        const bx = sameRow ? b.x : b.x + nodeW / 2;
        const by = sameRow ? b.y + nodeH / 2 : b.y;
        const on = isPast ? 1 : isActive ? ease.inOutCubic(frac) : 0;
        arrow(ctx, ax + (sameRow ? 8 : 0), ay, bx - (sameRow ? 14 : 0), by, theme, on, isActive || isPast ? withAlpha(theme.accent, 0.8) : undefined);
      }
    });
  }
}
