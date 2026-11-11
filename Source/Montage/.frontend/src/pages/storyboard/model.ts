// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

/** One scene in the storyboard being edited. */
export interface Scene {
    type: string;
    spoken: string;
    params: Record<string, unknown>;
}

/** What the pipeline recorded for one scene (voiceover/voiceover/scenes.json). */
export interface SceneMeta {
    index: number;
    scene_id: string;
    file: string;
    duration: number;
    offset: number;
    spoken: string;
}

/** The engine's scene types - what each one renders. */
export const TYPES: { value: string; label: string; hint: string }[] = [
    { value: 'title', label: 'Title', hint: 'opener with a kicker and headline' },
    { value: 'statement', label: 'Statement', hint: 'one strong claim, big and centered' },
    { value: 'kinetic', label: 'Kinetic', hint: 'narration shown word by word, karaoke style' },
    { value: 'steps', label: 'Steps', hint: 'numbered how-it-works list' },
    { value: 'compare', label: 'Compare', hint: 'before / after, two sides' },
    { value: 'flow', label: 'Flow', hint: 'pipeline of nodes lighting up' },
    { value: 'diagram', label: 'Infographic', hint: 'editable SVG boxes, routed connectors and per-element choreography' },
    { value: 'image', label: 'Images', hint: 'pictures with per-image motion' },
    { value: 'metric', label: 'Metric', hint: 'one big number, counting up' },
    { value: 'chart', label: 'Chart', hint: 'bar or line chart, drawn' },
    { value: 'quote', label: 'Quote', hint: 'a quotation with attribution' },
    { value: 'code', label: 'Code', hint: 'code panel, lines highlighted' },
    { value: 'endcard', label: 'Endcard', hint: 'closing card with CTA' },
];

/** Motion presets a scene type understands (params.motion - also describable in the inspector). */
export const MOTION_PRESETS: Record<string, { value: string; label: string }[]> = {
    title: [{ value: 'rise', label: 'Rise in' }, { value: 'pop', label: 'Pop with overshoot' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    statement: [{ value: 'wipe', label: 'Character wipe' }, { value: 'pop', label: 'Pop in' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    endcard: [{ value: 'rise', label: 'Rise in' }, { value: 'pop', label: 'Pop in' }, { value: 'fade', label: 'Fade in' }],
    chart: [{ value: 'grow', label: 'Grow from baseline' }, { value: 'pop', label: 'Pop with overshoot' }, { value: 'fade', label: 'Fade in' }],
    flow: [{ value: 'pop', label: 'Pop in sequence' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    metric: [{ value: 'count', label: 'Count up' }, { value: 'fade', label: 'Fade in' }],
    steps: [{ value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }, { value: 'pop', label: 'Pop in' }],
    compare: [{ value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }, { value: 'pop', label: 'Pop panels' }],
};

/** Sensible starting params when a scene switches type. */
export const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
    title: { kicker: 'cratis · montage', headline: 'A better way to explain' },
    statement: { headline: 'This changes how you work' },
    kinetic: { emphasis: [] },
    steps: { steps: [{ title: 'First', text: 'what happens first' }, { title: 'Then', text: 'what happens next' }, { title: 'Finally', text: 'what it means' }] },
    compare: { left: { title: 'Before', points: ['slow', 'manual', 'fragile'] }, right: { title: 'After', points: ['fast', 'automatic', 'deterministic'] } },
    flow: { nodes: [{ label: 'describe' }, { label: 'plan' }, { label: 'render' }] },
    metric: { value: 60, format: 'number', label: 'frames per second' },
    chart: { type: 'bar', labels: ['before', 'after'], values: [10, 2] },
    quote: { text: 'Something worth quoting goes here.' },
    code: { language: 'typescript', code: 'const show = describe(video);' },
    endcard: { headline: 'Stop keyframing' },
};

export const asString = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
export const asNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const csv = (v: unknown) => asList(v).map((x) => String(x)).join(', ');
export const fromCsv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
export const fromCsvNumbers = (v: string) => v.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
export const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;

export type SceneImage = { src: string; headline?: string; text?: string; motion?: string; describe?: string };

export const TABS = [
    { id: 'preview', label: 'Preview' },
    { id: 'content', label: 'Content' },
    { id: 'visuals', label: 'Visuals' },
    { id: 'narration', label: 'Narration' },
    { id: 'motion', label: 'Motion' },
    { id: 'design', label: 'Design' },
    { id: 'pacing', label: 'Pacing' },
    { id: 'timing', label: 'Timing' },
] as const;
export const pad2 = (n: number) => String(n).padStart(2, '0');
