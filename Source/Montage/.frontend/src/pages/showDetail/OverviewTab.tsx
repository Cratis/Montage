// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@cratis/components/Common';
import { Show } from '../../../Api/Shows/Listing';
import { RegenerateShowStage } from '../../../Api/Shows/Creation';
import { JobActivity } from '../../../Api/Shows/Production';
import { ShowPlan } from '../../plan';
import { JobRow } from '../JobRow';
import { retryable, stageFlow } from './stageFlow';

type StageEntry = (typeof stageFlow)[number];

function PipelineStage({ entry, show, stageIndex }: { entry: StageEntry; show: Show; stageIndex: number }) {
    const index = stageFlow.findIndex((s) => s.status === entry.status);
    const done = show.status === 'Rendered' || (stageIndex >= 0 && index < stageIndex);
    const active = stageIndex >= 0 && stageFlow[stageIndex].status === entry.status;
    const failed = show.status === 'Failed' && show.stage === entry.stage;
    const retry = retryStageFor(entry.stage, show);
    const dot = failed ? 'failed' : done ? 'done' : active ? 'active pulsing' : '';
    const tone = done ? 'text-[var(--cr-montage-dim)]' : active ? 'text-[var(--cr-montage-ink)]' : 'text-[var(--cr-montage-faint)]';
    return (
        <div className='flex items-center gap-2'>
            <span className={`stage-dot ${dot}`} />
            <span className={`mono text-xs ${tone}`}>{entry.label}</span>
            {retry && <RetryButton showId={show.id} stage={retry} />}
            <span className='text-[var(--cr-montage-faint)]'>·</span>
        </div>
    );
}

/** The overview tab: failure banner, pipeline with its jobs, and the produced artifacts. */
export function OverviewTab({ show, showJobs, videoRef }: { show: Show; showJobs: JobActivity[]; videoRef: React.RefObject<HTMLVideoElement | null> }) {
    const stageIndex = stageFlow.findIndex((s) => s.status === show.status);
    return (
        <>
            {show.error && (
                <div className='panel p-4 mb-6 border-l-4' style={{ borderLeftColor: '#e5484d' }}>
                    <div className='mono text-xs text-[#e5484d] mb-1'>{show.stage} failed</div>
                    <p className='text-sm text-[var(--cr-montage-dim)]'>{show.error}</p>
                </div>
            )}

            {/* pipeline */}
            <section className='panel p-5 mb-6'>
                <div className='eyebrow mb-4'>pipeline</div>
                <div className='flex items-center gap-2 flex-wrap'>
                    {stageFlow.filter((s) => !s.status.endsWith('ing')).map((entry) => (
                        <PipelineStage key={entry.status} entry={entry} show={show} stageIndex={stageIndex} />
                    ))}
                </div>
                {show.status === 'Rendering' && (
                    <p className='text-xs text-[var(--cr-montage-dim)] mt-3'>
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
                        <div className='flex items-center gap-4 mt-3 mono text-xs text-[var(--cr-montage-faint)]'>
                            <span>{Math.round(show.videoDurationSeconds)}s</span>
                            <span>{(show.videoSizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                            <a className='hover:text-[var(--cr-montage-ink)]' href={`/packages/${show.id}/${show.videoPath}`} download>download</a>
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
                        <p className='text-sm text-[var(--cr-montage-dim)] mb-3'>
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
        </>
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
                <div className='mono text-xs text-[var(--cr-montage-faint)]'>mixed track · per-scene takes appear once the voice stage runs</div>
            </div>
        );
    }

    return (
        <div className='flex flex-col gap-1.5'>
            {meta.map((scene) => (
                <div key={scene.index} className='flex items-center gap-3 py-1.5 border-b border-[rgba(255,255,255,0.05)] last:border-0'>
                    <button
                        className='w-8 h-8 flex-shrink-0 rounded-full border border-[rgba(255,255,255,0.14)] grid place-items-center hover:border-[var(--cr-montage-violet)] text-xs'
                        title={`Play scene ${scene.index} recording`}
                        onClick={() => { void new Audio(`/packages/${showId}/${scene.file}`).play(); }}>
                        ▶
                    </button>
                    <span className='mono text-[11px] text-[var(--cr-montage-faint)] w-14'>{String(scene.index).padStart(2, '0')} · {scene.duration.toFixed(1)}s</span>
                    <span className='text-sm text-[var(--cr-montage-dim)] truncate flex-1'>{scene.spoken}</span>
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
            className='mono text-[10px] px-1.5 py-0.5 rounded border hairline text-[var(--cr-montage-faint)] hover:text-[var(--cr-montage-violet)] hover:border-[var(--cr-montage-violet)] transition-colors'
            title={`Re-run ${stage} — everything after it re-runs too`}>
            ↻ {stage}
        </button>
    );
}


