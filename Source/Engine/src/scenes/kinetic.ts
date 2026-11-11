// Kinetic typography: the spoken words appear centered, word by word, locked to the
// voice. Words ahead are faint, the word being spoken pops slightly and fills to ink,
// past words settle to a soft white. Emphasis words take the accent colour.

import { Scene, type Frame } from '../core/scene';
import { ambient } from '../core/canvas';
import { font } from '../core/text';
import { Lyrics, type Line, type Word } from '../core/lyrics';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

/** Pacing: how the narration sits in the scene's time (params.pacing). */
type Pacing = { leadIn: number; hold: number };
const pacingOf = (params: Record<string, any>): Pacing => {
  const raw = params?.pacing ?? {};
  return { leadIn: Math.max(0, Number(raw.leadIn) || 0), hold: Math.max(0, Number(raw.hold) || 0) };
};

export class Kinetic extends Scene {
  private sceneLines: Line[] = [];
  private pacing: Pacing = { leadIn: 0, hold: 0 };

  override init(): Promise<void> | void {
    // this scene speaks only its own lines: a neighbour scene's text must never slide
    // in across the boundary, and its words must never pull the block around
    const all = this.ctx.lyrics.lines;
    this.sceneLines = all.filter((l) => l.sceneId === this.ctx.id);
    if (this.sceneLines.length === 0) this.sceneLines = all; // legacy data without scene ids
    this.pacing = pacingOf(this.ctx.params);
  }

  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme } = this.ctx;
    // lead-in delays the karaoke against the scene's build, not the other way around
    const t = f.t - this.pacing.leadIn, lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const lines = this.sceneLines;
    if (lines.length === 0) return;
    const line = lineAt(lines, t);

    const show = this.visibleLines(line);
    const size = Math.round(Math.max(40, W * 0.031));
    ctx.font = font(size, theme.fontDisplay, 600);
    const lh = size * 1.5;
    const spaceW = ctx.measureText(' ').width * 1.1;
    const rows = layoutRows(ctx, show, { maxW: W * 0.86, spaceW });

    const blockH = rows.length * lh;
    const y0 = H / 2 - blockH / 2 + lh * 0.75;

    // entrance: first line rises in over the first half second of the plate
    const entrance = ease.outExpo(clamp(inv(0.05, 0.6, lt)));
    const beat: Beat = { t, line, entrance, size, spaceW, lastLine: lines[lines.length - 1]! };

    rows.forEach((row, ri) => this.drawRow(ctx, row, y0 + ri * lh, beat));

    this.drawHairline(ctx, { t, line }, y0 + (rows.length - 1) * lh + lh * 0.72);
  }

  /** Window: current line + one line of context above/below, this scene only. */
  private visibleLines(line: Line): Line[] {
    const lines = this.sceneLines;
    const li = lines.indexOf(line);
    // Short plates keep a stable layout across lyric-line changes. Adding/removing a
    // neighbour at a word boundary recentres the block abruptly and reads as a jump.
    if (lines.length <= 3) return [...lines];
    const prev = lines[li - 1];
    const next = lines[li + 1];
    return [
      ...(prev && line.start - prev.end < 1.2 ? [prev] : []),
      line,
      ...(next && next.start - line.end < 1.2 ? [next] : []),
    ];
  }

  private drawRow(ctx: CanvasRenderingContext2D, row: Row, y: number, beat: Beat): void {
    const { W } = this.ctx;
    const l = row.line;
    const words = l.words;
    if (words.length === 0) return;
    let x = W / 2 - row.width / 2;

    const isCurrent = l.i === beat.line.i;
    const lineIsLast = l === beat.lastLine;
    const lineAlpha = isCurrent ? 1 : 0.36;

    for (const wi of row.indices) {
      const w = words[wi]!;
      // hold lingers the highlight on the final word past its spoken end
      const hold = lineIsLast && wi === words.length - 1 ? this.pacing.hold : 0;
      this.drawWord(ctx, w, { cx: x + row.widths[wi]! / 2, cy: y, width: row.widths[wi]! }, { beat, isCurrent, lineAlpha, hold });
      x += row.widths[wi]! + beat.spaceW;
    }
  }

  private drawWord(ctx: CanvasRenderingContext2D, w: Word, box: { cx: number; cy: number; width: number }, state: { beat: Beat; isCurrent: boolean; lineAlpha: number; hold: number }): void {
    const { theme } = this.ctx;
    const { beat, hold } = state;
    const t = beat.t;
    const prog = Lyrics.wordProgress(w, t, hold);
    const active = prog > 0 && t < w.end + hold;
    // pop on word onset, decaying through the word
    const pop = active ? Math.sin(Math.PI * clamp((t - w.start) / 0.22)) * 0.06 : 0;
    const emph = isParamEmphasis(this.ctx.params, w.w);
    const alpha = wordAlpha(state, prog, active, emph);

    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.scale(1 + pop, 1 + pop);
    ctx.globalAlpha = clamp(alpha) * beat.entrance;
    ctx.fillStyle = emph ? theme.accent : theme.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // karaoke fill: clip a wipe over the word while it is being spoken
    if (active && !emph) this.drawWipe(ctx, w, box, { prog, size: beat.size });
    else ctx.fillText(w.w, 0, 0);
    ctx.restore();
  }

  /** Dim word with an ink wipe clipped over it, proportional to the spoken progress. */
  private drawWipe(ctx: CanvasRenderingContext2D, w: Word, box: { width: number }, spoken: { prog: number; size: number }): void {
    const { theme } = this.ctx;
    ctx.fillStyle = withAlpha(theme.ink, 0.28);
    ctx.fillText(w.w, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-box.width / 2, -spoken.size, box.width * ease.linear(spoken.prog), spoken.size * 2);
    ctx.clip();
    ctx.fillStyle = theme.ink;
    ctx.fillText(w.w, 0, 0);
    ctx.restore();
  }

  /** Progress hairline under the current line. */
  private drawHairline(ctx: CanvasRenderingContext2D, at: { t: number; line: Line }, hy: number): void {
    const { W, theme } = this.ctx;
    const { t, line } = at;
    const hairW = Math.min(W * 0.2, 340);
    const lineProg = clamp((t - line.start) / Math.max(1e-3, line.end - line.start));
    ctx.fillStyle = withAlpha(theme.ink, 0.12);
    ctx.fillRect(W / 2 - hairW / 2, hy, hairW, 2);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(W / 2 - hairW / 2, hy, hairW * ease.outCubic(lineProg), 2);
  }
}

/** One row of a wrapped lyric line. */
interface Row { line: Line; indices: number[]; width: number; widths: number[] }

/** Everything a row needs to know about the moment being drawn. */
interface Beat {
  t: number;
  line: Line;
  entrance: number;
  size: number;
  spaceW: number;
  lastLine: Line;
}

/**
 * A lyric line can be a whole spoken sentence - wrap its words into rows that fit the
 * viewport, or the text runs off both edges.
 */
function layoutRows(ctx: CanvasRenderingContext2D, show: Line[], fit: { maxW: number; spaceW: number }): Row[] {
  const { maxW, spaceW } = fit;
  return show.flatMap((l) => wrapLine(l, l.words.map((w) => ctx.measureText(w.w).width), { maxW, spaceW }));
}

/** Greedily wrap one line's words (with their measured widths) into rows. */
function wrapLine(l: Line, widths: number[], fit: { maxW: number; spaceW: number }): Row[] {
  const rows: Row[] = [];
  let current: number[] = [];
  let currentW = 0;
  l.words.forEach((_, wi) => {
    const add = current.length ? fit.spaceW + widths[wi]! : widths[wi]!;
    if (current.length > 0 && currentW + add > fit.maxW) {
      rows.push({ line: l, indices: current, width: currentW, widths });
      current = [];
      currentW = 0;
    }
    currentW += current.length ? fit.spaceW + widths[wi]! : widths[wi]!;
    current.push(wi);
  });
  if (current.length) rows.push({ line: l, indices: current, width: currentW, widths });
  return rows;
}

/** The line being spoken at t; before the first / in a gap it is the latest started one. */
function lineAt(lines: Line[], t: number): Line {
  return lines.find((l) => t >= l.start && t < l.end)
    ?? [...lines].reverse().find((l) => l.start <= t)
    ?? lines[0]!;
}

/** Opacity of a word: faint ahead, full while spoken, soft once past; emphasis stays strong. */
function wordAlpha(state: { isCurrent: boolean; lineAlpha: number }, prog: number, active: boolean, emph: boolean): number {
  let alpha = state.lineAlpha;
  if (prog <= 0) alpha *= 0.32;
  if (active) alpha = 1;
  else if (prog >= 1 && state.isCurrent) alpha = 0.62;
  return emph ? Math.max(alpha, 0.95) : alpha;
}

/** A word is emphasised when params.emphasis (string | string[]) matches it loosely. */
function isParamEmphasis(params: Record<string, any>, word: string): boolean {
  const raw = params.emphasis;
  if (!raw) return false;
  const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,\s]+/).filter(Boolean);
  const w = word.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '');
  return list.some((e) => e && w.includes(e.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '')));
}
