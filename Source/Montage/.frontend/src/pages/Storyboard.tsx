// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@cratis/components/Common';
import { Show } from '../../Api/Shows/Listing';
import { All as AllJobs, JobActivity } from '../../Api/Shows/Production';
import { SaveStoryboard } from '../../Api/Shows/Storyboard';
import { ShowPlan } from '../plan';
import { Field } from './storyboard/fields';
import { DEFAULT_PARAMS, Scene, SceneMeta, TYPES, pad2, wordsIn } from './storyboard/model';
import { SceneInspector } from './storyboard/SceneInspector';
import { VoicePicker } from './storyboard/VoicePicker';

/** The index a dragged card would land on, from the pointer's Y against the other cards' midpoints. */
function dropTargetFor(clientY: number, from: number, cards: (HTMLElement | null)[], count: number) {
    let target = count - 1;
    for (let i = 0; i < cards.length; i++) {
        const el = cards[i];
        if (i === from || !el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i > from ? i - 1 : i;
        target = i > from ? i : count - 1;
    }
    return target;
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
            <div className='min-h-screen grid place-items-center text-[var(--cr-montage-dim)]'>Loading…</div>
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
            const target = dropTargetFor(e.clientY, from, cardRefs.current, scenes.length);
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
                <div className='absolute left-0 right-0 h-[3px] rounded-full bg-[var(--cr-montage-violet)] shadow-[0_0_12px_var(--cr-montage-violet)]'>
                    <div className='absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[var(--cr-montage-violet)]' />
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
                <div className='text-xs text-[var(--cr-montage-faint)] self-end pb-2 mono'>
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
                                            <span className='mono text-[10px] uppercase tracking-widest text-[var(--cr-montage-faint)]'>{scene.type}</span>
                                            {meta && <span className='absolute bottom-1 right-1.5 mono text-[10px] text-[var(--cr-montage-faint)]'>no still yet</span>}
                                        </>
                                    )}
                                    <span className='absolute top-1 left-1.5 mono text-[10px] text-[rgba(255,255,255,0.75)] bg-[rgba(11,13,18,0.7)] rounded px-1'>
                                        {pad2(index + 1)}
                                    </span>
                                </div>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-center gap-2'>
                                        <span className='text-sm font-medium'>{meta2?.label ?? scene.type}</span>
                                        {meta && <span className='mono text-[11px] text-[var(--cr-montage-faint)]'>{meta.offset.toFixed(1)}s → {(meta.offset + meta.duration).toFixed(1)}s</span>}
                                        <span className='mono text-[11px] text-[var(--cr-montage-faint)] ml-auto'>~{Math.max(1, Math.round(wordsIn(scene.spoken) / 2.7))}s</span>
                                    </div>
                                    <p className='text-sm text-[var(--cr-montage-dim)] line-clamp-2 mt-1'>
                                        {scene.spoken || <span className='italic'>no narration</span>}
                                    </p>
                                    <div className='flex gap-1 mt-2 text-[var(--cr-montage-faint)]'>
                                        <button
                                            className='w-7 h-7 grid place-items-center hover:text-[var(--cr-montage-ink)] disabled:opacity-30'
                                            title='Move up'
                                            disabled={index === 0}
                                            onClick={() => {
                                                const next = [...scenes];
                                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                                setScenes(next);
                                            }}>↑</button>
                                        <button
                                            className='w-7 h-7 grid place-items-center hover:text-[var(--cr-montage-ink)] disabled:opacity-30'
                                            title='Move down'
                                            disabled={index === scenes.length - 1}
                                            onClick={() => {
                                                const next = [...scenes];
                                                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                                setScenes(next);
                                            }}>↓</button>
                                        <button className='w-7 h-7 grid place-items-center hover:text-[var(--cr-montage-ink)]' title='Duplicate' onClick={() => duplicate(index)}>⧉</button>
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
                        background: 'var(--cr-montage-bg, #10131b)',
                    }}>
                    <div className='w-40 aspect-video rounded-md overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex-shrink-0 grid place-items-center relative'>
                        {snapshots[ghost.index]
                            ? <img src={snapshots[ghost.index]} alt='' className='w-full h-full object-cover' draggable={false} />
                            : <span className='mono text-[10px] uppercase tracking-widest text-[var(--cr-montage-faint)]'>{scenes[ghost.index].type}</span>}
                    </div>
                    <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                            <span className='text-sm font-medium'>{TYPES.find((t) => t.value === scenes[ghost.index].type)?.label}</span>
                            <span className='mono text-[11px] text-[var(--cr-montage-faint)] ml-auto'>~{Math.max(1, Math.round(wordsIn(scenes[ghost.index].spoken) / 2.7))}s</span>
                        </div>
                        <p className='text-sm text-[var(--cr-montage-dim)] line-clamp-2 mt-1'>{scenes[ghost.index].spoken || <span className='italic'>no narration</span>}</p>
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
