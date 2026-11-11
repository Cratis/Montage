// The edit: which scene plays when, resolved from the spec. When a voiceover exists,
// every cut sits in the pause before the line a scene is anchored to (never after its
// first word), exactly like a picture editor cutting on breaths. Without lyrics, windows
// fall back to the spec's literal start/end or equal division of spec.duration.

import type { ShowSpec, SceneSpec } from '../spec';
import type { Lyrics } from './lyrics';
import type { AudioData } from './audio';

export interface TimelineEntry {
  id: string;
  type: string;
  spec: SceneSpec;
  start: number;
  end: number;
  transitionIn: 'cut' | 'crossfade' | 'wipe' | 'slide' | 'zoom' | 'rise';
  transitionDuration: number;
}

/** Where a scene is anchored in the voiceover: a phrase, which occurrence, and nudges. */
interface Anchor { q: string; nth: number; offset: number; leadIn: number }

/** Cut in the pause before the line containing the anchor: 0.18s before its first word (less if the pause is short). */
function cutBefore(lyrics: Lyrics, anchor: Anchor): number {
  const { q, nth, offset, leadIn } = anchor;
  const l = lyrics.get(q, nth);
  const prev = lyrics.lines[l.i - 1];
  const gap = prev ? l.start - prev.end : 1;
  const hug = Math.min(0.18, Math.max(0.04, gap * 0.45));
  return Math.max(0, l.start - hug + offset + (leadIn ?? 0));
}

/** End just after the pause following the line containing q. */
function endAfter(lyrics: Lyrics, q: string, nth: number, fallback: number): number {
  const found = lyrics.find(q)[nth];
  if (!found) return fallback;
  const next = lyrics.lines[found.i + 1];
  const gap = next ? next.start - found.end : 0.8;
  return found.end + Math.min(0.5, Math.max(0.12, gap * 0.4));
}

const DEFAULT_SCENE_SECONDS = 6;
const durationOf = (s: SceneSpec) => s.duration ?? DEFAULT_SCENE_SECONDS;

type Window = { start: number; end: number };

/** Pass 1: resolve every scene's window from the spec and the voiceover anchors. */
function resolveWindows(spec: ShowSpec, lyrics: Lyrics | null): Window[] {
  const voiced = lyrics !== null && lyrics.lines.length > 0 ? lyrics : null;
  return spec.scenes.map((s) => {
    if (s.start != null && s.end != null) return { start: s.start, end: s.end };
    return (voiced && anchoredWindow(voiced, s)) || { start: s.start ?? NaN, end: s.end ?? NaN };
  });
}

/** The window of a scene anchored to the voiceover, or null when it has no anchor. */
function anchoredWindow(lyrics: Lyrics, s: SceneSpec): Window | null {
  if (!s.anchor) return null;
  const fallbackDur = durationOf(s);
  const start = cutBefore(lyrics, { q: s.anchor, nth: s.anchorNth ?? 0, offset: s.anchorOffset ?? 0, leadIn: s.leadIn ?? 0 });
  const end = s.end ?? (s.holdsUntil ? endAfter(lyrics, s.holdsUntil, 0, start + fallbackDur) : start + fallbackDur);
  return { start, end: Math.max(end, start + 1) };
}

/** Pass 2: fill the holes with equal division of whatever remains around them. */
function fillHoles(spec: ShowSpec, windows: Window[], total: number): void {
  const pinned = windows.map((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
  if (pinned.every(Boolean)) return;
  const dur = total || spec.scenes.reduce((acc, s, i) => acc + (pinned[i]! ? windows[i]!.end - windows[i]!.start : durationOf(s)), 0);
  const free = spec.scenes.filter((_, i) => !pinned[i]!);
  const freeDur = free.reduce((acc, s) => acc + durationOf(s), 0);
  let cursor = 0;
  spec.scenes.forEach((s, i) => {
    if (pinned[i]!) {
      cursor = Math.max(cursor, windows[i]!.end);
      return;
    }
    const share = dur * (durationOf(s) / (freeDur || 1));
    const start = Math.max(cursor, Number.isFinite(windows[i]!.start) ? windows[i]!.start! : cursor);
    windows[i] = { start, end: start + Math.max(1, share) };
    cursor = windows[i]!.end;
  });
}

/** Monotonicity: scenes never overlap backwards; tiny overlaps (transitions) stay. */
function enforceMonotonic(windows: Window[]): void {
  for (let i = 1; i < windows.length; i++) {
    if (windows[i]!.start < windows[i - 1]!.start) windows[i]!.start = windows[i - 1]!.start;
  }
}

/** Pass 3: the last scene never runs past the end of the show. */
function clampLastToTotal(windows: Window[], total: number): void {
  if (!(Number.isFinite(total) && total > 0)) return;
  const last = windows[windows.length - 1]!;
  if (last.end > total) last.end = total;
}

function toEntries(spec: ShowSpec, windows: Window[]): TimelineEntry[] {
  return spec.scenes.map((s, i) => {
    const w = windows[i]!;
    const tIn = s.transitionIn ?? (i === 0 ? 'cut' : 'crossfade');
    const tDur = Math.min(s.transitionDuration ?? 0.6, Math.max(0.1, (w.end - w.start) / 2 - 0.05));
    return {
      id: s.id,
      type: s.type,
      spec: s,
      start: w.start,
      end: Math.max(w.end, w.start + 0.5),
      transitionIn: tIn,
      transitionDuration: tDur,
    };
  });
}

export function buildTimeline(spec: ShowSpec, lyrics: Lyrics | null, audio: AudioData | null): TimelineEntry[] {
  const total = audio?.duration || spec.duration || lyrics?.span().end || 0;
  const windows = resolveWindows(spec, lyrics);
  fillHoles(spec, windows, total);
  enforceMonotonic(windows);
  clampLastToTotal(windows, total);
  return toEntries(spec, windows);
}
