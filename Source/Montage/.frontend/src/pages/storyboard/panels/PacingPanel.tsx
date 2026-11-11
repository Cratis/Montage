// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

export function PacingPanel({ pacingRaw, onParam }: { pacingRaw: { leadIn?: number; hold?: number } | undefined; onParam: (key: string, value: unknown) => void }) {
    return (
        <>
                    <p className='text-sm text-[var(--cr-montage-dim)]'>
                        Shape the scene's silence. A <span className='text-[var(--cr-montage-ink)]'>lead-in</span> keeps
                        the scene quiet after it appears — the build animates, the narration highlight waits.
                        A <span className='text-[var(--cr-montage-ink)]'>hold</span> lingers the highlight on the
                        last word after it is spoken, so a closing beat can sit.
                    </p>
                    <div className='grid grid-cols-2 gap-3'>
                        <label className='block'>
                            <span className='eyebrow block mb-1.5'>Lead-in (seconds)</span>
                            <input
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent mono'
                                type='number' min={0} step={0.1}
                                value={pacingRaw?.leadIn ?? ''}
                                placeholder='0'
                                onChange={(e) => onParam('pacing', { ...(pacingRaw ?? {}), leadIn: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        </label>
                        <label className='block'>
                            <span className='eyebrow block mb-1.5'>Hold last word (seconds)</span>
                            <input
                                className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent mono'
                                type='number' min={0} step={0.1}
                                value={pacingRaw?.hold ?? ''}
                                placeholder='0'
                                onChange={(e) => onParam('pacing', { ...(pacingRaw ?? {}), hold: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        </label>
                    </div>
                    <p className='text-xs text-[var(--cr-montage-faint)]'>
                        Applies to word-timed scenes (kinetic). The word timeline in the Timing tab shows
                        absolute times — a lead-in shifts the highlight, not the words themselves.
                    </p>
        </>
    );
}
