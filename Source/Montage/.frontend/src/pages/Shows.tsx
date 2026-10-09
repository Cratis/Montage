// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@cratis/components/Common';
import { Dialog } from '@cratis/components/Dialogs';
import { Show, ObserveAll } from '../../Api/Shows/Listing';
import { CreateShow } from '../../Api/Shows/Creation';
import { AllAIProviders } from '@cratis/ai';
import { StatusBadge, stageFlow } from './ShowDetail';

const statusRank = (show: Show) => stageFlow.findIndex((s) => s.status === show.status);

export function Shows() {
    const navigate = useNavigate();
    const [shows] = ObserveAll.use();
    const [createVisible, setCreateVisible] = useState(false);

    const sorted = [...shows.data].sort((a, b) =>
        statusRank(b) - statusRank(a) || (a.title ?? '').localeCompare(b.title ?? ''));

    return (
        <div className='min-h-screen max-w-6xl mx-auto px-8 py-10'>
            <header className='flex items-end justify-between mb-10'>
                <div>
                    <div className='eyebrow mb-2'>cratis · montage</div>
                    <h1 className='display text-4xl font-bold'>Shows</h1>
                    <p className='text-[var(--cr-montage-dim)] mt-2 text-sm max-w-prose'>
                        Describe a video. Montage plans the story, speaks it with a self-hosted voice,
                        and renders it — story, voice and animated infographics in one deterministic pass.
                    </p>
                </div>
                <Button
                    label='New show'
                    icon='pi pi-plus'
                    onClick={() => setCreateVisible(true)}
                />
            </header>

            {sorted.length === 0 && (
                <div className='panel p-10 text-center text-[var(--cr-montage-dim)]'>
                    No shows yet. Describe your first video and watch it become one.
                </div>
            )}

            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                {sorted.map((show) => (
                    <button
                        key={show.id.toString()}
                        className='panel panel-accent p-5 text-left hover:border-[rgba(255,255,255,0.2)] transition-colors cursor-pointer'
                        onClick={() => navigate(`/shows/${show.id}`)}>
                        <div className='flex items-start justify-between gap-4'>
                            <div className='min-w-0'>
                                <div className='display text-lg font-semibold truncate'>{show.title}</div>
                                <div className='text-sm text-[var(--cr-montage-dim)] line-clamp-2 mt-1'>{show.description}</div>
                            </div>
                            <StatusBadge status={show.status} />
                        </div>
                        <div className='flex items-center gap-4 mt-4 text-xs text-[var(--cr-montage-faint)] mono'>
                            <span>{Math.round(show.targetDurationSeconds)}s target</span>
                            {show.videoDurationSeconds > 0 && <span>{Math.round(show.videoDurationSeconds)}s rendered</span>}
                            {show.error && <span className='text-[#e5484d] truncate'>{show.stage}: {show.error}</span>}
                        </div>
                        <div className='flex items-center gap-1.5 mt-3'>
                            {stageFlow.filter((s) => !s.status.endsWith('ing')).map((entry) => {
                                const index = stageFlow.findIndex((s) => s.status === entry.status);
                                const here = stageIndex(show.status);
                                return (
                                    <span
                                        key={entry.status}
                                        className={`stage-dot ${show.status === entry.status ? 'active pulsing' : here > index ? 'done' : ''}`}
                                        title={entry.label} />
                                );
                            })}
                        </div>
                    </button>
                ))}
            </div>

            <CreateShowDialog visible={createVisible} onHide={() => setCreateVisible(false)} />
        </div>
    );
}

const stageIndex = (status: string) => stageFlow.findIndex((s) => s.status === status);

function CreateShowDialog({ visible, onHide }: { visible: boolean; onHide: () => void }) {
    const navigate = useNavigate();
    const [command, setValues, clear] = CreateShow.use();
    const [providers] = AllAIProviders.use();
    const [busy, setBusy] = useState(false);

    const create = async (planManually: boolean, destination: string) => {
        setBusy(true);
        try {
            setValues({ planManually } as never);
            const result = await command.execute();
            if (result.isSuccess) {
                clear();
                onHide();
                const id = result.response;
                if (id) navigate(destination.replace(':id', id.toString()));
            }
        } finally {
            setBusy(false);
        }
    };

    const canCreate = (command.description ?? '').trim().length >= 8;
    const footer = (
        <div className='flex justify-end gap-2'>
            <Button label='Cancel' severity='secondary' text onClick={onHide} />
            <Button
                label='Define slides'
                icon='pi pi-file-edit'
                severity='secondary'
                outlined
                loading={busy}
                disabled={!canCreate}
                title='Create the show and go straight to the storyboard — you add the scenes'
                onClick={() => create(true, '/shows/:id/storyboard')}
            />
            <Button
                label='Try your luck'
                icon='pi pi-sparkles'
                loading={busy}
                disabled={!canCreate}
                title='Create the show and let the language model plan the whole thing'
                onClick={() => create(false, '/shows/:id')}
            />
        </div>
    );

    return (
        <Dialog
            title='Describe a video'
            visible={visible}
            onCancel={onHide}
            buttons={footer}
            dismissable>
            <div className='flex flex-col gap-4 pt-2'>
                <div>
                    <label className='eyebrow block mb-2'>What should it be about?</label>
                    <textarea
                        className='w-full h-28 panel p-3 text-sm outline-none focus:border-[var(--cr-montage-violet)] resize-none bg-transparent'
                        placeholder='e.g. Explain why cutting video in the pauses of a voiceover makes motion graphics feel intentional — and how doing it from code removes the busywork.'
                        value={command.description ?? ''}
                        onChange={(e) => setValues({ description: e.target.value })}
                    />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                    <div>
                        <label className='eyebrow block mb-2'>Working title (optional)</label>
                        <input
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                            value={command.title ?? ''}
                            onChange={(e) => setValues({ title: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className='eyebrow block mb-2'>Target length (seconds)</label>
                        <input
                            type='number' min={15} max={300}
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                            value={command.targetDurationSeconds ?? ''}
                            onChange={(e) => setValues({ targetDurationSeconds: Number(e.target.value) || undefined })}
                        />
                    </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                    <div>
                        <label className='eyebrow block mb-2'>Tone (optional)</label>
                        <input
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                            placeholder='calm, technical'
                            value={command.tone ?? ''}
                            onChange={(e) => setValues({ tone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className='eyebrow block mb-2'>Audience (optional)</label>
                        <input
                            className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                            placeholder='developers'
                            value={command.audience ?? ''}
                            onChange={(e) => setValues({ audience: e.target.value })}
                        />
                    </div>
                </div>
                <div>
                    <label className='eyebrow block mb-2'>Planned by (AI provider)</label>
                    <select
                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                        value={command.AIProviderId ?? ''}
                        onChange={(e) => setValues({ AIProviderId: e.target.value || undefined })}>
                        <option value=''>— pick a provider —</option>
                        {[...providers.data]
                            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
                            .map((provider) => (
                                <option key={provider.id.toString()} value={provider.id.toString()}>
                                    {provider.name}
                                </option>
                            ))}
                    </select>
                    {providers.data.length === 0 && (
                        <p className='text-xs text-[#e5484d] mt-2'>
                            No AI providers configured — add one under the cogwheel, top right. Without
                            one, only shows with a plan already on disk can be produced.
                        </p>
                    )}
                </div>
                <p className='text-xs text-[var(--cr-montage-faint)]'>
                    Everything not set here gets a sensible default — the planner decides the story,
                    scenes, transitions and on-screen text.
                </p>
            </div>
        </Dialog>
    );
}
