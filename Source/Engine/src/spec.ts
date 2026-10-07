// The show spec: the data contract between whatever produces a show (the AI planner in the
// editor, or a human hand-writing JSON) and this engine. A show package on disk is:
//
//   show.json          this spec
//   audio/voiceover.mp3
//   data/lyrics.json   word-level timings
//   data/audio.json    envelope analysis
//
// Everything except the scenes themselves is optional; the engine degrades gracefully
// (no lyrics -> proportional timing, no audio -> silent, spec.duration wins over all).

/** How a scene hands over to the next one. */
export type TransitionKind = 'cut' | 'crossfade' | 'wipe' | 'slide' | 'zoom' | 'rise';

/** One scene (plate) of the show. */
export interface SceneSpec {
  /** Stable id — referenced by renders, captions and logs. */
  id: string;
  /** Scene type key from the registry (title, kinetic, steps, compare, flow, metric, chart, quote, code, endcard). */
  type: string;
  /** Literal window, seconds. When given it wins over all timing inference. */
  start?: number;
  end?: number;
  /**
   * Timing anchor: the scene cuts in the pause just before the first lyric line containing
   * this text (case-insensitive). This is how scenes lock to the voice.
   */
  anchor?: string;
  /** Nth matching line for the anchor (default 0). */
  anchorNth?: number;
  /** Extra seconds before the anchor line (default 0 — the pause-hug is automatic). */
  anchorOffset?: number;
  /** End anchor: the scene holds until the pause after the line containing this text. */
  holdsUntil?: string;
  /** Fallback length when nothing else determines the end (default 6). */
  duration?: number;
  /** Extra silent lead-in before the content of the scene starts. */
  leadIn?: number;
  /** Incoming transition kind (default 'crossfade'; the first scene always starts on a cut). */
  transitionIn?: TransitionKind;
  /** Transition length in seconds (default 0.6). */
  transitionDuration?: number;
  /** Small caption chip, bottom-left: a figure number and a line of mono text. */
  caption?: { fig?: string; text: string };
  /** Type-specific parameters — see each scene's docs. */
  params?: Record<string, any>;
}

/** Brand overlay. The mark sits bottom-right in the safe area for the whole show. */
export interface BrandSpec {
  /** Brand name next to the mark (default 'Cratis'). */
  name?: string;
  /** Right side of the brand row (e.g. a product name). */
  product?: string;
  /** URL (absolute, or package-relative) of the mark SVG. */
  markUrl?: string;
  /** Hide the persistent corner mark (default false). */
  hideMark?: boolean;
}

/** The whole show. */
export interface ShowSpec {
  /** Package id (used for logging). */
  id: string;
  title: string;
  /** One-line description; shows in the endcard when no headline is given there. */
  description?: string;
  /** Canvas size (default 1920x1080) and frame rate (default 60). */
  width?: number;
  height?: number;
  fps?: number;
  /** Theme key (default 'cratis-dark' — currently the only theme). */
  theme?: string;
  brand?: BrandSpec;
  /** Package-relative voiceover path (default 'audio/voiceover.mp3'). Absent = silent show. */
  voiceover?: string | null;
  /** Total duration when there is no voiceover to measure (seconds). */
  duration?: number;
  scenes: SceneSpec[];
}

/** Fill defaults and sanity-check a parsed spec. Throws with a readable message when unusable. */
export function normalizeSpec(raw: any): ShowSpec {
  if (!raw || typeof raw !== 'object') throw new Error('show.json is not an object');
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) throw new Error('show.json has no scenes');
  const spec: ShowSpec = {
    id: String(raw.id ?? 'show'),
    title: String(raw.title ?? raw.id ?? 'Untitled'),
    description: raw.description ? String(raw.description) : undefined,
    width: raw.width ?? 1920,
    height: raw.height ?? 1080,
    fps: raw.fps ?? 60,
    theme: raw.theme ?? 'cratis-dark',
    brand: raw.brand ?? {},
    voiceover: raw.voiceover === null ? null : String(raw.voiceover ?? 'audio/voiceover.mp3'),
    duration: raw.duration ?? undefined,
    scenes: raw.scenes.map((s: any, i: number) => ({
      id: String(s.id ?? `scene-${i + 1}`),
      type: String(s.type ?? 'kinetic'),
      start: s.start,
      end: s.end,
      anchor: s.anchor,
      anchorNth: s.anchorNth,
      anchorOffset: s.anchorOffset,
      holdsUntil: s.holdsUntil,
      duration: s.duration,
      leadIn: s.leadIn,
      transitionIn: s.transitionIn,
      transitionDuration: s.transitionDuration,
      caption: s.caption,
      params: s.params ?? {},
    })),
  };
  if (spec.width! < 320 || spec.height! < 180) throw new Error('show.json canvas is too small');
  return spec;
}
