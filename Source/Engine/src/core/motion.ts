// Motion presets: how a scene's infographic enters and builds. The storyboard's Motion tab
// writes `params.motion` - a preset name or `{ preset, duration }` - and the scenes read it
// through here, so one knob shapes the same drawing across every scene type.
//
//   grow   bar/metric values rise from their baseline (chart bars, metric columns)
//   draw   strokes reveal as if drawn by hand (chart line, flow connectors)
//   pop    elements scale in with a small overshoot, staggered (flow nodes, chart bars alt)
//   slide  elements arrive from a side (steps, compare halves)
//   fade   plain opacity, no movement
//   count  the number counts up (metric default)

import { ease } from './util';

export interface MotionSpec {
  /** Preset name (scene-appropriate default when absent). */
  preset: string;
  /** Seconds the build takes; the scene's own default when absent. */
  duration?: number;
}

/** Read `params.motion` - either `'draw'` or `{ preset: 'draw', duration: 1.2 }`. */
export function motionOf(params: Record<string, any>, sceneDefault: string): MotionSpec {
  const raw = params?.motion;
  if (typeof raw === 'string') return { preset: raw || sceneDefault };
  if (raw && typeof raw === 'object') {
    return { preset: String(raw.preset ?? sceneDefault), duration: raw.duration !== undefined ? Number(raw.duration) : undefined };
  }
  return { preset: sceneDefault };
}

/** The eased progress for a window, honoring the preset's character and duration. */
export function enter(motion: MotionSpec, lt: number, start: number, fallbackEnd: number): number {
  const end = start + (motion.duration ?? fallbackEnd - start);
  const p = Math.min(1, Math.max(0, (lt - start) / Math.max(0.05, end - start)));
  switch (motion.preset) {
    case 'pop': return ease.outBack(p);
    case 'slide': return ease.outCubic(p);
    case 'fade': return ease.outSoft(p);
    case 'draw': return ease.inOutCubic(p);
    case 'count': return ease.outExpo(p);
    case 'grow':
    default: return ease.outCubic(p);
  }
}

/** Whether the preset implies an overshoot scale (pop) rather than a plain reveal. */
export function isPop(motion: MotionSpec): boolean {
  return motion.preset === 'pop';
}

/** Whether the preset means plain opacity (no translate/scale). */
export function isFade(motion: MotionSpec): boolean {
  return motion.preset === 'fade';
}

/** Slide offset in pixels for slide presets (0 for others). */
export function slideOffset(motion: MotionSpec, amount: number): number {
  if (motion.preset !== 'slide') return 0;
  return amount;
}
