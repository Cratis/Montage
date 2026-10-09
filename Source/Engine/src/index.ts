// montage-engine — public surface.

export { MontageEngine } from './core/engine';
export { Player } from './player';
export { normalizeSpec, type ShowSpec, type SceneSpec, type BrandSpec, type TransitionKind } from './spec';
export { registry } from './core/registry';
export { Scene, type Frame, type SceneCtx, type SceneClass } from './core/scene';
export { Lyrics, type Word, type Line } from './core/lyrics';
export { AudioData, type AudioSample } from './core/audio';
export { buildTimeline, type TimelineEntry } from './core/timeline';
export { themes, themeOrDefault, cratisDark, type Theme } from './core/theme';
