// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useMemo, useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { Button } from '@cratis/components/Common';
import { Show, ObserveAll } from '../../Api/Shows/Listing';
import { RegenerateShowStage } from '../../Api/Shows/Creation';
import { All as AllJobs, JobActivity } from '../../Api/Shows/Production';
import { ShowPlan } from '../plan';
import { StoryboardEditor } from './Storyboard';
import { JobRow } from './JobRow';

export const stageFlow = [
    { status: 'Created', label: 'created', stage: undefined },
    { status: 'Planning', label: 'plan', stage: 'plan' },
    { status: 'Planned', label: 'planned', stage: undefined },
    { status: 'Voicing', label: 'voice', stage: 'voice' },
    { status: 'Voiced', label: 'voiced', stage: undefined },
    { status: 'Timing', label: 'time', stage: 'time' },
    { status: 'Timed', label: 'timed', stage: undefined },
    { status: 'Packaging', label: 'package', stage: 'package' },
    { status: 'Packaged', label: 'packaged', stage: undefined },
    { status: 'Rendering', label: 'render', stage: 'render' },
    { status: 'Rendered', label: 'rendered', stage: undefined },
] as const;

const retryable = ['Failed', 'Planned', 'Voiced', 'Timed', 'Packaged', 'Rendered'];

export function StatusBadge({ status }: { status: string }) {
    const failed = status === 'Failed';
    const done = status === 'Rendered';
    const color = failed ? '#e5484d' : done ? 'var(--cr-motion-violet)' : 'var(--cr-motion-amber)';
    return (
        <span
            className='mono text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap'
            style={{ color, borderColor: color, background: 'rgba(255,255,255,0.03)' }}>
            {status.toLowerCase()}
        </span>
    );
}

export function ShowDetail() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [shows] = ObserveAll.use();
    const [jobs] = AllJobs.use();
    const show = shows.data.find((s) => s.id.toString() === id);
    const plan = useMemo(() => ShowPlan.parse(show?.planJson), [show?.planJson]);
    const showJobs = jobs.data
        .filter((job: JobActivity) => job.showId === id)
        .sort((a: JobActivity, b: JobActivity) => new Date(b.created).getTime() - new Date(a.created).getTime());

    // one page, two tabs: production on the left of the slash, scene editing behind the deep
    // link the shows list and 'define slides' use — both stay mounted so unsaved edits survive
    const tab = location.pathname.endsWith('/storyboard') ? 'storyboard' : 'overview';
    const videoRef = useRef<HTMLVideoElement>(null);
    const switchTab = (next: 'overview' | 'storyboard') => {
        if (next === tab) return;
        if (confirmExit(next)) return;
        if (tab === 'overview') videoRef.current?.pause(); // a hidden player would keep sounding
        navigate(next === 'storyboard' ? `/shows/${id}/storyboard` : `/shows/${id}`);
    };

    // the storyboard editor owns scene state and the save logic; the header owns its buttons
    const saveRef = useRef<((produce: boolean) => void) | null>(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState('');

    // unsaved scene edits: leaving the storyboard asks whether to discard or generate
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [pendingExit, setPendingExit] = useState<null | 'overview' | 'back' | 'storyboard'>(null);
    const confirmExit = (dest: 'overview' | 'back' | 'storyboard') => {
        if (!dirty || tab !== 'storyboard') return false;
        setPendingExit(dest);
        return true;
    };
    dirtyRef.current = dirty;
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!dirtyRef.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    if (!show) {
        return (
            <div className='min-h-screen grid place-items-center px-8'>
                <div className='w-full max-w-2xl flex flex-col gap-3'>
                    <div className='eyebrow mb-1'>production activity</div>
                    {showJobs.length === 0 && (
                        <div className='panel p-6 text-center text-sm text-[var(--cr-motion-dim)]'>
                            {shows.data.length === 0 ? 'Connecting…' : 'No production activity yet.'}
                        </div>
                    )}
                    {showJobs.map((job) => <JobRow key={job.jobId.toString()} job={job} />)}
                </div>
            </div>
        );
    }

    const stageIndex = stageFlow.findIndex((s) => s.status === show.status);

    return (
        <div className='min-h-screen max-w-6xl mx-auto px-8 py-10'>
            <div className='flex items-center gap-3 mb-2'>
                <Link
                    to='/'
                    className='mono text-xs text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)]'
                    onClick={(e) => { if (confirmExit('back')) e.preventDefault(); }}>← shows</Link>
            </div>
            <header className='flex items-start justify-between gap-6 mb-6'>
                <div className='min-w-0'>
                    <div className='eyebrow mb-2'>{show.status === 'Failed' ? `failed at ${show.stage}` : 'show'}</div>
                    <h1 className='display text-3xl font-bold truncate'>{plan?.title || show.title}</h1>
                    <p className='text-sm text-[var(--cr-motion-dim)] mt-2 max-w-prose'>{show.description}</p>
                </div>
                <div className='flex items-center gap-3 flex-shrink-0 pt-1'>
                    <StatusBadge status={show.status} />
                    <Button label='Save' icon='pi pi-save' severity='secondary' outlined loading={busy} onClick={() => saveRef.current?.(false)} />
                    <Button label='Save & render' icon='pi pi-sparkles' loading={busy} onClick={() => saveRef.current?.(true)} />
                </div>
            </header>

            <div className='flex gap-1 mb-6 border-b border-[rgba(255,255,255,0.08)] pb-2'>
                {(['overview', 'storyboard'] as const).map((t) => (
                    <button
                        key={t}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors capitalize ${tab === t ? 'bg-[rgba(140,124,246,0.14)] text-[var(--cr-motion-violet)]' : 'text-[var(--cr-motion-dim)] hover:text-[var(--cr-motion-ink)]'}`}
                        onClick={() => switchTab(t)}>
                        {t}
                    </button>
                ))}
            </div>

            {saveError && (
                <div className='panel p-4 mb-6 border-l-4' style={{ borderLeftColor: '#e5484d' }}>
                    <p className='text-sm text-[#e5484d]'>{saveError}</p>
                </div>
            )}

            <div style={tab === 'overview' ? undefined : { display: 'none' }}>
            {show.error && (
                <div className='panel p-4 mb-6 border-l-4' style={{ borderLeftColor: '#e5484d' }}>
                    <div className='mono text-xs text-[#e5484d] mb-1'>{show.stage} failed</div>
                    <p className='text-sm text-[var(--cr-motion-dim)]'>{show.error}</p>
                </div>
            )}

            {/* pipeline */}
            <section className='panel p-5 mb-6'>
                <div className='eyebrow mb-4'>pipeline</div>
                <div className='flex items-center gap-2 flex-wrap'>
                    {stageFlow.filter((s) => !s.status.endsWith('ing')).map((entry) => {
                        const index = stageFlow.findIndex((s) => s.status === entry.status);
                        const done = show.status === 'Rendered' || (stageIndex >= 0 && index < stageIndex);
                        const active = stageIndex >= 0 && stageFlow[stageIndex].status === entry.status;
                        const failed = show.status === 'Failed' && show.stage === entry.stage;
                        return (
                            <div key={entry.status} className='flex items-center gap-2'>
                                <span className={`stage-dot ${failed ? 'failed' : done ? 'done' : active ? 'active pulsing' : ''}`} />
                                <span className={`mono text-xs ${done ? 'text-[var(--cr-motion-dim)]' : active ? 'text-[var(--cr-motion-ink)]' : 'text-[var(--cr-motion-faint)]'}`}>
                                    {entry.label}
                                </span>
                                {retryStageFor(entry.stage, show) && (
                                    <RetryButton showId={show.id} stage={retryStageFor(entry.stage, show)!} />
                                )}
                                <span className='text-[var(--cr-motion-faint)]'>·</span>
                            </div>
                        );
                    })}
                </div>
                {show.status === 'Rendering' && (
                    <p className='text-xs text-[var(--cr-motion-dim)] mt-3'>
                        Rendering captures every frame in headless Chrome and encodes with ffmpeg — a minute or two per minute of video.
                    </p>
                )}
                {showJobs.length > 0 && (
                    <div className='mt-5 pt-4 border-t border-[rgba(255,255,255,0.08)]'>
                        <div className='eyebrow mb-3'>jobs</div>
                        <div className='flex flex-col gap-2'>
                            {showJobs.slice(0, 4).map((job) => <JobRow key={job.jobId.toString()} job={job} />)}
                        </div>
                    </div>
                )}
            </section>

            {/* artifacts */}
            <section className='grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6'>
                {show.videoPath && (
                    <div className='panel p-5 lg:col-span-2'>
                        <div className='eyebrow mb-3'>render</div>
                        <video
                            ref={videoRef}
                            controls
                            className='w-full rounded-lg border hairline'
                            src={`/packages/${show.id}/${show.videoPath}`}
                        />
                        <div className='flex items-center gap-4 mt-3 mono text-xs text-[var(--cr-motion-faint)]'>
                            <span>{Math.round(show.videoDurationSeconds)}s</span>
                            <span>{(show.videoSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                            <a className='hover:text-[var(--cr-motion-ink)]' href={`/packages/${show.id}/${show.videoPath}`} download>download</a>
                        </div>
                    </div>
                )}

                {show.audioPath && (
                    <div className='panel p-5'>
                        <div className='eyebrow mb-3'>voiceover, scene by scene</div>
                        <SceneAuditions showId={show.id.toString()} planJson={show.planJson} />
                    </div>
                )}

                {show.packageZip && (
                    <div className='panel p-5'>
                        <div className='eyebrow mb-3'>package</div>
                        <p className='text-sm text-[var(--cr-motion-dim)] mb-3'>
                            Spec, voiceover and timing data — everything the engine renders from.
                        </p>
                        <div className='flex gap-2'>
                            <a href={`/packages/${show.id}/package.zip`} download>
                                <Button label='package.zip' icon='pi pi-download' severity='secondary' text />
                            </a>
                            <Link to={`/preview/index.html?pkg=/packages/${show.id}/package/&back=/shows/${show.id}`} target='_blank'>
                                <Button label='Preview in engine' icon='pi pi-play' severity='secondary' text />
                            </Link>
                        </div>
                    </div>
                )}
            </section>

            </div>

            <div style={tab === 'storyboard' ? undefined : { display: 'none' }}>
                <StoryboardEditor
                    show={show}
                    registerSave={(fn) => { saveRef.current = fn; }}
                    registerDirty={setDirty}
                    busy={busy}
                    setBusy={setBusy}
                    saveError={saveError}
                    setSaveError={setSaveError} />
            </div>

            {pendingExit !== null && (
                <div
                    className='fixed inset-0 z-50 grid place-items-center bg-[rgba(6,7,10,0.72)] p-6'
                    onClick={() => setPendingExit(null)}>
                    <div className='panel panel-accent w-full max-w-md p-6' onClick={(e) => e.stopPropagation()}>
                        <h2 className='display text-lg font-bold mb-2'>Changes not recorded</h2>
                        <p className='text-sm text-[var(--cr-motion-dim)] mb-5'>
                            Your scene changes aren't saved or spoken yet — leaving now discards them.
                            Generate to record the voice, re-time the scenes and render.
                        </p>
                        <div className='flex justify-end gap-2'>
                            <Button
                                label='Discard changes'
                                severity='secondary'
                                outlined
                                onClick={() => {
                                    const dest = pendingExit;
                                    setPendingExit(null);
                                    setDirty(false);
                                    if (dest === 'back') navigate('/');
                                    else navigate(dest === 'overview' ? `/shows/${id}` : `/shows/${id}/storyboard`);
                                }} />
                            <Button
                                label='Generate'
                                icon='pi pi-sparkles'
                                onClick={() => {
                                    const produce = saveRef.current;
                                    setPendingExit(null);
                                    navigate(`/shows/${id}/storyboard`);
                                    produce?.(true);
                                }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Per-scene recordings: one take per scene, played from its own file. The single mixed
 * voiceover is a pipeline artifact now - the editor hears (and retries) scenes individually.
 */
export function SceneAuditions({ showId, planJson }: { showId: string; planJson?: string }) {
    const plan = useMemo(() => ShowPlan.parse(planJson), [planJson]);
    const [meta, setMeta] = useState<{ index: number; file: string; duration: number; spoken: string }[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/packages/${showId}/voiceover/scenes.json`);
                if (res.ok && !cancelled) {
                    const doc = await res.json();
                    setMeta(doc.scenes ?? []);
                }
            } catch { /* the pipeline has not spoken yet */ }
        })();
        return () => { cancelled = true; };
    }, [showId, planJson]);

    if (meta.length === 0) {
        return (
            <div className='flex flex-col gap-2'>
                <audio controls className='w-full' src={`/packages/${showId}/voiceover.mp3`} />
                <div className='mono text-xs text-[var(--cr-motion-faint)]'>mixed track · per-scene takes appear once the voice stage runs</div>
            </div>
        );
    }

    return (
        <div className='flex flex-col gap-1.5'>
            {meta.map((scene) => (
                <div key={scene.index} className='flex items-center gap-3 py-1.5 border-b border-[rgba(255,255,255,0.05)] last:border-0'>
                    <button
                        className='w-8 h-8 flex-shrink-0 rounded-full border border-[rgba(255,255,255,0.14)] grid place-items-center hover:border-[var(--cr-motion-violet)] text-xs'
                        title={`Play scene ${scene.index} recording`}
                        onClick={() => { void new Audio(`/packages/${showId}/${scene.file}`).play(); }}>
                        ▶
                    </button>
                    <span className='mono text-[11px] text-[var(--cr-motion-faint)] w-14'>{String(scene.index).padStart(2, '0')} · {scene.duration.toFixed(1)}s</span>
                    <span className='text-sm text-[var(--cr-motion-dim)] truncate flex-1'>{scene.spoken}</span>
                </div>
            ))}
        </div>
    );
}

function retryStageFor(stage: string | undefined, show: Show): string | null {
    if (!stage) return null;
    if (show.status === 'Failed' && show.stage === stage) return stage;
    if (retryable.includes(show.status)) return stage;
    return null;
}

function RetryButton({ showId, stage }: { showId: any; stage: string }) {
    const [command, setValues] = RegenerateShowStage.use();
    const regenerate = async () => {
        setValues({ showId: showId.toString(), stage });
        await command.execute();
    };
    return (
        <button
            onClick={regenerate}
            className='mono text-[10px] px-1.5 py-0.5 rounded border hairline text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-violet)] hover:border-[var(--cr-motion-violet)] transition-colors'
            title={`Re-run ${stage} — everything after it re-runs too`}>
            ↻ {stage}
        </button>
    );
}


