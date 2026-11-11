// Code: a dark panel of real monospaced code with light token tinting, line numbers,
// and highlight lines that take an accent wash as the narration passes them.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, eyebrow, type Rect } from '../core/canvas';
import { font } from '../core/text';
import { ease, clamp, inv } from '../core/util';
import { withAlpha } from '../core/theme';

const KEYWORDS: Record<string, string[]> = {
  csharp: ['public', 'private', 'record', 'class', 'var', 'new', 'return', 'using', 'namespace', 'void', 'string', 'int', 'bool', 'await', 'async', 'static', 'sealed', 'get', 'set', 'this', 'if', 'else', 'foreach', 'for', 'while', 'in', 'true', 'false', 'null'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'class', 'interface', 'type', 'new', 'await', 'async', 'if', 'else', 'for', 'while', 'of', 'in', 'true', 'false', 'null', 'undefined', 'extends', 'implements', 'readonly', 'private', 'public', 'static', 'this'],
  json: [],
  sql: ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'INNER', 'GROUP', 'ORDER', 'BY', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'AND', 'OR', 'ON', 'AS'],
};

interface Tok { text: string; cls: 'kw' | 'str' | 'com' | 'num' | 'plain' | 'type' }

const WORD_GROUP_CLASSES: Tok['cls'][] = ['str', 'com', 'num'];

function classifyWord(word: string, language: string): Tok['cls'] {
  const kws = KEYWORDS[language] ?? KEYWORDS.typescript!;
  if (kws.some((k) => k.toLowerCase() === word.toLowerCase() && (language === 'sql' ? k === word : true))) return 'kw';
  return /^[A-Z]/.test(word) ? 'type' : 'plain';
}

/** The token one regex match stands for: groups 1-3 are literals, 4 a word, the rest filler. */
function tokenOf(m: RegExpExecArray, language: string): Tok {
  const literal = WORD_GROUP_CLASSES.findIndex((_, g) => !!m[g + 1]);
  if (literal >= 0) return { text: m[literal + 1]!, cls: WORD_GROUP_CLASSES[literal]! };
  if (m[4]) return { text: m[4], cls: classifyWord(m[4], language) };
  return { text: m[5] ?? m[6] ?? '', cls: 'plain' };
}

function tokenizeLine(line: string, language: string): Tok[] {
  const out: Tok[] = [];

  // whole-line comment
  if (/^\s*(\/\/|#|--)/.test(line)) { out.push({ text: line, cls: 'com' }); return out; }

  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const tok = tokenOf(m, language);
    if (tok.text) out.push(tok);
  }
  return out;
}

const TOK_COLOR: Record<Tok['cls'], (t: any) => string> = {
  kw: (t) => t.violet,
  str: (t) => t.teal,
  com: (t) => t.faint,
  num: (t) => t.orange,
  type: (t) => t.blue,
  plain: (t) => t.inkSoft,
};

/** Geometry and timing shared by every line of the panel. */
interface CodeBox {
  panel: Rect;
  lineH: number;
  startY: number;
  fade: number;
  lt: number;
  language: string;
  highlights: number[];
  lineCount: number;
}

export class Code extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, this.ctx, f.t);

    const code = String(params.code ?? '').replace(/\t/g, '  ');
    const language = String(params.language ?? 'typescript').toLowerCase();
    const title = params.title ? String(params.title) : '';
    const kicker = params.kicker ? String(params.kicker) : '';
    const highlights: number[] = Array.isArray(params.highlight) ? params.highlight.map(Number) : [];
    const lines = code.split('\n');
    if (lines.length === 0) return;

    const panelW = W * 0.72;
    const lineH = 34;
    const padY = 40;
    const panelH = Math.min(H * 0.66, lines.length * lineH + padY * 2 + (title ? 56 : 24));
    const px = W / 2 - panelW / 2;
    const py = H / 2 - panelH / 2 + (title ? H * 0.02 : 0);

    if (title || kicker) this.drawHeading(ctx, { title, kicker }, { py, lt });

    const pk = ease.outExpo(clamp(inv(0.15, 0.8, lt)));
    ctx.save();
    ctx.globalAlpha = pk;
    ctx.translate(0, (1 - pk) * 20);
    panel(ctx, { x: px, y: py, w: panelW, h: panelH }, theme, { radius: 20 });
    this.drawTrafficDots(ctx, { px, py, fade: pk });

    const box: CodeBox = {
      panel: { x: px, y: py, w: panelW, h: panelH },
      lineH,
      startY: py + padY + (title ? 40 : 0),
      fade: pk,
      lt,
      language,
      highlights,
      lineCount: lines.length,
    };
    ctx.font = font(19, theme.fontMono, 400);
    lines.forEach((line, i) => this.drawLine(ctx, line, i, box));
    ctx.restore();
  }

  private drawHeading(ctx: CanvasRenderingContext2D, text: { title: string; kicker: string }, at: { py: number; lt: number }): void {
    const { W, theme } = this.ctx;
    const { title, kicker } = text;
    const { py, lt } = at;
    const hk = ease.outCubic(clamp(inv(0.05, 0.5, lt)));
    if (hk <= 0) return;
    ctx.save();
    ctx.globalAlpha = hk;
    if (kicker) eyebrow(ctx, kicker, { x: W / 2, y: py - 46 }, { theme, align: 'center', size: 17 });
    if (title) {
      ctx.font = font(34, theme.fontDisplay, 600);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'center';
      ctx.fillText(title, W / 2, py - (kicker ? 78 : 46));
    }
    ctx.restore();
  }

  private drawTrafficDots(ctx: CanvasRenderingContext2D, at: { px: number; py: number; fade: number }): void {
    const dotY = at.py + 26;
    (['#ff5f57', '#febc2e', '#28c840'] as const).forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = at.fade * 0.7;
      ctx.beginPath();
      ctx.arc(at.px + 26 + i * 22, dotY, 5.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = at.fade;
  }

  private drawLine(ctx: CanvasRenderingContext2D, line: string, i: number, box: CodeBox): void {
    const { theme } = this.ctx;
    const { lineH, lineCount, fade: pk, lt } = box;
    const lk = ease.outCubic(clamp(inv(0.3 + i * (0.5 / lineCount), 0.5 + i * (0.5 / lineCount), lt)));
    if (lk <= 0) return;
    const y = box.startY + i * lineH;
    const isHi = box.highlights.includes(i + 1);
    if (isHi) this.drawHighlight(ctx, box, { y, order: box.highlights.indexOf(i + 1) });

    // line number
    ctx.save();
    ctx.globalAlpha = pk * lk * 0.5;
    ctx.fillStyle = isHi ? theme.accent : theme.faint;
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), box.panel.x + 56, y);
    ctx.restore();

    this.drawTokens(ctx, line, { x: box.panel.x + 76, y }, { box, reveal: lk });
  }

  /** Highlighted line wash. */
  private drawHighlight(ctx: CanvasRenderingContext2D, box: CodeBox, at: { y: number; order: number }): void {
    const { theme } = this.ctx;
    const { lineH, lt } = box;
    const { x: px, w: panelW } = box.panel;
    const hiProg = clamp(inv(0.6 + (at.order * 0.5), 1.0 + (at.order * 0.5), lt));
    ctx.fillStyle = withAlpha(theme.accent, 0.10 * hiProg);
    ctx.fillRect(px + 12, at.y - lineH * 0.72, panelW - 24, lineH);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(px + 12, at.y - lineH * 0.72, 3, lineH);
  }

  private drawTokens(ctx: CanvasRenderingContext2D, line: string, at: { x: number; y: number }, reveal: { box: CodeBox; reveal: number }): void {
    const { theme } = this.ctx;
    const pk = reveal.box.fade;
    ctx.textAlign = 'left';
    let x = at.x;
    const toks = tokenizeLine(line, reveal.box.language);
    const revealChars = Math.ceil(line.length * reveal.reveal);
    let consumed = 0;
    for (const tok of toks) {
      const remaining = revealChars - consumed;
      if (remaining <= 0) break;
      const shown = tok.text.slice(0, Math.max(0, remaining));
      ctx.fillStyle = TOK_COLOR[tok.cls](theme);
      ctx.globalAlpha = pk * (tok.cls === 'com' ? 0.7 : 1);
      ctx.fillText(shown, x, at.y);
      x += ctx.measureText(shown).width;
      consumed += tok.text.length;
    }
    ctx.globalAlpha = pk;
  }
}
