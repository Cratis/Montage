// Word-timed lyrics (data/lyrics.json) with the queries scenes use to lock to the voice:
// find a line by content, word at time, karaoke progress. Same data shape the aligner
// in the editor backend produces.

export interface Word { w: string; start: number; end: number; conf?: number; line: number; gi: number }
export interface Line { i: number; text: string; start: number; end: number; words: Word[] }

const fold = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();

export class Lyrics {
  lines: Line[];
  words: Word[];

  constructor(j: { lines?: any[] }) {
    this.lines = (j.lines ?? []).map((l: any, li: number) => {
      const words: Word[] = (l.words ?? []).map((w: any, wi: number) => ({
        w: String(w.w ?? w.word ?? ''),
        start: +w.start, end: +w.end, conf: w.conf != null ? +w.conf : undefined,
        line: li, gi: 0,
      }));
      const text = String(l.text ?? words.map((w) => w.w).join(' '));
      return { i: li, text, start: l.start ?? words[0]?.start ?? 0, end: l.end ?? words[words.length - 1]?.end ?? 0, words };
    });
    this.words = this.lines.flatMap((l) => l.words);
    this.words.forEach((w, i) => (w.gi = i));
  }

  /** The line being spoken at t (or null in a pause). */
  lineAt(t: number): Line | null {
    return this.lines.find((l) => t >= l.start && t < l.end) ?? null;
  }

  /** Most recent line that started at or before t. */
  lastLine(t: number): Line | null {
    let best: Line | null = null;
    for (const l of this.lines) if (l.start <= t) best = l;
    return best;
  }

  /** Lines whose text contains s (case-insensitive). */
  find(s: string): Line[] {
    const q = fold(s);
    return this.lines.filter((l) => fold(l.text).includes(q));
  }

  /** First line containing s; throws if missing (fail loudly while authoring). */
  get(s: string, nth = 0): Line {
    const l = this.find(s)[nth];
    if (!l) throw new Error(`lyric not found: "${s}"`);
    return l;
  }

  wordAt(t: number): Word | null {
    return this.words.find((w) => t >= w.start && t < w.end) ?? null;
  }

  lastWord(t: number): Word | null {
    let best: Word | null = null;
    for (const w of this.words) if (w.start <= t) best = w;
    return best;
  }

  /** Sung progress of a word at t: 0 before start, 1 after end, linear inside. */
  static wordProgress(w: Word, t: number): number {
    if (t <= w.start) return 0;
    if (t >= w.end) return 1;
    return (t - w.start) / Math.max(1e-3, w.end - w.start);
  }

  /** The whole lyric track condensed to global speech start/end (0 when empty). */
  span(): { start: number; end: number } {
    const first = this.lines[0], last = this.lines[this.lines.length - 1];
    return { start: first?.start ?? 0, end: last?.end ?? 0 };
  }
}
