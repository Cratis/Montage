// Text layout on Canvas2D: wrapping, auto-fit, line boxes. All in CSS pixels of the
// 1920x1080 (or spec-sized) canvas.

export interface TextLine { text: string; width: number }

export function font(size: number, family: string, weight: number | string = 400, italic = false): string {
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

export function measure(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

/** Greedy wrap into lines that fit maxWidth. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): TextLine[] {
  const out: TextLine[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push({ text: '', width: 0 }); continue; }
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { out.push({ text: line, width: ctx.measureText(line).width }); line = w; }
    }
    if (line) out.push({ text: line, width: ctx.measureText(line).width });
  }
  return out;
}

/** Largest size <= max such that the wrapped text fits maxLines and maxHeight (rough). */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string, weight: number | string,
  maxWidth: number, maxHeight: number, maxLines: number,
  max: number, min = 14,
): { size: number; lines: TextLine[] } {
  for (let size = Math.floor(max); size >= min; size -= 2) {
    ctx.font = font(size, family, weight);
    const lines = wrap(ctx, text, maxWidth);
    const lh = size * 1.18;
    if (lines.length <= maxLines && lines.length * lh <= maxHeight) return { size, lines };
  }
  ctx.font = font(min, family, weight);
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
  return { size: min, lines };
}

/** Draw wrapped, line-spaced text; returns the total height used. */
export function drawWrapped(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[], x: number, y: number,
  size: number, lineHeight = 1.18,
  align: CanvasTextAlign = 'left',
): number {
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const lh = size * lineHeight;
  lines.forEach((l, i) => ctx.fillText(l.text, x, y + lh * (i + 1) - (lh - size * 0.78)));
  return lines.length * lh;
}

/** Ellipsize a single line to fit. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
  return t + '\u2026';
}
