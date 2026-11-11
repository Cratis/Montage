// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { Scene, asString } from '../model';

export function MotionPanel({ scene, presets, motionRaw, onParam }: { scene: Scene; presets: { value: string; label: string }[]; motionRaw: { preset?: string; duration?: number; describe?: string } | undefined; onParam: (key: string, value: unknown) => void }) {
    return (
        <>
                        {presets.length > 0 ? (
                            <>
                                <label className='block'>
                                    <span className='eyebrow block mb-1.5'>Preset</span>
                                    <div className='flex gap-2 flex-wrap'>
                                        <button
                                            className={`px-3 py-1.5 rounded-md text-sm mono border ${!motionRaw?.preset ? 'border-[var(--cr-montage-violet)] text-[var(--cr-montage-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-montage-dim)]'}`}
                                            onClick={() => onParam('motion', { ...(motionRaw ?? {}), preset: undefined })}>
                                            default
                                        </button>
                                        {presets.map((p) => (
                                            <button
                                                key={p.value}
                                                className={`px-3 py-1.5 rounded-md text-sm mono border ${motionRaw?.preset === p.value ? 'border-[var(--cr-montage-violet)] text-[var(--cr-montage-violet)]' : 'border-[rgba(255,255,255,0.12)] text-[var(--cr-montage-dim)]'}`}
                                                onClick={() => onParam('motion', { ...(motionRaw ?? {}), preset: p.value })}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </label>
                                <label className='block max-w-[12rem]'>
                                    <span className='eyebrow block mb-1.5'>Build time (seconds)</span>
                                    <input
                                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent mono'
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
                                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent resize-y'
                                        rows={2}
                                        placeholder='e.g. bars rise as each word lands; the max bar pulses on the punchline'
                                        value={asString(motionRaw?.describe)}
                                        onChange={(e) => onParam('motion', { ...(motionRaw ?? {}), describe: e.target.value })} />
                                </label>
                            </>
                        ) : (
                            <p className='text-sm text-[var(--cr-montage-dim)]'>
                                {scene.type === 'diagram' ? 'Configure per-box and connector choreography in the Design tab.' : scene.type === 'image' ? 'Configure each image’s motion in the Visuals tab.' : 'This scene is word-timed — the narration itself drives its motion, word by word.'}
                            </p>
                        )}
        </>
    );
}
