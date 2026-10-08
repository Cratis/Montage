// Kinetic typography: the spoken words appear centered, word by word, locked to the
// voice. Words ahead are faint, the word being spoken pops slightly and fills to ink,
// past words settle to a soft white. Emphasis words take the accent colour.

import { Scene, type Frame } from '../core/scene';
import { ambient } from '../core/canvas';
import { font } from '../core/text';
import { Lyrics } from '../core/lyrics';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

export class Kinetic extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, lyrics } = this.ctx;
    const t = f.t, lt = f.lt;
    ambient(ctx, W, H, theme, t);

    const line = lyrics.lineAt(t) ?? lyrics.lastLine(t);
    if (!line) return;

    // window: current line + one line of context above/below
    const prev = lyrics.lines[line.i - 1];
    const next = lyrics.lines[line.i + 1];
    const show: typeof lyrics.lines = [];
    if (prev && line.start - prev.end < 1.2) show.push(prev);
    show.push(line);
    if (next && next.start - line.end < 1.2) show.push(next);

    const size = Math.round(Math.max(40, W * 0.031));
    ctx.font = font(size, theme.fontDisplay, 600);
    const lh = size * 1.5;

    // a lyric line can be a whole spoken sentence - wrap its words into rows that fit
    // the viewport, or the text runs off both edges
    const maxW = W * 0.86;
    const spaceW = ctx.measureText(' ').width * 1.1;
    type Row = { line: typeof lyrics.lines[number]; indices: number[]; width: number; widths: number[] };
    const rows: Row[] = [];
    for (const l of show) {
      const widths = l.words.map((w) => ctx.measureText(w.w).width);
      let current: number[] = [];
      let currentW = 0;
      l.words.forEach((w, wi) => {
        const wordW = widths[wi]!;
        const add = current.length ? spaceW + wordW : wordW;
        if (current.length > 0 && currentW + add > maxW) {
          rows.push({ line: l, indices: current, width: currentW, widths });
          current = [];
          currentW = 0;
        }
        currentW += current.length ? spaceW + wordW : wordW;
        current.push(wi);
      });
      if (current.length) rows.push({ line: l, indices: current, width: currentW, widths });
    }

    const blockH = rows.length * lh;
    const y0 = H / 2 - blockH / 2 + lh * 0.75;

    // entrance: first line rises in over the first half second of the plate
    const enter = ease.outExpo(clamp(inv(0.05, 0.6, lt)));

    rows.forEach((row, ri) => {
      const l = row.line;
      const words = l.words;
      if (words.length === 0) return;
      let x = W / 2 - row.width / 2;
      const y = y0 + ri * lh;

      const isCurrent = l.i === line.i;
      const lineAlpha = isCurrent ? 1 : 0.36;

      for (const wi of row.indices) {
        const w = words[wi]!;
        const prog = Lyrics.wordProgress(w, t);
        const active = prog > 0 && prog < 1;
        // pop on word onset, decaying through the word
        const popT = clamp((t - w.start) / 0.22);
        const pop = active ? ease.outBack(popT) * 0.06 : 0;
        const spoken = prog >= 1;
        const upcoming = prog <= 0;

        let fill = theme.ink;
        let alpha = lineAlpha;
        if (upcoming) alpha *= 0.32;
        if (active) { alpha = 1; }
        if (spoken && isCurrent) alpha = 0.62;

        const emph = isParamEmphasis(this.ctx.params, w.w);
        if (emph) { fill = theme.accent; alpha = Math.max(alpha, 0.95); }

        ctx.save();
        const cx = x + row.widths[wi]! / 2, cy = y;
        ctx.translate(cx, cy);
        ctx.scale(1 + pop, 1 + pop);
        ctx.globalAlpha = clamp(alpha) * enter;
        ctx.fillStyle = fill;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // karaoke fill: clip a wipe over the word while it is being spoken
        if (active && !emph) {
          ctx.fillStyle = withAlpha(theme.ink, 0.28);
          ctx.fillText(w.w, 0, 0);
          ctx.save();
          ctx.beginPath();
          ctx.rect(-row.widths[wi]! / 2, -size, row.widths[wi]! * ease.linear(prog), size * 2);
          ctx.clip();
          ctx.fillStyle = theme.ink;
          ctx.fillText(w.w, 0, 0);
          ctx.restore();
        } else {
          ctx.fillText(w.w, 0, 0);
        }
        ctx.restore();
        x += row.widths[wi]! + spaceW;
      }
    });

    // progress hairline under the current line
    const hairW = Math.min(W * 0.2, 340);
    const hy = y0 + (show.length - 1) * lh + lh * 0.72;
    const lineProg = clamp((t - line.start) / Math.max(1e-3, line.end - line.start));
    ctx.fillStyle = withAlpha(theme.ink, 0.12);
    ctx.fillRect(W / 2 - hairW / 2, hy, hairW, 2);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(W / 2 - hairW / 2, hy, hairW * ease.outCubic(lineProg), 2);
  }
}

/** A word is emphasised when params.emphasis (string | string[]) matches it loosely. */
function isParamEmphasis(params: Record<string, any>, word: string): boolean {
  const raw = params.emphasis;
  if (!raw) return false;
  const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,\s]+/).filter(Boolean);
  const w = word.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '');
  return list.some((e) => e && w.includes(e.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '')));
}
