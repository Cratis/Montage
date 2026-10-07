// Code: a dark panel of real monospaced code with light token tinting, line numbers,
// and highlight lines that take an accent wash as the narration passes them.

import { Scene, type Frame } from '../core/scene';
import { ambient, panel, eyebrow } from '../core/canvas';
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

function tokenizeLine(line: string, language: string): Tok[] {
  const out: Tok[] = [];
  const kws = KEYWORDS[language] ?? KEYWORDS.typescript!;
  let rest = line;
  const push = (text: string, cls: Tok['cls']) => { if (text) out.push({ text, cls }); };

  // whole-line comment
  if (/^\s*(\/\/|#|--)/.test(rest)) { push(rest, 'com'); return out; }

  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    if (m[1]) push(m[1], 'str');
    else if (m[2]) push(m[2], 'com');
    else if (m[3]) push(m[3], 'num');
    else if (m[4]) {
      const word = m[4];
      if (kws.some((k) => k.toLowerCase() === word.toLowerCase() && (language === 'sql' ? k === word : true))) push(word, 'kw');
      else if (/^[A-Z]/.test(word)) push(word, 'type');
      else push(word, 'plain');
    } else push(m[5] ?? m[6] ?? '', 'plain');
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

export class Code extends Scene {
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const { W, H, theme, params } = this.ctx;
    const lt = f.lt;
    ambient(ctx, W, H, theme, f.t);

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

    if (title || kicker) {
      const hk = ease.outCubic(clamp(inv(0.05, 0.5, lt)));
      if (hk > 0) {
        ctx.save();
        ctx.globalAlpha = hk;
        if (kicker) eyebrow(ctx, kicker, W / 2, py - 46, theme, { align: 'center', size: 17 });
        if (title) {
          ctx.font = font(34, theme.fontDisplay, 600);
          ctx.fillStyle = theme.ink;
          ctx.textAlign = 'center';
          ctx.fillText(title, W / 2, py - (kicker ? 78 : 46));
        }
        ctx.restore();
      }
    }

    const pk = ease.outExpo(clamp(inv(0.15, 0.8, lt)));
    ctx.save();
    ctx.globalAlpha = pk;
    ctx.translate(0, (1 - pk) * 20);
    panel(ctx, px, py, panelW, panelH, theme, { radius: 20 });

    // traffic dots
    const dotY = py + 26;
    (['#ff5f57', '#febc2e', '#28c840'] as const).forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = pk * 0.7;
      ctx.beginPath();
      ctx.arc(px + 26 + i * 22, dotY, 5.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = pk;

    const textX = px + 76;
    const startY = py + padY + (title ? 40 : 0);
    const fontSize = 19;
    ctx.font = font(fontSize, theme.fontMono, 400);

    lines.forEach((line, i) => {
      const lk = ease.outCubic(clamp(inv(0.3 + i * (0.5 / lines.length), 0.5 + i * (0.5 / lines.length), lt)));
      if (lk <= 0) return;
      const y = startY + i * lineH;

      // highlighted line wash
      const isHi = highlights.includes(i + 1);
      if (isHi) {
        const hiProg = clamp(inv(0.6 + (highlights.indexOf(i + 1) * 0.5), 1.0 + (highlights.indexOf(i + 1) * 0.5), lt));
        ctx.fillStyle = withAlpha(theme.accent, 0.10 * hiProg);
        ctx.fillRect(px + 12, y - lineH * 0.72, panelW - 24, lineH);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(px + 12, y - lineH * 0.72, 3, lineH);
      }

      // line number
      ctx.save();
      ctx.globalAlpha = pk * lk * 0.5;
      ctx.fillStyle = isHi ? theme.accent : theme.faint;
      ctx.textAlign = 'right';
      ctx.fillText(String(i + 1), px + 56, y);
      ctx.restore();

      // tokens
      ctx.textAlign = 'left';
      let x = textX;
      const toks = tokenizeLine(line, language);
      const revealChars = Math.ceil(line.length * lk);
      let consumed = 0;
      for (const tok of toks) {
        const remaining = revealChars - consumed;
        if (remaining <= 0) break;
        const shown = tok.text.slice(0, Math.max(0, remaining));
        ctx.fillStyle = TOK_COLOR[tok.cls](theme);
        ctx.globalAlpha = pk * (tok.cls === 'com' ? 0.7 : 1);
        ctx.fillText(shown, x, y);
        x += ctx.measureText(shown).width;
        consumed += tok.text.length;
      }
      ctx.globalAlpha = pk;
    });
    ctx.restore();
  }
}
