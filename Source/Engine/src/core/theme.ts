// Cratis dark — the default theme. Tokens from the Cratis visual language:
// near-black grounds, warm off-white ink, restrained violet accent, sparse amber signal,
// hairline rules, a dot-grid canvas with one soft glow. Type: Space Grotesk (display),
// Inter (body), JetBrains Mono (technical labels).

export interface Theme {
  key: string;
  bg: string;
  bg2: string;
  surface: string;
  surface2: string;
  rule: string;
  ruleSoft: string;
  ink: string;
  dim: string;
  faint: string;
  violet: string;
  blue: string;
  orange: string;
  teal: string;
  /** The accent everything signal-coloured uses. */
  accent: string;
  /** Amber, used sparingly (deltas, warnings, one highlight per plate at most). */
  signal: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  /** Ambient background painter id. */
  ambient: 'dotgrid';
}

export const cratisDark: Theme = {
  key: 'cratis-dark',
  bg: '#0b0d12',
  bg2: '#0e1119',
  surface: '#141824',
  surface2: '#1a2030',
  rule: 'rgba(255,255,255,0.10)',
  ruleSoft: 'rgba(255,255,255,0.06)',
  ink: '#f0eee6',
  dim: '#9aa1b0',
  faint: '#5c6272',
  violet: '#8c7cf6',
  blue: '#5b8def',
  orange: '#f2a340',
  teal: '#43bfa0',
  accent: '#8c7cf6',
  signal: '#f2a340',
  fontDisplay: '"Space Grotesk", "Inter", system-ui, sans-serif',
  fontBody: '"Inter", system-ui, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  ambient: 'dotgrid',
};

export const themes: Record<string, Theme> = { 'cratis-dark': cratisDark };
export const themeOrDefault = (key?: string) => themes[key ?? ''] ?? cratisDark;

/** css color with alpha, from #rgb/#rrggbb or rgb(). */
export function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${a})`);
  if (color.startsWith('rgb')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return color;
}

/** Mix two hex colors (t=0 -> a, t=1 -> b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
