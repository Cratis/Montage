// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { Button } from '@cratis/components/Common';
import { JobActivity } from '../../../../Api/Shows/Production';
import { JobRow } from '../../JobRow';
import { Scene, SceneMeta, pad2, wordsIn } from '../model';

export function NarrationPanel({ scene, meta, jobs, showId, sceneNumber, onChange, onProduce }: { scene: Scene; meta?: SceneMeta; jobs: JobActivity[]; showId: string; sceneNumber: number; onChange: (patch: Partial<Scene>) => void; onProduce: () => void }) {
    return (
        <>
                        <label className='block'>
                            <span className='eyebrow block mb-1.5'>What the voice says</span>
                            <textarea
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent resize-y min-h-[6rem]'
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
                                    className='w-10 h-10 rounded-full border border-[rgba(255,255,255,0.16)] grid place-items-center hover:border-[var(--cr-montage-violet)]'
                                    title='Audition this scene’s recording'
                                    onClick={() => {
                                        const audio = new Audio(`/packages/${showId}/${meta.file}`);
                                        void audio.play();
                                    }}>▶</button>
                                <div className='mono text-xs text-[var(--cr-montage-faint)]'>
                                    take {pad2(sceneNumber)}.wav · {meta.duration.toFixed(2)}s · {wordsIn(meta.spoken)} words
                                </div>
                            </div>
                        )}
        </>
    );
}
