// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@cratis/components/Common';
import { Show } from '../../Api/Shows/Listing';
import { All as AllJobs, JobActivity } from '../../Api/Shows/Production';
import { JobRow } from './JobRow';
import { SaveStoryboard } from '../../Api/Shows/Storyboard';
import { SaveSceneTiming } from '../../Api/Shows/Timing/SaveSceneTiming';
import { ShowPlan } from '../plan';

/** One scene in the storyboard being edited. */
interface Scene {
    type: string;
    spoken: string;
    params: Record<string, unknown>;
}

/** What the pipeline recorded for one scene (voiceover/voiceover/scenes.json). */
interface SceneMeta {
    index: number;
    scene_id: string;
    file: string;
    duration: number;
    offset: number;
    spoken: string;
}

/** The engine's scene types - what each one renders. */
const TYPES: { value: string; label: string; hint: string }[] = [
    { value: 'title', label: 'Title', hint: 'opener with a kicker and headline' },
    { value: 'statement', label: 'Statement', hint: 'one strong claim, big and centered' },
    { value: 'kinetic', label: 'Kinetic', hint: 'narration shown word by word, karaoke style' },
    { value: 'steps', label: 'Steps', hint: 'numbered how-it-works list' },
    { value: 'compare', label: 'Compare', hint: 'before / after, two sides' },
    { value: 'flow', label: 'Flow', hint: 'pipeline of nodes lighting up' },
    { value: 'metric', label: 'Metric', hint: 'one big number, counting up' },
    { value: 'chart', label: 'Chart', hint: 'bar or line chart, drawn' },
    { value: 'quote', label: 'Quote', hint: 'a quotation with attribution' },
    { value: 'code', label: 'Code', hint: 'code panel, lines highlighted' },
    { value: 'endcard', label: 'Endcard', hint: 'closing card with CTA' },
];

/** Motion presets a scene type understands (params.motion - also describable in the inspector). */
const MOTION_PRESETS: Record<string, { value: string; label: string }[]> = {
    title: [{ value: 'rise', label: 'Rise in' }, { value: 'pop', label: 'Pop with overshoot' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    statement: [{ value: 'wipe', label: 'Character wipe' }, { value: 'pop', label: 'Pop in' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    endcard: [{ value: 'rise', label: 'Rise in' }, { value: 'pop', label: 'Pop in' }, { value: 'fade', label: 'Fade in' }],
    chart: [{ value: 'grow', label: 'Grow from baseline' }, { value: 'pop', label: 'Pop with overshoot' }, { value: 'fade', label: 'Fade in' }],
    flow: [{ value: 'pop', label: 'Pop in sequence' }, { value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }],
    metric: [{ value: 'count', label: 'Count up' }, { value: 'fade', label: 'Fade in' }],
    steps: [{ value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }, { value: 'pop', label: 'Pop in' }],
    compare: [{ value: 'slide', label: 'Slide in' }, { value: 'fade', label: 'Fade in' }, { value: 'pop', label: 'Pop panels' }],
};

/** The voice dropdown: what the text-to-speech service actually offers, with an audition button. */
function VoicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [voices, setVoices] = useState<string[]>([]);
    const [previewing, setPreviewing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/motion/voices')
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setVoices(d.voices ?? []); })
            .catch(() => { /* dropdown falls back to the current value */ });
        return () => { cancelled = true; };
    }, []);

    const preview = async () => {
        setPreviewing(true);
        try {
            const audio = new Audio(`/api/motion/voices/preview?voice=${encodeURIComponent(value)}`);
            audio.onended = () => setPreviewing(false);
            audio.onerror = () => setPreviewing(false);
            await audio.play();
        } catch { setPreviewing(false); }
    };

    return (
        <div className='flex gap-2'>
            <select
                className='flex-1 panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent mono'
                value={value}
                onChange={(e) => onChange(e.target.value)}>
                {!voices.includes(value) && <option value={value}>{value || 'pick a voice'}</option>}
                {voices.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button
                className='panel px-3 grid place-items-center hover:border-[var(--cr-motion-violet)] text-[var(--cr-motion-dim)] hover:text-[var(--cr-motion-ink)]'
                title='Hear this voice say a line'
                disabled={previewing || !value}
                onClick={preview}>
                {previewing ? '…' : '▶'}
            </button>
        </div>
    );
}

/** Sensible starting params when a scene switches type. */
const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
    title: { kicker: 'cratis · motion', headline: 'A better way to explain' },
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

const asString = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const asNumber = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const csv = (v: unknown) => asList(v).map((x) => String(x)).join(', ');
const fromCsv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
const fromCsvNumbers = (v: string) => v.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Small labeled text input. */
function Field({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
    return (
        <label className='block'>
            <span className='eyebrow block mb-1.5'>{label}</span>
            <input
                className={`w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent ${mono ? 'mono' : ''}`}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)} />
        </label>
    );
}

/** Comma-separated list input producing a string array. */
function ListField({ label, value, onChange, placeholder }: { label: string; value: unknown; onChange: (v: string[]) => void; placeholder?: string }) {
    return (
        <Field
            label={`${label} (comma-separated)`}
            value={csv(value)}
            onChange={(v) => onChange(fromCsv(v))}
            placeholder={placeholder} />
    );
}

/**
 * The storyboard editor: the show laid out as its scenes, each with the engine's own mid-scene
 * still as its preview. Drag scenes to reorder (the row flies with the pointer, ghosted), click
 * one to play it with its voice and edit content, narration, motion and timing in tabs.
 *
 * Embedded as the Storyboard tab of the show page: it owns the scene state and the save logic,
 * while the page header owns the Save buttons (handed up through registerSave) and the busy/
 * error state (passed down).
 */
export function StoryboardEditor({
    show, registerSave, registerDirty, busy, setBusy, saveError, setSaveError,
}: {
    show: Show;
    registerSave: (save: (produce: boolean) => void) => void;
    registerDirty: (dirty: boolean) => void;
    busy: boolean;
    setBusy: (busy: boolean) => void;
    saveError: string;
    setSaveError: (error: string) => void;
}) {
    const id = show.id.toString();
    const plan = useMemo(() => ShowPlan.parse(show?.planJson), [show?.planJson]);

    const [title, setTitle] = useState<string>('');
    const [voice, setVoice] = useState<string>('af_heart');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loadedFor, setLoadedFor] = useState<string>('');
    const [command, setValues] = SaveStoryboard.use();
    const [inspecting, setInspecting] = useState<number | null>(null);
    const [jobs] = AllJobs.use();
    const showJobs = jobs.data
        .filter((job: JobActivity) => job.showId === id)
        .sort((a: JobActivity, b: JobActivity) => new Date(b.created).getTime() - new Date(a.created).getTime());

    // production artifacts: per-scene voice metadata + the engine's mid-scene stills
    const [sceneMeta, setSceneMeta] = useState<Record<number, SceneMeta>>({});
    const [snapshots, setSnapshots] = useState<Record<number, string>>({});

    // unsaved changes: everything after the last load/save counts, reported to the page
    // so leaving the tab can ask whether to discard or generate
    const savedSnapshot = useRef('');

    // drag & drop
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const dragState = useRef<{ startX: number; startY: number; moved: boolean; rect: DOMRect } | null>(null);
    // the floating copy of the dragged row - follows the pointer at 60% scale, slightly tilted
    const [ghost, setGhost] = useState<{ index: number; x: number; y: number; width: number; height: number; grabX: number; grabY: number } | null>(null);

    // seed the editor once the show's plan is in view
    useEffect(() => {
        if (!show || loadedFor === show.id.toString()) return;
        setLoadedFor(show.id.toString());
        setTitle(plan?.title || show.title);
        setVoice(show.voice || 'af_heart');
        setScenes((plan?.scenes ?? []).map((s) => ({ type: s.type, spoken: s.spoken ?? '', params: { ...(s.params ?? {}) } })));
        savedSnapshot.current = '';
    }, [show, plan, loadedFor]);

    const [snapshotSeeded, setSnapshotSeeded] = useState(false);
    useEffect(() => {
        if (!loadedFor || snapshotSeeded || scenes.length === 0) return;
        if (savedSnapshot.current === '') {
            savedSnapshot.current = JSON.stringify({ title, voice, scenes });
            setSnapshotSeeded(true);
        }
    }, [loadedFor, snapshotSeeded, title, voice, scenes]);

    // production artifacts exist after the pipeline has spoken and packaged - refresh on status change
    useEffect(() => {
        if (!show || !id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/packages/${id}/voiceover/scenes.json`);
                if (res.ok && !cancelled) {
                    const doc = await res.json();
                    const meta: Record<number, SceneMeta> = {};
                    for (const s of doc.scenes ?? []) meta[s.index] = s;
                    setSceneMeta(meta);
                } else if (!cancelled) setSceneMeta({});
            } catch { if (!cancelled) setSceneMeta({}); }

            // probe one still per scene; missing files just leave placeholders
            const found: Record<number, string> = {};
            await Promise.all(scenes.map(async (_, i) => {
                const url = `/packages/${id}/snapshot/scene-${pad2(i + 1)}.png`;
                try {
                    const probe = await fetch(url, { method: 'HEAD' });
                    if (probe.ok && !cancelled) found[i] = url;
                } catch { /* placeholder stays */ }
            }));
            if (!cancelled) setSnapshots(found);
        })();
        return () => { cancelled = true; };
    }, [show?.status, id, scenes.length]);

    if (!show) {
        return (
            <div className='min-h-screen grid place-items-center text-[var(--cr-motion-dim)]'>Loading…</div>
        );
    }

    const update = (index: number, patch: Partial<Scene>) =>
        setScenes(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    const setParam = (index: number, key: string, value: unknown) =>
        setScenes(scenes.map((s, i) => (i === index ? { ...s, params: { ...s.params, [key]: value } } : s)));

    const addScene = (after: number) => {
        const next = [...scenes];
        next.splice(after + 1, 0, { type: 'kinetic', spoken: '', params: { ...DEFAULT_PARAMS.kinetic } });
        setScenes(next);
    };

    const duplicate = (index: number) => {
        const next = [...scenes];
        next.splice(index + 1, 0, JSON.parse(JSON.stringify(scenes[index])));
        setScenes(next);
    };

    const remove = (index: number) => setScenes(scenes.filter((_, i) => i !== index));

    const changeType = (index: number, type: string) =>
        setScenes(scenes.map((s, i) => (i === index ? { type, spoken: s.spoken, params: { ...(DEFAULT_PARAMS[type] ?? {}) } } : s)));

    // ---- drag & drop -----------------------------------------------------------------------
    const beginDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
        if (e.button !== 0) return;
        dragState.current = { startX: e.clientX, startY: e.clientY, moved: false, rect: e.currentTarget.getBoundingClientRect() };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const st = dragState.current;
        if (!st) return;
        if (!st.moved && Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 8) return;
        if (!st.moved) {
            st.moved = true;
            setGhost({ index: dragIndex ?? 0, x: e.clientX, y: e.clientY, width: st.rect.width, height: st.rect.height, grabX: e.clientX - st.rect.left, grabY: e.clientY - st.rect.top });
        }
        setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY, index: dragIndex ?? g.index } : g));
        setDragIndex((current) => current ?? 0);
        setDragIndex((current) => {
            const from = current ?? 0;
            // which gap is the pointer over? compare against card midpoints (dragged card excluded)
            let target = scenes.length - 1;
            for (let i = 0; i < cardRefs.current.length; i++) {
                if (i === from) continue;
                const el = cardRefs.current[i];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) { target = i > from ? i - 1 : i; break; }
                target = i > from ? i : scenes.length - 1;
            }
            setDropIndex(target);
            return from;
        });
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
        const st = dragState.current;
        dragState.current = null;
        if (!st) return;
        if (!st.moved) {
            // a click, not a drag: open the scene inspector
            setInspecting(index);
            setDragIndex(null);
            setDropIndex(null);
            return;
        }
        const from = dragIndex ?? index;
        const to = dropIndex ?? from;
        if (from !== to) {
            const next = [...scenes];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            setScenes(next);
        }
        setDragIndex(null);
        setDropIndex(null);
        setGhost(null);
    };

    // the show page header owns the Save buttons - keep the closure it holds current
    useEffect(() => { registerSave(save); });

    // and the page asks before discarding unsaved edits
    useEffect(() => {
        if (!snapshotSeeded) return;
        registerDirty(JSON.stringify({ title, voice, scenes }) !== savedSnapshot.current);
    });

    const totalWords = scenes.reduce((sum, s) => sum + wordsIn(s.spoken), 0);

    const save = async (produce: boolean) => {
        setBusy(true);
        setSaveError('');
        try {
            // params travel as plain JSON - the backend binds them into JsonElement parameters
            setValues({
                showId: id,
                title,
                voice,
                scenes: scenes.map((s) => ({ type: s.type, spoken: s.spoken, params: s.params })) as never,
                render: produce,
            } as never);
            const result = await command.execute();
            if (result.isSuccess) {
                savedSnapshot.current = JSON.stringify({ title, voice, scenes });
            } else {
                const problems = [...result.validationResults.map((v) => v.message), ...result.exceptionMessages].filter(Boolean);
                setSaveError(problems.length > 0 ? problems.join('; ') : 'The storyboard could not be saved.');
            }
        } catch (error) {
            setSaveError(String((error as Error)?.message ?? error));
        } finally {
            setBusy(false);
        }
    };

    const DropLine = ({ gap }: { gap: number }) => (
        <div
            className='relative h-0'
            style={{ marginTop: gap ? -2 : 0 }}>
            {dropIndex === gap && (
                <div className='absolute left-0 right-0 h-[3px] rounded-full bg-[var(--cr-motion-violet)] shadow-[0_0_12px_var(--cr-motion-violet)]'>
                    <div className='absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[var(--cr-motion-violet)]' />
                </div>
            )}
        </div>
    );

    return (
        <>
            <section className='panel p-5 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4'>
                <Field label='Title' value={title} onChange={setTitle} />
                <label className='block'>
                    <span className='eyebrow block mb-1.5'>Voice</span>
                    <VoicePicker value={voice} onChange={setVoice} />
                </label>
                <div className='text-xs text-[var(--cr-motion-faint)] self-end pb-2 mono'>
                    {scenes.length} scenes · ~{Math.round(totalWords / 2.7)}s spoken · {totalWords} words
                </div>
            </section>

            <div className='flex flex-col'>
                {scenes.map((scene, index) => {
                    const meta = sceneMeta[index + 1];
                    const dragging = dragIndex === index;
                    const meta2 = TYPES.find((t) => t.value === scene.type);
                    return (
                        <div key={`${index}-${scene.type}`} ref={(el) => { cardRefs.current[index] = el; }}>
                            <DropLine gap={index} />
                            <div
                                className={`panel p-4 mb-3 flex gap-4 select-none transition-opacity duration-150 ${dragging ? 'opacity-25 border-dashed cursor-grabbing' : 'cursor-grab hover:border-[rgba(255,255,255,0.18)]'}`}
                                onPointerDown={(e) => beginDrag(e, index)}
                                onPointerMove={moveDrag}
                                onPointerUp={(e) => endDrag(e, index)}
                                onPointerCancel={() => { dragState.current = null; setDragIndex(null); setDropIndex(null); setGhost(null); }}>
                                <div className='w-40 aspect-video rounded-md overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex-shrink-0 grid place-items-center relative'>
                                    {snapshots[index] ? (
                                        <img src={snapshots[index]} alt={`scene ${index + 1}`} className='w-full h-full object-cover' draggable={false} />
                                    ) : (
                                        <>
                                            <span className='mono text-[10px] uppercase tracking-widest text-[var(--cr-motion-faint)]'>{scene.type}</span>
                                            {meta && <span className='absolute bottom-1 right-1.5 mono text-[10px] text-[var(--cr-motion-faint)]'>no still yet</span>}
                                        </>
                                    )}
                                    <span className='absolute top-1 left-1.5 mono text-[10px] text-[rgba(255,255,255,0.75)] bg-[rgba(11,13,18,0.7)] rounded px-1'>
                                        {pad2(index + 1)}
                                    </span>
                                </div>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-center gap-2'>
                                        <span className='text-sm font-medium'>{meta2?.label ?? scene.type}</span>
                                        {meta && <span className='mono text-[11px] text-[var(--cr-motion-faint)]'>{meta.offset.toFixed(1)}s → {(meta.offset + meta.duration).toFixed(1)}s</span>}
                                        <span className='mono text-[11px] text-[var(--cr-motion-faint)] ml-auto'>~{Math.max(1, Math.round(wordsIn(scene.spoken) / 2.7))}s</span>
                                    </div>
                                    <p className='text-sm text-[var(--cr-motion-dim)] line-clamp-2 mt-1'>
                                        {scene.spoken || <span className='italic'>no narration</span>}
                                    </p>
                                    <div className='flex gap-1 mt-2 text-[var(--cr-motion-faint)]'>
                                        <button
                                            className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)] disabled:opacity-30'
                                            title='Move up'
                                            disabled={index === 0}
                                            onClick={() => {
                                                const next = [...scenes];
                                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                                setScenes(next);
                                            }}>↑</button>
                                        <button
                                            className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)] disabled:opacity-30'
                                            title='Move down'
                                            disabled={index === scenes.length - 1}
                                            onClick={() => {
                                                const next = [...scenes];
                                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                                setScenes(next);
                                            }}>↓</button>
                                        <button className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)]' title='Duplicate' onClick={() => duplicate(index)}>⧉</button>
                                        <button className='w-7 h-7 grid place-items-center hover:text-[#e5484d]' title='Remove' onClick={() => remove(index)}>✕</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <DropLine gap={scenes.length} />
            </div>

            <div className='flex items-center mt-4'>
                <Button label='Add scene' icon='pi pi-plus' text onClick={() => addScene(scenes.length - 1)} />
            </div>

            {ghost && scenes[ghost.index] && createPortal(
                <div
                    className='panel panel-accent p-4 flex gap-4 pointer-events-none'
                    style={{
                        position: 'fixed',
                        left: ghost.x - ghost.grabX * 0.6,
                        top: ghost.y - ghost.grabY * 0.6,
                        width: ghost.width,
                        transform: 'scale(0.6) rotate(-2.5deg)',
                        transformOrigin: 'top left',
                        zIndex: 80,
                        boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
                        background: 'var(--cr-motion-bg, #10131b)',
                    }}>
                    <div className='w-40 aspect-video rounded-md overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex-shrink-0 grid place-items-center relative'>
                        {snapshots[ghost.index]
                            ? <img src={snapshots[ghost.index]} alt='' className='w-full h-full object-cover' draggable={false} />
                            : <span className='mono text-[10px] uppercase tracking-widest text-[var(--cr-motion-faint)]'>{scenes[ghost.index].type}</span>}
                    </div>
                    <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                            <span className='text-sm font-medium'>{TYPES.find((t) => t.value === scenes[ghost.index].type)?.label}</span>
                            <span className='mono text-[11px] text-[var(--cr-motion-faint)] ml-auto'>~{Math.max(1, Math.round(wordsIn(scenes[ghost.index].spoken) / 2.7))}s</span>
                        </div>
                        <p className='text-sm text-[var(--cr-motion-dim)] line-clamp-2 mt-1'>{scenes[ghost.index].spoken || <span className='italic'>no narration</span>}</p>
                    </div>
                </div>,
                document.body)}

            {inspecting !== null && scenes[inspecting] && (
                <SceneInspector
                    show={show}
                    index={inspecting}
                    scene={scenes[inspecting]}
                    meta={sceneMeta[inspecting + 1]}
                    jobs={showJobs}
                    onChange={(patch) => update(inspecting, patch)}
                    onParam={(key, value) => setParam(inspecting, key, value)}
                    onProduce={() => void save(true)}
                    onClose={() => setInspecting(null)} />
            )}
        </>
    );
}

/**
 * The timing editor: the scene's own recording as a waveform, its words as draggable dots on a
 * horizontal time axis, and a karaoke playhead - press play and watch which dots light up; drag
 * any word that lands off its beat. Saving writes the words back into the lyrics data (and the
 * packaged copy the preview reads), so the motion follows the edit without a re-run.
 */
function TimingEditor({ showId, sceneNumber, offset, duration, takeFile, registerPreviewRef }: {
    showId: string;
    sceneNumber: number;
    offset: number;
    duration: number;
    takeFile?: string;
    registerPreviewRef?: (ref: React.RefObject<HTMLIFrameElement | null>) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const previewRef = useRef<HTMLIFrameElement | null>(null);
    const dragRef = useRef<number | null>(null);
    const scrubRef = useRef(false);
    const downRef = useRef<{ x: number; y: number; time: number; hit: number } | null>(null);
    const groupAnchorRef = useRef<number | null>(null);
    const selectRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const lastSentRef = useRef(0);
    const [words, setWords] = useState<{ word: string; start: number; end: number; orig: number }[]>([]);
    const [baseline, setBaseline] = useState<{ word: string; start: number; end: number; orig: number }[]>([]);
    const [peaks, setPeaks] = useState<number[]>([]);
    const [hover, setHover] = useState<number | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [selectRect, setSelectRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const [playing, setPlaying] = useState(false);
    const [playhead, setPlayhead] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [command, setValues] = SaveSceneTiming.use();

    // the page pauses this preview when the timing tab is hidden
    useEffect(() => { registerPreviewRef?.(previewRef); }, [registerPreviewRef]);

    // two-way sync: when the preview's own HUD scrubs, our playhead follows. Reports never
    // touch our playing state - our timeline is the clock while it plays (the preview is
    // parked after a seek and would otherwise report playing:false and freeze playback).
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.source !== previewRef.current?.contentWindow) return;
            if (!e.data || typeof e.data !== 'object' || e.data.motion !== 'position') return;
            if (playing || scrubRef.current) return;
            const local = Math.min(duration, Math.max(0, (Number(e.data.t) || 0) - offset));
            setPlayhead(local);
            if (audioRef.current) {
                const want = takeFile ? local : offset + local;
                if (Math.abs(audioRef.current.currentTime - want) > 0.3) audioRef.current.currentTime = want;
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [duration, offset, takeFile, playing]);

    // leaving the dialog entirely must not leave the voice talking
    useEffect(() => () => { audioRef.current?.pause(); }, []);

    // the words the engine actually uses - from the packaged lyrics data, scene-local
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/packages/${showId}/package/data/lyrics.json`);
                if (!res.ok) return;
                const doc = await res.json();
                const flat = (doc.lines ?? [])
                    .filter((l: any) => l.scene_id === `scene-${sceneNumber}`)
                    .flatMap((l: any) => l.words ?? [])
                    .map((w: any) => ({
                        word: String(w.w ?? w.word ?? ''),
                        start: Math.min(duration, Math.max(0, (Number(w.start) || 0) - offset)),
                        end: Math.min(duration, Math.max(0.05, (Number(w.end) || 0) - offset)),
                        orig: Math.min(duration, Math.max(0.05, (Number(w.end) || 0) - offset)),
                    }))
                    .sort((a: any, b: any) => a.start - b.start);
                if (cancelled || flat.length === 0) return;
                setWords(flat);
                setBaseline(flat.map((w: any) => ({ ...w })));
            } catch { /* the show hasn't been packaged yet */ }
        })();
        return () => { cancelled = true; };
    }, [showId, sceneNumber, offset, duration]);

    // the recording as peaks - the take when there is one, else the scene's slice of the mix
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const url = takeFile ? `/packages/${showId}/${takeFile}` : `/packages/${showId}/voiceover.wav`;
                const res = await fetch(url);
                if (!res.ok) return;
                const buf = await res.arrayBuffer();
                const Ctx = window.AudioContext;
                const ctx = new Ctx();
                const audio = await ctx.decodeAudioData(buf);
                const skip = takeFile ? 0 : offset;
                const from = Math.floor(skip * audio.sampleRate);
                const to = Math.min(audio.length, Math.floor((skip + duration) * audio.sampleRate));
                const channel = audio.getChannelData(0);
                const buckets = 500;
                const size = Math.max(1, Math.floor((to - from) / buckets));
                const next: number[] = [];
                for (let b = 0; b < buckets; b++) {
                    let peak = 0;
                    for (let i = from + b * size; i < Math.min(from + (b + 1) * size, to); i += 16) peak = Math.max(peak, Math.abs(channel[i] || 0));
                    next.push(peak);
                }
                void ctx.close();
                if (!cancelled) setPeaks(next);
            } catch { /* no waveform - the dots still work */ }
        })();
        return () => { cancelled = true; };
    }, [showId, takeFile, offset, duration]);

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        const W = canvas.width = (parent?.clientWidth ?? 800) * 2;
        const H = canvas.height = 170 * 2;
        const c = canvas.getContext('2d');
        if (!c) return;
        c.scale(2, 2);
        const w = W / 2, h = H / 2;
        const pad = 14;
        const x = (t: number) => pad + (Math.min(t, duration) / Math.max(duration, 0.001)) * (w - pad * 2);
        const dotY = (i: number) => 58 + (i % 2) * 9;
        c.clearRect(0, 0, w, h);

        // ruler
        c.font = '9px "JetBrains Mono", monospace';
        c.fillStyle = 'rgba(255,255,255,0.28)';
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        for (let s = 0; s <= duration; s += 0.5) {
            const px = x(s);
            c.beginPath();
            c.moveTo(px, 26); c.lineTo(px, 34);
            c.stroke();
            if (Math.abs(s % 1) < 0.01) c.fillText(`${Math.round(s)}s`, px - 4, 20);
        }

        // waveform
        const waveTop = 88, waveBottom = 148, mid = (waveTop + waveBottom) / 2;
        if (peaks.length > 0) {
            c.fillStyle = 'rgba(140,124,246,0.34)';
            const bw = (w - pad * 2) / peaks.length;
            peaks.forEach((peak, i) => {
                const amp = Math.max(1, peak * (waveBottom - waveTop) / 2);
                c.fillRect(pad + i * bw, mid - amp, Math.max(1, bw - 0.5), amp * 2);
            });
        } else {
            c.fillStyle = 'rgba(255,255,255,0.06)';
            c.fillRect(pad, mid, w - pad * 2, 1);
        }

        // words: a dot per word, staggered vertically so neighbours stay readable
        words.forEach((word, i) => {
            const px = x(word.start);
            const py = dotY(i);
            const isActive = playhead >= word.start && playhead < word.end;
            const isPast = playhead >= word.end;
            const isHot = hover === i || dragRef.current === i;
            const isSelected = selected.includes(i);
            if (isSelected) {
                c.strokeStyle = 'rgba(140,124,246,0.85)';
                c.beginPath();
                c.arc(px, py, 6.5, 0, Math.PI * 2);
                c.stroke();
            }
            c.beginPath();
            c.arc(px, py, isHot ? 5.5 : 4, 0, Math.PI * 2);
            c.fillStyle = isHot || isActive ? '#8c7cf6' : isPast ? 'rgba(240,238,230,0.75)' : 'rgba(240,238,230,0.35)';
            c.fill();
            // stem down to the waveform - where the word sits in the recording
            c.strokeStyle = isHot || isActive || isSelected ? 'rgba(140,124,246,0.5)' : 'rgba(255,255,255,0.12)';
            c.beginPath();
            c.moveTo(px, py + 6); c.lineTo(px, waveTop - 2);
            c.stroke();
            if (isHot) {
                const label = `${word.word} · ${word.start.toFixed(2)}s`;
                const tw = c.measureText(label).width + 12;
                const lx = Math.min(Math.max(px - tw / 2, 2), w - tw - 2);
                c.fillStyle = 'rgba(11,13,18,0.92)';
                c.strokeStyle = 'rgba(140,124,246,0.6)';
                c.beginPath();
                c.roundRect(lx, py + 12, tw, 18, 5);
                c.fill(); c.stroke();
                c.fillStyle = '#f0eee6';
                c.fillText(label, lx + 6, py + 25);
            }
        });

        // rubber-band selection
        if (selectRect) {
            const r = selectRect;
            c.fillStyle = 'rgba(140,124,246,0.14)';
            c.strokeStyle = 'rgba(140,124,246,0.7)';
            c.setLineDash([4, 3]);
            c.beginPath();
            c.rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
            c.fill(); c.stroke();
            c.setLineDash([]);
        }

        // playhead - always visible, grab it to scrub
        {
            const px = x(playhead);
            c.strokeStyle = '#8c7cf6';
            c.lineWidth = scrubRef.current ? 2.5 : 1.5;
            c.beginPath();
            c.moveTo(px, 32); c.lineTo(px, h - 8);
            c.stroke();
            c.lineWidth = 1;
            c.fillStyle = '#8c7cf6';
            c.beginPath();
            c.moveTo(px - 4, 32); c.lineTo(px + 4, 32); c.lineTo(px, 38);
            c.fill();
        }
    };

    useEffect(draw);

    // playback: the scene's own take, scene-local - the karaoke shows the drift live,
    // and the visuals below follow the playhead so eye and ear agree
    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        const tick = () => {
            const t = audioRef.current?.currentTime ?? 0;
            setPlayhead(t);
            if (Math.abs(t - lastSentRef.current) > 0.08) {
                lastSentRef.current = t;
                previewRef.current?.contentWindow?.postMessage({ motion: 'seek', t: offset + t }, '*');
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, offset]);

    const scrubTo = (t: number) => {
        const clamped = Math.min(duration, Math.max(0, t));
        setPlayhead(clamped);
        if (audioRef.current) audioRef.current.currentTime = takeFile ? clamped : offset + clamped;
        previewRef.current?.contentWindow?.postMessage({ motion: 'seek', t: offset + clamped }, '*');
        draw();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === ' ') {
            e.preventDefault();
            play();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            scrubTo(Math.min(duration, playhead + duration * 0.1));
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            scrubTo(Math.max(0, playhead - duration * 0.1));
        }
    };

    const toTime = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pad = 14;
        return Math.min(duration, Math.max(0, ((e.clientX - rect.left - pad) / (rect.width - pad * 2)) * duration));
    };
    const toClientX = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientX - rect.left;
    };
    const hitWord = (t: number) => {
        let best = -1, bestDist = 12 / (canvasRef.current?.parentElement?.clientWidth ?? 800) * duration;
        words.forEach((word, i) => {
            const d = Math.abs(word.start - t);
            if (d < bestDist) { best = i; bestDist = d; }
        });
        return best;
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const t = toTime(e);
        const hit = hitWord(t);
        downRef.current = { x: px, y: py, time: t, hit };
        // the playhead line wins if it is grabbed
        const phx = 14 + (playhead / Math.max(duration, 0.001)) * (rect.width - 28);
        if (Math.abs(px - phx) < 8 && py > 26) {
            scrubRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubTo(t);
            return;
        }
        if (hit >= 0) {
            e.currentTarget.setPointerCapture(e.pointerId);
            if (selected.includes(hit) && selected.length > 1) {
                // the selection moves as one
                groupAnchorRef.current = t;
                dragRef.current = hit;
            } else {
                if (selected.length) setSelected([]);
                dragRef.current = hit;
                setHover(hit);
            }
            draw();
            return;
        }
        // empty space: rubber-band select
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = { x0: px, y0: py, x1: px, y1: py };
        selectRectRef.current = r;
        setSelectRect(r);
        setSelected([]);
        draw();
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const t = toTime(e);
        // scrubbing the playhead: audio, playhead and the visuals below all follow
        if (scrubRef.current) { scrubTo(t); return; }

        // rubber band: grow it, select every dot inside
        if (selectRectRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const r = { ...selectRectRef.current, x1: e.clientX - rect.left, y1: e.clientY - rect.top };
            selectRectRef.current = r;
            setSelectRect(r);
            const pad = 14;
            const pxOf = (tt: number) => pad + (Math.min(tt, duration) / Math.max(duration, 0.001)) * (rect.width - pad * 2);
            const inside = words.map((word, i) => {
                const px = pxOf(word.start), py = 58 + (i % 2) * 9;
                return px >= Math.min(r.x0, r.x1) - 4 && px <= Math.max(r.x0, r.x1) + 4
                    && py >= Math.min(r.y0, r.y1) - 6 && py <= Math.max(r.y0, r.y1) + 6 ? i : -1;
            }).filter((i) => i >= 0);
            setSelected(inside);
            draw();
            return;
        }

        // group drag: the whole selection shifts by the pointer's delta
        if (dragRef.current !== null && groupAnchorRef.current !== null && selected.length > 1) {
            const delta = t - groupAnchorRef.current;
            groupAnchorRef.current = t;
            setWords((prev) => {
                const next = [...prev];
                let d = delta;
                const minStart = Math.min(...selected.map((idx) => next[idx].start));
                const maxEnd = Math.max(...selected.map((idx) => next[idx].end));
                d = Math.max(d, -minStart);
                d = Math.min(d, duration - maxEnd);
                for (const idx of selected) {
                    next[idx] = { ...next[idx], start: next[idx].start + d, end: next[idx].end + d };
                }
                setDirty(true);
                return next;
            });
            draw();
            return;
        }

        // single word drag
        if (dragRef.current !== null) {
            const i = dragRef.current;
            setWords((prev) => {
                const next = [...prev];
                const word = { ...next[i] };
                const snapped = Math.round(t * 50) / 50;
                const lo = i > 0 ? next[i - 1].start + 0.04 : 0;
                const hi = i < next.length - 1 ? next[i + 1].start - 0.04 : duration - 0.05;
                word.start = Math.min(Math.max(snapped, lo), Math.max(lo, hi));
                word.end = Math.min(duration, word.start + (word.orig || 0.2));
                next[i] = word;
                setDirty(true);
                return next;
            });
            draw();
            return;
        }

        const hit = hitWord(t);
        if (hit !== hover) { setHover(hit); draw(); }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const down = downRef.current;
        downRef.current = null;
        scrubRef.current = false;
        groupAnchorRef.current = null;
        dragRef.current = null;
        if (selectRectRef.current) {
            selectRectRef.current = null;
            setSelectRect(null);
        }
        // a click without a drag jumps the playhead - to the word when a word was hit
        if (down) {
            const rect = e.currentTarget.getBoundingClientRect();
            const dist = Math.hypot(e.clientX - rect.left - down.x, e.clientY - rect.top - down.y);
            if (dist < 4) {
                const jump = down.hit >= 0 && words[down.hit] ? words[down.hit].start : down.time;
                scrubTo(jump);
            }
        }
        draw();
    };

    const play = () => {
        const url = takeFile ? `/packages/${showId}/${takeFile}` : `/packages/${showId}/voiceover.wav`;
        if (!audioRef.current) {
            audioRef.current = new Audio(url);
            audioRef.current.onended = () => setPlaying(false);
        }
        const audio = audioRef.current;
        if (playing) {
            audio.pause();
            setPlaying(false);
            previewRef.current?.contentWindow?.postMessage('motion:pause', '*');
            return;
        }
        // play from where the scrubber is - only a finished clip starts over
        const startAt = playhead >= duration - 0.05 ? 0 : playhead;
        const absolute = new URL(url, location.href).href;
        if (audio.src !== absolute) audio.src = absolute;
        audio.currentTime = takeFile ? startAt : offset + startAt;
        setPlayhead(startAt);
        previewRef.current?.contentWindow?.postMessage({ motion: 'seek', t: offset + startAt }, '*');
        void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };

    const save = async () => {
        setError('');
        try {
            setValues({
                showId,
                sceneNumber,
                words: words.map((w) => ({ word: w.word, start: +(w.start + offset).toFixed(3), end: +(w.end + offset).toFixed(3) })),
            } as never);
            const result = await command.execute();
            if (result.isSuccess) {
                setBaseline(words.map((w) => ({ ...w })));
                setDirty(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
            } else {
                const problems = [...result.validationResults.map((v) => v.message), ...result.exceptionMessages].filter(Boolean);
                setError(problems.join('; ') || 'The timing could not be saved.');
            }
        } catch (err) {
            setError(String((err as Error)?.message ?? err));
        }
    };

    const reset = () => {
        setWords(baseline.map((w) => ({ ...w })));
        setSelected([]);
        setDirty(false);
    };

    return (
        <div className='flex flex-col gap-3'>
            <div className='flex items-center gap-2'>
                <button
                    className='w-9 h-9 rounded-full border border-[rgba(255,255,255,0.16)] grid place-items-center hover:border-[var(--cr-motion-violet)] text-sm'
                    title={playing ? 'Stop' : 'Play the recording — watch which words light up'}
                    onClick={play}>{playing ? '❙❙' : '▶'}</button>
                <span className='text-xs text-[var(--cr-motion-faint)] flex-1'>
                    Drag words onto the beats they belong to; drag on empty space to select several and
                    move them together; grab the violet playhead to scrub — the visuals below follow.
                </span>
                {dirty && (
                    <>
                        <Button label='Reset' severity='secondary' outlined onClick={reset} />
                        <Button label='Save timing' icon='pi pi-check' onClick={save} />
                    </>
                )}
                {saved && <span className='mono text-[11px] text-[var(--cr-motion-violet)]'>saved — the preview already uses it</span>}
            </div>
            <canvas
                ref={canvasRef}
                className='w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] touch-none select-none focus:outline-none focus:border-[rgba(140,124,246,0.5)]'
                style={{ height: 170 }}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => { if (dragRef.current === null && !scrubRef.current && !selectRectRef.current) setHover(null); }} />
            <iframe
                ref={previewRef}
                key={`${showId}-${sceneNumber}`}
                title={`scene ${sceneNumber} timing preview`}
                className='w-full aspect-video rounded-lg border border-[rgba(255,255,255,0.1)] bg-black'
                src={`/preview/index.html?pkg=/packages/${showId}/package&scene=scene-${sceneNumber}`}
                allow='autoplay' />
            {error && <p className='text-sm text-[#e5484d]'>{error}</p>}
            <div className='mono text-[11px] text-[var(--cr-motion-faint)] flex gap-4'>
                <span>{words.length} words</span>
                <span>scene window {offset.toFixed(2)}s → {(offset + duration).toFixed(2)}s</span>
                <span>{takeFile ? `take ${takeFile.split('/').pop()}` : 'mixed track'}</span>
            </div>
        </div>
    );
}

/** Tabs for the scene inspector. */
const TABS = [
    { id: 'preview', label: 'Preview' },
    { id: 'content', label: 'Content' },
    { id: 'narration', label: 'Narration' },
    { id: 'motion', label: 'Motion' },
    { id: 'timing', label: 'Timing' },
] as const;

/**
 * The scene inspector: the engine playing the scene with its voice, and every property the
 * scene has - content parameters, narration, motion preset and description, recorded timing.
 */
function SceneInspector({
    show, index, scene, meta, jobs, onChange, onParam, onProduce, onClose,
}: {
    show: Show;
    index: number;
    scene: Scene;
    meta?: SceneMeta;
    jobs: JobActivity[];
    onChange: (patch: Partial<Scene>) => void;
    onParam: (key: string, value: unknown) => void;
    onProduce: () => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<(typeof TABS)[number]['id']>('preview');
    const motionRaw = scene.params.motion as { preset?: string; duration?: number; describe?: string } | undefined;
    const presets = MOTION_PRESETS[scene.type] ?? [];
    const showId = show.id.toString();
    const sceneNumber = index + 1;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const timingPreviewHolder = useRef<React.RefObject<HTMLIFrameElement | null> | null>(null);

    // switching tabs never resizes the dialog: every panel is stacked in the same grid
    // cell, so the dialog is sized by the tallest tab; hidden panels keep that size
    const panelStyle = (id: (typeof TABS)[number]['id']): React.CSSProperties => ({
        gridArea: '1 / 1',
        visibility: tab === id ? 'visible' : 'hidden',
        pointerEvents: tab === id ? 'auto' : 'none',
    });

    const switchTab = (id: (typeof TABS)[number]['id']) => {
        // leaving a tab with a live preview pauses it - a hidden iframe would keep playing
        if (tab === 'preview' && id !== 'preview') iframeRef.current?.contentWindow?.postMessage('motion:pause', '*');
        if (tab === 'timing' && id !== 'timing') timingPreviewHolder.current?.current?.contentWindow?.postMessage('motion:pause', '*');
        setTab(id);
    };

    return (
        <div className='fixed inset-0 z-40 grid place-items-center bg-[rgba(6,7,10,0.72)] p-6' onClick={onClose}>
            <div
                className='panel panel-accent w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6'
                onClick={(e) => e.stopPropagation()}>
                <div className='flex items-center gap-3 mb-4'>
                    <span className='mono text-xs text-[var(--cr-motion-faint)]'>{pad2(sceneNumber)}</span>
                    <h2 className='display text-xl font-bold'>{TYPES.find((t) => t.value === scene.type)?.label ?? scene.type}</h2>
                    <span className='mono text-[11px] text-[var(--cr-motion-faint)]'>{meta ? `${meta.offset.toFixed(1)}s · ${meta.duration.toFixed(1)}s` : 'not spoken yet'}</span>
                    <button className='ml-auto w-8 h-8 grid place-items-center hover:text-[var(--cr-motion-ink)] text-[var(--cr-motion-faint)]' onClick={onClose}>✕</button>
                </div>

                <div className='flex gap-1 mb-5 border-b border-[rgba(255,255,255,0.08)] pb-2'>
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-[rgba(140,124,246,0.14)] text-[var(--cr-motion-violet)]' : 'text-[var(--cr-motion-dim)] hover:text-[var(--cr-motion-ink)]'}`}
                            onClick={() => switchTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* every panel stacked in one grid cell: the dialog is sized by the tallest
                    tab and switching never resizes it; hidden panels keep that size */}
                <div className='grid items-start'>
                <div className='flex flex-col gap-3' style={panelStyle('preview')}>
                        <iframe
                            ref={iframeRef}
                            key={`${showId}-${sceneNumber}`}
                            title={`scene ${sceneNumber} preview`}
                            className='w-full aspect-video rounded-lg border border-[rgba(255,255,255,0.1)] bg-black'
                            src={`/preview/index.html?pkg=/packages/${showId}/package&scene=scene-${sceneNumber}`}
                            allow='autoplay' />
                        <p className='text-xs text-[var(--cr-motion-faint)]'>
                            The engine in the browser, playing this scene with its voiceover — the same
                            scene the renderer captures. Space plays/pauses; the HUD scrubs.
                        </p>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-3' style={panelStyle('content')}>
                        <ParamsEditor scene={{ type: scene.type, params: scene.params }} onParam={onParam} />
                </div>

                <div className='flex flex-col gap-3' style={panelStyle('narration')}>
                        <label className='block'>
                            <span className='eyebrow block mb-1.5'>What the voice says</span>
                            <textarea
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent resize-y min-h-[6rem]'
                                rows={3}
                                value={scene.spoken}
                                onChange={(e) => onChange({ spoken: e.target.value })} />
                        </label>
                        {(!meta || meta.spoken !== scene.spoken) && (
                            <div className='panel panel-accent p-4 flex items-center gap-4 flex-wrap'>
                                <span className='text-sm flex-1 min-w-[16rem]'>
                                    {meta
                                        ? 'Narration changed — the recording, scene timing and preview are stale.'
                                        : 'This scene has no voice recording yet.'}
                                </span>
                                <Button label='Save & re-render' icon='pi pi-sparkles' onClick={onProduce} />
                            </div>
                        )}
                        {jobs.filter((job) => job.isRunning || job.error).length > 0 && (
                            <div className='flex flex-col gap-2'>
                                <div className='eyebrow'>generation</div>
                                {jobs.filter((job) => job.isRunning || job.error).slice(0, 3).map((job) => (
                                    <JobRow key={job.jobId.toString()} job={job} />
                                ))}
                            </div>
                        )}
                        {meta && (
                            <div className='panel p-4 flex items-center gap-4'>
                                <button
                                    className='w-10 h-10 rounded-full border border-[rgba(255,255,255,0.16)] grid place-items-center hover:border-[var(--cr-motion-violet)]'
                                    title='Audition this scene’s recording'
                                    onClick={() => {
                                        const audio = new Audio(`/packages/${showId}/${meta.file}`);
                                        void audio.play();
                                    }}>▶</button>
                                <div className='mono text-xs text-[var(--cr-motion-faint)]'>
                                    take {pad2(sceneNumber)}.wav · {meta.duration.toFixed(2)}s · {wordsIn(meta.spoken)} words
                                </div>
                            </div>
                        )}
                </div>

                <div className='flex flex-col gap-4' style={panelStyle('motion')}>
                        {presets.length > 0 ? (
                            <>
                                <label className='block'>
                                    <span className='eyebrow block mb-1.5'>Preset</span>
                                    <div className='flex gap-2 flex-wrap'>
                                        <button
                                            className={`px-3 py-1.5 rounded-md text-sm mono border ${!motionRaw?.preset ? 'border-[var(--cr-motion-violet)] text-[var(--cr-motion-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-motion-dim)]'}`}
                                            onClick={() => onParam('motion', { ...(motionRaw ?? {}), preset: undefined })}>
                                            default
                                        </button>
                                        {presets.map((p) => (
                                            <button
                                                key={p.value}
                                                className={`px-3 py-1.5 rounded-md text-sm mono border ${motionRaw?.preset === p.value ? 'border-[var(--cr-motion-violet)] text-[var(--cr-motion-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-motion-dim)]'}`}
                                                onClick={() => onParam('motion', { ...(motionRaw ?? {}), preset: p.value })}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </label>
                                <label className='block max-w-[12rem]'>
                                    <span className='eyebrow block mb-1.5'>Build time (seconds)</span>
                                    <input
                                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent mono'
                                        type='number'
                                        min={0.2}
                                        step={0.1}
                                        value={motionRaw?.duration ?? ''}
                                        placeholder='scene default'
                                        onChange={(e) => onParam('motion', {
                                            ...(motionRaw ?? {}),
                                            duration: e.target.value === '' ? undefined : Number(e.target.value),
                                        })} />
                                </label>
                                <label className='block'>
                                    <span className='eyebrow block mb-1.5'>Describe the motion (for the planner)</span>
                                    <textarea
                                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent resize-y'
                                        rows={2}
                                        placeholder='e.g. bars rise as each word lands; the max bar pulses on the punchline'
                                        value={asString(motionRaw?.describe)}
                                        onChange={(e) => onParam('motion', { ...(motionRaw ?? {}), describe: e.target.value })} />
                                </label>
                            </>
                        ) : (
                            <p className='text-sm text-[var(--cr-motion-dim)]'>
                                This scene is word-timed — the narration itself drives its motion, word by word.
                            </p>
                        )}
                </div>

                <div className='flex flex-col gap-2 text-sm' style={panelStyle('timing')}>
                    {meta ? (
                        <TimingEditor
                            showId={showId}
                            sceneNumber={sceneNumber}
                            offset={meta.offset}
                            duration={meta.duration}
                            takeFile={meta.file}
                            registerPreviewRef={(ref) => { timingPreviewHolder.current = ref; }} />
                    ) : (
                        <div className='flex flex-col gap-2'>
                            <p className='text-[var(--cr-motion-dim)]'>
                                The show hasn't spoken yet — save & render to get this scene's recording and timing.
                            </p>
                            <p className='text-xs text-[var(--cr-motion-faint)]'>
                                Once it has, this tab becomes a timeline: the recording as a waveform, each
                                word a dot you can drag onto the beat it belongs to.
                            </p>
                        </div>
                    )}
                </div>
                </div>
            </div>
        </div>
    );
}

/** The type-specific visual parameters, one structured control each - never raw JSON. */
function ParamsEditor({ scene, onParam }: { scene: { type: string; params: Record<string, unknown> }; onParam: (key: string, value: unknown) => void }) {
    const p = scene.params;
    const set = onParam;

    switch (scene.type) {
        case 'title':
            return (
                <>
                    <Field label='Kicker' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} placeholder='a short label above' />
                    <Field label='Headline' value={asString(p.headline)} onChange={(v) => set('headline', v)} placeholder='2–8 words' />
                    <Field label='Emphasis (word to colour)' value={asString(p.emphasis)} onChange={(v) => set('emphasis', v)} />
                    <Field label='Sub line (optional)' value={asString(p.sub)} onChange={(v) => set('sub', v)} />
                </>
            );
        case 'statement':
            return (
                <>
                    <Field label='Headline — the claim' value={asString(p.headline)} onChange={(v) => set('headline', v)} placeholder='max 12 words' />
                    <Field label='Accent (phrase to colour)' value={asString(p.accent)} onChange={(v) => set('accent', v)} />
                    <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
                </>
            );
        case 'kinetic':
            return (
                <ListField label='Emphasised words' value={p.emphasis} onChange={(v) => set('emphasis', v)} placeholder='words to colour' />
            );
        case 'steps':
            return (
                <>
                    <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
                    <div className='md:col-span-2 flex flex-col gap-2'>
                        <span className='eyebrow'>Steps</span>
                        {asList(p.steps).map((step, i) => {
                            const item = step as Record<string, unknown>;
                            return (
                                <div key={i} className='flex gap-2'>
                                    <input
                                        className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent w-40'
                                        placeholder='title'
                                        value={asString(item.title)}
                                        onChange={(e) => {
                                            const steps = [...asList(p.steps)];
                                            steps[i] = { ...item, title: e.target.value };
                                            set('steps', steps);
                                        }} />
                                    <input
                                        className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent flex-1'
                                        placeholder='one short line'
                                        value={asString(item.text)}
                                        onChange={(e) => {
                                            const steps = [...asList(p.steps)];
                                            steps[i] = { ...item, text: e.target.value };
                                            set('steps', steps);
                                        }} />
                                    <button className='text-[var(--cr-motion-faint)] hover:text-[#e5484d] px-1' onClick={() => set('steps', asList(p.steps).filter((_, j) => j !== i))}>✕</button>
                                </div>
                            );
                        })}
                        <button
                            className='mono text-[11px] text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)] text-left'
                            onClick={() => set('steps', [...asList(p.steps), { title: '', text: '' }])}>
                            + step
                        </button>
                    </div>
                </>
            );
        case 'compare':
            return (
                <>
                    <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
                    <Field label='Verdict (optional)' value={asString(p.verdict)} onChange={(v) => set('verdict', v)} />
                    {(['left', 'right'] as const).map((side) => {
                        const item = (p[side] ?? {}) as Record<string, unknown>;
                        return (
                            <div key={side} className='md:col-span-2 panel p-3 flex flex-col gap-2'>
                                <span className='eyebrow'>{side === 'left' ? 'Left side (before)' : 'Right side (after)'}</span>
                                <Field label='Title' value={asString(item.title)} onChange={(v) => set(side, { ...item, title: v })} />
                                <ListField
                                    label='Points'
                                    value={item.points}
                                    onChange={(points) => set(side, { ...item, points })}
                                    placeholder='three short strings' />
                            </div>
                        );
                    })}
                </>
            );
        case 'flow':
            return (
                <>
                    <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
                    <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
                    <div className='md:col-span-2 flex flex-col gap-2'>
                        <span className='eyebrow'>Nodes</span>
                        {asList(p.nodes).map((node, i) => {
                            const item = node as Record<string, unknown>;
                            return (
                                <div key={i} className='flex gap-2'>
                                    <input
                                        className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent w-44'
                                        placeholder='label (1–2 words)'
                                        value={asString(item.label)}
                                        onChange={(e) => {
                                            const nodes = [...asList(p.nodes)];
                                            nodes[i] = { ...item, label: e.target.value };
                                            set('nodes', nodes);
                                        }} />
                                    <input
                                        className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent flex-1'
                                        placeholder='sub (optional)'
                                        value={asString(item.sub)}
                                        onChange={(e) => {
                                            const nodes = [...asList(p.nodes)];
                                            nodes[i] = { ...item, sub: e.target.value };
                                            set('nodes', nodes);
                                        }} />
                                    <button className='text-[var(--cr-motion-faint)] hover:text-[#e5484d] px-1' onClick={() => set('nodes', asList(p.nodes).filter((_, j) => j !== i))}>✕</button>
                                </div>
                            );
                        })}
                        <button
                            className='mono text-[11px] text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)] text-left'
                            onClick={() => set('nodes', [...asList(p.nodes), { label: '' }])}>
                            + node
                        </button>
                    </div>
                </>
            );
        case 'metric':
            return (
                <>
                    <Field label='Value' value={asString(p.value)} onChange={(v) => set('value', Number(v) || 0)} />
                    <label className='block'>
                        <span className='eyebrow block mb-1.5'>Format</span>
                        <select
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                            value={asString(p.format) || 'number'}
                            onChange={(e) => set('format', e.target.value)}>
                            <option value='number'>number</option>
                            <option value='percent'>percent</option>
                            <option value='currency'>currency</option>
                            <option value='x'>x (multiplier)</option>
                        </select>
                    </label>
                    <Field label='Label' value={asString(p.label)} onChange={(v) => set('label', v)} placeholder='one short line' />
                    <Field label='Delta (optional)' value={asString(p.delta)} onChange={(v) => set('delta', v)} placeholder='+38%' />
                    <div className='md:col-span-2'>
                        <Field
                            label='Spark line (comma-separated numbers)'
                            mono
                            value={csv(p.spark)}
                            onChange={(v) => set('spark', fromCsvNumbers(v))}
                            placeholder='1, 2, 3, 5, 8' />
                    </div>
                </>
            );
        case 'chart':
            return (
                <>
                    <label className='block'>
                        <span className='eyebrow block mb-1.5'>Chart type</span>
                        <select
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                            value={asString(p.type) || 'bar'}
                            onChange={(e) => set('type', e.target.value)}>
                            <option value='bar'>bar</option>
                            <option value='line'>line</option>
                        </select>
                    </label>
                    <Field label='Title (optional)' value={asString(p.title)} onChange={(v) => set('title', v)} />
                    <div className='md:col-span-2'>
                        <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
                    </div>
                    <ListField label='Labels' value={p.labels} onChange={(labels) => set('labels', labels)} placeholder='before, after' />
                    <Field
                        label='Values (comma-separated numbers)'
                        mono
                        value={csv(p.values)}
                        onChange={(v) => set('values', fromCsvNumbers(v))}
                        placeholder='10, 2' />
                </>
            );
        case 'quote':
            return (
                <>
                    <div className='md:col-span-2'>
                        <Field label='Quote (max 25 words)' value={asString(p.text)} onChange={(v) => set('text', v)} />
                    </div>
                    <Field label='Attribution' value={asString(p.attribution)} onChange={(v) => set('attribution', v)} />
                </>
            );
        case 'code':
            return (
                <>
                    <Field label='Title (optional)' value={asString(p.title)} onChange={(v) => set('title', v)} />
                    <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
                    <label className='block'>
                        <span className='eyebrow block mb-1.5'>Language</span>
                        <select
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                            value={asString(p.language) || 'typescript'}
                            onChange={(e) => set('language', e.target.value)}>
                            <option value='typescript'>typescript</option>
                            <option value='csharp'>csharp</option>
                            <option value='json'>json</option>
                            <option value='sql'>sql</option>
                        </select>
                    </label>
                    <div className='md:col-span-2'>
                        <label className='block'>
                            <span className='eyebrow block mb-1.5'>Code (max 14 lines)</span>
                            <textarea
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent resize-y mono'
                                rows={5}
                                value={asString(p.code)}
                                onChange={(e) => set('code', e.target.value)} />
                        </label>
                    </div>
                </>
            );
        case 'endcard':
            return (
                <>
                    <Field label='Headline (3–7 words)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
                    <Field label='Call to action (optional)' value={asString(p.cta)} onChange={(v) => set('cta', v)} />
                </>
            );
        default:
            return <div className='text-xs text-[var(--cr-motion-faint)] md:col-span-2'>Unknown scene type — parameters are kept as they are.</div>;
    }
}
