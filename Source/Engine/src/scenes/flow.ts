// Flow: a pipeline of nodes joined by arrows with a moving dash, lighting up as the
// narration passes each stage. Layout left-to-right (wraps to two rows past 5 nodes).

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, arrow, eyebrow, type Point } from '../core/canvas';
import { font, ellipsize } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { enter, isFade, isPop, motionOf, slideOffset, type MotionSpec } from '../core/motion';
import { withAlpha } from '../core/theme';

interface Node { label: string; sub?: string }

/** Where every node sits and how big each one is. */
interface Layout {
  pos: Point[];
  nodeW: number;
  nodeH: number;
}

/** Which stage is lit and how far it is toward the next one. */
interface Progress {
  active: number;
  frac: number;
}

/** Everything needed to paint one node (and the arrow leaving it). */
interface NodeState {
  index: number;
  lt: number;
  motion: MotionSpec;
  progress: Progress;
}

export class Flow extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const nodes: Node[] = Array.isArray(params.nodes) ? params.nodes : [];
    if (nodes.length === 0) return;
    const headline = params.headline ? String(params.headline) : '';
    const kicker = params.kicker ? String(params.kicker) : '';

    if (headline) this.drawHeadline(ctx, headline, lt);
    if (kicker) this.drawKicker(ctx, kicker, { lt, hasHeadline: !!headline });

    // active stage: by narration progress across the plate (even), pushed by voice pulses
    const stages = nodes.length;
    const raw = f.p * stages;
    const active = Math.min(stages - 1, Math.floor(raw));
    const progress: Progress = { active, frac: clamp(raw - active) };

    const layout = this.layout(stages);
    const motion = motionOf(params, 'pop');
    nodes.forEach((n, i) => {
      const state: NodeState = { index: i, lt, motion, progress };
      this.drawNode(ctx, n, layout, state);
      if (i < nodes.length - 1) this.drawLink(ctx, layout, state);
    });
  }

  private drawHeadline(ctx: CanvasRenderingContext2D, headline: string, lt: number): void {
    const { W, H, theme } = this.ctx;
    const hk = ease.outCubic(clamp(inv(0.05, 0.6, lt)));
    if (hk <= 0) return;
    ctx.save();
    ctx.globalAlpha = hk;
    ctx.font = font(44, theme.fontDisplay, 600);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ellipsize(ctx, headline, W * 0.86), W / 2, H * 0.15 + (1 - hk) * 12);
    ctx.restore();
  }

  private drawKicker(ctx: CanvasRenderingContext2D, kicker: string, at: { lt: number; hasHeadline: boolean }): void {
    const { W, H, theme } = this.ctx;
    const kk = ease.outCubic(clamp(inv(0.02, 0.4, at.lt)));
    if (kk <= 0) return;
    ctx.save();
    ctx.globalAlpha = kk;
    eyebrow(ctx, kicker, { x: W / 2, y: (at.hasHeadline ? H * 0.15 : H * 0.18) - 38 }, { theme, align: 'center', size: 17 });
    ctx.restore();
  }

  private layout(stages: number): Layout {
    const { W, H } = this.ctx;
    const rows = stages > 5 ? 2 : 1;
    const perRow = Math.ceil(stages / rows);
    const nodeW = Math.min(250, (W * 0.82 - (perRow - 1) * 70) / perRow);
    const nodeH = 96;
    const rowY = (y: number) => (rows === 1 ? H * 0.52 - nodeH / 2 : (y === 0 ? H * 0.38 : H * 0.62) - nodeH / 2);

    const pos = Array.from({ length: stages }, (_, i) => {
      const row = rows === 1 ? 0 : Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = row < rows - 1 ? perRow : stages - perRow * (rows - 1);
      const rowW = inRow * nodeW + (inRow - 1) * 70;
      const rx = W / 2 - rowW / 2;
      return { x: rx + col * (nodeW + 70), y: rowY(row) };
    });
    return { pos, nodeW, nodeH };
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: Node, layout: Layout, state: NodeState): void {
    const { theme } = this.ctx;
    const { nodeW, nodeH } = layout;
    const { index: i, lt, motion, progress } = state;
    const { x, y } = layout.pos[i]!;
    const raw = Math.max(0, Math.min(1.2, enter(motion, lt, 0.15 + i * 0.12, 0.55 + i * 0.12)));
    const appear = clamp(raw);
    const isActive = i === progress.active;
    const isPast = i < progress.active;

    ctx.save();
    if (isFade(motion)) ctx.globalAlpha = appear;
    else if (isPop(motion)) {
      ctx.translate(x + nodeW / 2, y + nodeH / 2);
      ctx.scale(appear, appear);
      ctx.translate(-(x + nodeW / 2), -(y + nodeH / 2));
    } else {
      const dx = slideOffset(motion, (1 - appear) * 70);
      ctx.globalAlpha = Math.min(1, appear * 1.4);
      ctx.translate(dx, 0);
    }

    // pulse when the stage is active and mid-transition to the next
    const pulse = isActive ? Math.sin(progress.frac * Math.PI) : 0;
    if (isActive) panel(ctx, { x: x - 6 * pulse, y: y - 6 * pulse, w: nodeW + 12 * pulse, h: nodeH + 12 * pulse }, theme, { accent: theme.accent, radius: 18 });
    panel(ctx, { x, y, w: nodeW, h: nodeH }, theme, { accent: undefined, radius: 16 });

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
  }

  /** The arrow from this node to the next one. */
  private drawLink(ctx: CanvasRenderingContext2D, layout: Layout, state: NodeState): void {
    const { theme } = this.ctx;
    const { nodeW, nodeH } = layout;
    const { index: i, progress } = state;
    const isActive = i === progress.active;
    const isPast = i < progress.active;
    const a = layout.pos[i]!, b = layout.pos[i + 1]!;
    const sameRow = Math.abs(a.y - b.y) < 1;
    const ax = sameRow ? a.x + nodeW : a.x + nodeW / 2;
    const ay = sameRow ? a.y + nodeH / 2 : a.y + nodeH;
    const bx = sameRow ? b.x : b.x + nodeW / 2;
    const by = sameRow ? b.y + nodeH / 2 : b.y;
    const on = isPast ? 1 : isActive ? ease.inOutCubic(progress.frac) : 0;
    arrow(ctx, { x: ax + (sameRow ? 8 : 0), y: ay }, { x: bx - (sameRow ? 14 : 0), y: by }, { theme, progress: on, color: isActive || isPast ? withAlpha(theme.accent, 0.8) : undefined });
  }
}
