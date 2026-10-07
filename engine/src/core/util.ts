// Small math toolbox. Everything here is deterministic — no Math.random.

export const clamp = (x: number, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const inv = (a: number, b: number, x: number) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, clamp(inv(a, b, x)));
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outBack: (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  outSoft: (t: number) => 1 - Math.pow(1 - t, 2.2),
};
/** Smooth 0..1 ramp that is 0 before a, 1 after b (seconds), with eased middle. */
export const ramp = (t: number, a: number, b: number) => ease.inOutCubic(clamp(inv(a, b, t)));
/** 1 -> 0 decay with the given half-life. */
export const decay = (dt: number, halfLife: number) => (dt <= 0 ? 1 : Math.pow(0.5, dt / halfLife));

/** Deterministic seeded RNG (mulberry32). Scenes use `f.rng` so scrubs and exports agree. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stable numeric hash of a string (for per-scene seeds). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Turn straight quotes/apostrophes into typographic ones for display text. */
export const smart = (s: string) => s
  .replace(/(^|[\s(\[{])"/g, '$1\u201C').replace(/"/g, '\u201D')
  .replace(/(^|[\s(\[{])'/g, '$1\u2018').replace(/'/g, '\u2019')
  .replace(/--/g, '\u2014').replace(/\.\.\./g, '\u2026');
