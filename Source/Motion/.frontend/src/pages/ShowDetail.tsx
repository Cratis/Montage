// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@cratis/components/Common';
import { Show, ObserveAll } from '../../Api/Shows/Listing';
import { RegenerateShowStage } from '../../Api/Shows/Creation';
import { All as AllJobs, JobActivity } from '../../Api/Shows/Production';
import { ShowPlan } from '../plan';

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
    const [shows] = ObserveAll.use();
    const [jobs] = AllJobs.use();
    const show = shows.data.find((s) => s.id.toString() === id);
    const plan = useMemo(() => ShowPlan.parse(show?.planJson), [show?.planJson]);
    const showJobs = jobs.data
        .filter((job: JobActivity) => job.showId === id)
        .sort((a: JobActivity, b: JobActivity) => new Date(b.created).getTime() - new Date(a.created).getTime());

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
                <Link to='/' className='mono text-xs text-[var(--cr-motion-faint)] hover:text-[var(--cr-motion-ink)]'>← shows</Link>
            </div>
            <header className='flex items-start justify-between gap-6 mb-8'>
                <div className='min-w-0'>
                    <div className='eyebrow mb-2'>{show.status === 'Failed' ? `failed at ${show.stage}` : 'show'}</div>
                    <h1 className='display text-3xl font-bold truncate'>{plan?.title || show.title}</h1>
                    <p className='text-sm text-[var(--cr-motion-dim)] mt-2 max-w-prose'>{show.description}</p>
                </div>
                <StatusBadge status={show.status} />
            </header>

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
                            controls
                            className='w-full rounded-lg border hairline'
                            src={`/renders/${show.id}/${show.videoPath}`}
                        />
                        <div className='flex items-center gap-4 mt-3 mono text-xs text-[var(--cr-motion-faint)]'>
                            <span>{Math.round(show.videoDurationSeconds)}s</span>
                            <span>{(show.videoSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                            <a className='hover:text-[var(--cr-motion-ink)]' href={`/renders/${show.id}/${show.videoPath}`} download>download</a>
                        </div>
                    </div>
                )}

                {show.audioPath && (
                    <div className='panel p-5'>
                        <div className='eyebrow mb-3'>voiceover</div>
                        <audio controls className='w-full' src={`/packages/${show.id}/${show.audioPath}`} />
                        <div className='mono text-xs text-[var(--cr-motion-faint)] mt-2'>
                            {show.audioDurationSeconds.toFixed(1)}s · spoken by the self-hosted voice
                        </div>
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
                            <Link to={`/preview/index.html?pkg=/packages/${show.id}/package/`} target='_blank'>
                                <Button label='Preview in engine' icon='pi pi-play' severity='secondary' text />
                            </Link>
                        </div>
                    </div>
                )}
            </section>

            {/* storyboard */}
            {plan && (
                <section className='panel p-5'>
                    <div className='eyebrow mb-4'>storyboard · {plan.scenes.length} scenes</div>
                    <div className='flex flex-col gap-3'>
                        {plan.scenes.map((scene, i) => (
                            <div key={i} className='border hairline rounded-xl p-4'>
                                <div className='flex items-center justify-between mb-2'>
                                    <span className='mono text-xs text-[var(--cr-motion-violet)]'>{String(i + 1).padStart(2, '0')} · {scene.type}</span>
                                </div>
                                {scene.spoken && (
                                    <p className='text-sm text-[var(--cr-motion-ink)]/90 mb-2'>
                                        <span className='mono text-[10px] text-[var(--cr-motion-faint)] mr-2'>SPOKEN</span>
                                        {scene.spoken}
                                    </p>
                                )}
                                <pre className='mono text-[11px] text-[var(--cr-motion-dim)] whitespace-pre-wrap max-h-32 overflow-y-auto'>
                                    {JSON.stringify(scene.params ?? {}, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                </section>
            )}
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


const jobStatusColor = (job: JobActivity) =>
    job.error ? '#e5484d' : job.isRunning ? 'var(--cr-motion-amber)' : 'var(--cr-motion-violet)';

/**
 * One durable job in the production pipeline: what it is, whether it is running, and why it
 * failed when it did. These are Orleans jobs - they survive a restart - so the view is history,
 * not just the live tick.
 */
export function JobRow({ job }: { job: JobActivity }) {
    const color = jobStatusColor(job);
    const started = new Date(job.created);
    return (
        <div className='panel px-3.5 py-2.5 flex items-center gap-3'>
            <span
                className={`stage-dot flex-shrink-0 ${job.isRunning ? 'active pulsing' : job.error ? 'failed' : 'done'}`}
                style={job.error && !job.isRunning ? { background: '#e5484d', boxShadow: 'none' } : undefined} />
            <div className='min-w-0 flex-1'>
                <div className='text-sm truncate'>{job.details}</div>
                <div className='mono text-[11px] text-[var(--cr-motion-faint)]'>
                    {job.type.replace(/^Motion\.Shows\.[a-z]+\./, '').replace(/Job$/, '')} · {started.toLocaleTimeString()}
                    {job.error && <span className='text-[#e5484d]'> — {job.error}</span>}
                </div>
            </div>
            <span
                className='mono text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap'
                style={{ color, borderColor: color, background: 'rgba(255,255,255,0.03)' }}>
                {job.isRunning ? 'running' : job.error ? 'failed' : (job.status || '').toLowerCase()}
            </span>
        </div>
    );
}
