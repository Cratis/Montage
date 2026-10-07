// Scene API. A scene owns a time window of the show and paints the full frame into the
// 2D context it is given (already sized to the show canvas). Everything must be a
// deterministic function of time: same t in, same pixels out — that is what makes the
// browser preview and the exported MP4 identical, and scrubbing free.

import type { AudioData, AudioSample } from './audio';
import type { Lyrics } from './lyrics';
import type { Theme } from './theme';
import type { SceneSpec } from '../spec';
import { rng } from './util';

export interface SceneCtx {
  W: number;
  H: number;
  id: string;
  spec: SceneSpec;
  params: Record<string, any>;
  theme: Theme;
  audio: AudioData;
  lyrics: Lyrics;
  /** Package base URL, for fetching assets (marks, images). */
  base: string;
}

export interface Frame {
  /** Show time (s). */
  t: number;
  /** Time since the previous rendered frame (1/fps on export; 0 after a seek). */
  dt: number;
  /** Local time since this scene's start, and 0..1 progress through its window. */
  lt: number;
  p: number;
  start: number;
  end: number;
  /** True when time jumped (scrub/seek). */
  seeked: boolean;
  /** Audio features at t (voice envelope, word-onset pulse). */
  a: AudioSample;
  /** Voice words: active/last word and its karaoke progress at t. */
  word: { text: string; progress: number } | null;
  /** Deterministic per-scene RNG, re-seeded on every frame — usable freely inside a frame. */
  rng: () => number;
}

export abstract class Scene {
  constructor(protected ctx: SceneCtx) {}

  /** Load resources (images, fonts). Called once before the first render; may be async. */
  init(): Promise<void> | void {}

  /** Paint the frame. Must fully cover the canvas — start from ambient(ctx, ...) or your own ground. */
  abstract render(f: Frame, c: CanvasRenderingContext2D): void;

  dispose(): void {}
}

export type SceneClass = new (ctx: SceneCtx) => Scene;
