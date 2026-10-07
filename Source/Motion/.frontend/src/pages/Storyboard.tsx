// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@cratis/components/Common';
import { Show, ObserveAll } from '../../Api/Shows/Listing';
import { SaveStoryboard } from '../../Api/Shows/Storyboard';
import { ShowPlan } from '../plan';

/** One scene in the storyboard being edited. */
interface Scene {
    type: string;
    spoken: string;
    params: Record<string, unknown>;
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

const VOICES = [
    'af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_sky', 'af_alloy', 'af_jessica', 'af_nova', 'af_river',
    'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck',
    'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily',
    'bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel',
];

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
 * The visual storyboard: one card per scene - what it looks like (type + parameters), what is
 * spoken over it, the voice it is spoken with. Saving writes the plan and re-runs production
 * from the voiceover onward - plan, voice, timing, package and render all follow.
 */
export function Storyboard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [shows] = ObserveAll.use();
    const show = shows.data.find((s) => s.id.toString() === id);
    const plan = useMemo(() => ShowPlan.parse(show?.planJson), [show?.planJson]);

    const [title, setTitle] = useState<string>('');
    const [voice, setVoice] = useState<string>('af_heart');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loadedFor, setLoadedFor] = useState<string>('');
    const [command, setValues] = SaveStoryboard.use();
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState<string>('');

    // seed the editor once the show's plan is in view
    useEffect(() => {
        if (!show || loadedFor === show.id.toString()) return;
        setLoadedFor(show.id.toString());
        setTitle(plan?.title || show.title);
        setVoice(show.voice || 'af_heart');
        setScenes((plan?.scenes ?? []).map((s) => ({ type: s.type, spoken: s.spoken ?? '', params: { ...(s.params ?? {}) } })));
    }, [show, plan, loadedFor]);

    if (!show) {
        return (
            <div className='min-h-screen grid place-items-center text-[var(--cr-motion-dim)]'>Loading…</div>
        );
    }

    const update = (index: number, patch: Partial<Scene>) =>
        setScenes(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    const setParam = (index: number, key: string, value: unknown) =>
        setScenes(scenes.map((s, i) => (i === index ? { ...s, params: { ...s.params, [key]: value } } : s)));

    const move = (index: number, delta: number) => {
        const next = [...scenes];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setScenes(next);
    };

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

    const totalWords = scenes.reduce((sum, s) => sum + wordsIn(s.spoken), 0);

    const save = async () => {
        setBusy(true);
        setSaveError('');
        try {
            // params travel as plain JSON - the backend binds them into JsonElement parameters
            setValues({
                showId: id as never,
                title,
                voice,
                scenes: scenes.map((s) => ({ type: s.type, spoken: s.spoken, params: s.params })) as never,
            });
            const result = await command.execute();
            if (result.isSuccess) {
                navigate(`/shows/${id}`);
            } else {
                const problems = [...result.validationResults.map((v) => v.message), ...result.exceptionMessages].filter(Boolean);
                setSaveError(problems.length > 0 ? problems.join('; ') : 'The storyboard could not be saved.');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className='min-h-screen max-w-4xl mx-auto px-8 py-10'>
            <div className='flex items-center gap-3 mb-2'>
                <Link to={`/shows/${id}`} className='mono text-xs text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)]'>← show</Link>
            </div>
            <header className='flex items-end justify-between gap-6 mb-8'>
                <div>
                    <div className='eyebrow mb-2'>storyboard</div>
                    <h1 className='display text-3xl font-bold'>Scene by scene</h1>
                    <p className='text-sm text-[var(--cr-motion-dim)] mt-2 max-w-prose'>
                        Every card is a scene: how it looks, what is spoken over it. Saving re-runs
                        production — voice, timing, package and render follow the new storyboard.
                    </p>
                </div>
                <Button label='Save & produce' icon='pi pi-sparkles' loading={busy} onClick={save} />
            </header>

            {saveError && (
                <div className='panel p-4 mb-6 border-l-4' style={{ borderLeftColor: '#e5484d' }}>
                    <p className='text-sm text-[#e5484d]'>{saveError}</p>
                </div>
            )}

            <section className='panel p-5 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4'>
                <Field label='Title' value={title} onChange={setTitle} />
                <label className='block'>
                    <span className='eyebrow block mb-1.5'>Voice</span>
                    <input
                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent mono'
                        list='voice-options'
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)} />
                    <datalist id='voice-options'>
                        {VOICES.map((v) => <option key={v} value={v} />)}
                    </datalist>
                </label>
                <div className='text-xs text-[var(--cr-motion-faint)] self-end pb-2'>
                    {scenes.length} scenes · ~{Math.round(totalWords / 2.7)}s spoken · {totalWords} words
                </div>
            </section>

            <div className='flex flex-col gap-4'>
                {scenes.map((scene, index) => (
                    <SceneCard
                        key={`${index}-${scene.type}`}
                        scene={scene}
                        index={index}
                        total={scenes.length}
                        onChange={(patch) => update(index, patch)}
                        onParam={(key, value) => setParam(index, key, value)}
                        onType={(type) => changeType(index, type)}
                        onMove={(delta) => move(index, delta)}
                        onDuplicate={() => duplicate(index)}
                        onRemove={() => remove(index)}
                        onAddAfter={() => addScene(index)} />
                ))}
            </div>

            <div className='flex items-center justify-between mt-6'>
                <Button label='Add scene' icon='pi pi-plus' text onClick={() => addScene(scenes.length - 1)} />
                <Button label='Save & produce' icon='pi pi-sparkles' loading={busy} onClick={save} />
            </div>
        </div>
    );
}

/** One scene card: type, narration, and the visual parameters that type renders. */
function SceneCard({
    scene, index, total, onChange, onParam, onType, onMove, onDuplicate, onRemove, onAddAfter,
}: {
    scene: Scene;
    index: number;
    total: number;
    onChange: (patch: Partial<Scene>) => void;
    onParam: (key: string, value: unknown) => void;
    onType: (type: string) => void;
    onMove: (delta: number) => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onAddAfter: () => void;
}) {
    const meta = TYPES.find((t) => t.value === scene.type);
    const seconds = Math.max(1, Math.round(wordsIn(scene.spoken) / 2.7));

    return (
        <div className='panel panel-accent p-5'>
            <div className='flex items-center gap-3 mb-4'>
                <span className='mono text-xs text-[var(--cr-motion-faint)]'>{String(index + 1).padStart(2, '0')}</span>
                <select
                    className='panel px-2.5 py-1.5 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent'
                    value={scene.type}
                    onChange={(e) => onType(e.target.value)}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className='text-xs text-[var(--cr-motion-faint)] hidden md:inline'>{meta?.hint}</span>
                <span className='mono text-xs text-[var(--cr-motion-faint)] ml-auto'>~{seconds}s</span>
                <div className='flex gap-1 text-[var(--cr-motion-faint)]'>
                    <button className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)] disabled:opacity-30' title='Move up' disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
                    <button className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)] disabled:opacity-30' title='Move down' disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
                    <button className='w-7 h-7 grid place-items-center hover:text-[var(--cr-motion-ink)]' title='Duplicate' onClick={onDuplicate}>⧉</button>
                    <button className='w-7 h-7 grid place-items-center hover:text-[#e5484d]' title='Remove' onClick={onRemove}>✕</button>
                </div>
            </div>

            {scene.type !== 'endcard' && (
                <label className='block mb-4'>
                    <span className='eyebrow block mb-1.5'>Narration — what the voice says</span>
                    <textarea
                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-motion-violet)] bg-transparent resize-y min-h-[3.5rem]'
                        rows={2}
                        value={scene.spoken}
                        onChange={(e) => onChange({ spoken: e.target.value })} />
                </label>
            )}

            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <ParamsEditor scene={scene} onParam={onParam} />
            </div>

            <div className='mt-3'>
                <button className='mono text-[11px] text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)]' onClick={onAddAfter}>
                    + scene after this
                </button>
            </div>
        </div>
    );
}

/** The type-specific visual parameters, one structured control each - never raw JSON. */
function ParamsEditor({ scene, onParam }: { scene: Scene; onParam: (key: string, value: unknown) => void }) {
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
