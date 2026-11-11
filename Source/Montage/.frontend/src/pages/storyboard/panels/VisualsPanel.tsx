// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { Show } from '../../../../Api/Shows/Listing';
import { SceneImage } from '../model';

export function VisualsPanel({ show, imagesRaw, onParam }: { show: Show; imagesRaw: SceneImage[] | undefined; onParam: (key: string, value: unknown) => void }) {
    return (
        <>
                    <p className='text-sm text-[var(--cr-montage-dim)]'>
                        Pictures on the slide. Each gets its own motion and a
                        <span className='text-[var(--cr-montage-ink)]'> direction</span> — what should happen to it, in plain
                        words. Directions are saved with the scene; currently the chosen preset drives image motion.
                    </p>
                    {(imagesRaw ?? []).length === 0 && (
                        <p className='text-xs text-[var(--cr-montage-faint)]'>No images yet — add one below (PNG, JPG, GIF, WebP, SVG).</p>
                    )}
                    {(imagesRaw ?? []).map((img, i) => (
                        <div key={`${img.src}-${i}`} className='flex gap-3 items-start panel p-3'>
                            <img
                                src={`/packages/${show.id}/package/${img.src}`}
                                alt={img.headline ?? img.src}
                                className='w-24 h-16 rounded-lg border border-[var(--cr-montage-rule)] object-cover shrink-0'
                                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                            <div className='flex-1 flex flex-col gap-2 min-w-0'>
                                <div className='flex gap-2 items-center'>
                                    <select
                                        className='panel px-2 py-1.5 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                                        value={img.motion ?? 'kenburns'}
                                        onChange={(e) => {
                                            const next = [...(imagesRaw ?? [])];
                                            next[i] = { ...img, motion: e.target.value };
                                            onParam('images', next);
                                        }}>
                                        {['kenburns', 'zoom-in', 'zoom-out', 'pan', 'slide', 'pop', 'fade'].map((m) => (
                                            <option key={m} value={m} className='bg-[#12151d]'>{m}</option>
                                        ))}
                                    </select>
                                    <span className='text-xs text-[var(--cr-montage-faint)] truncate flex-1 mono'>{img.src}</span>
                                    <button
                                        className='chip px-2.5 py-1.5 text-xs hover:border-[var(--cr-montage-red)]'
                                        onClick={() => onParam('images', (imagesRaw ?? []).filter((_, j) => j !== i))}>
                                        remove
                                    </button>
                                </div>
                                <input
                                    className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                                    placeholder='What should happen to this image?'
                                    value={img.describe ?? ''}
                                    onChange={(e) => {
                                        const next = [...(imagesRaw ?? [])];
                                        next[i] = { ...img, describe: e.target.value };
                                        onParam('images', next);
                                    }} />
                                <input
                                    className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                                    placeholder='Caption chip (optional, few words)'
                                    value={img.headline ?? ''}
                                    onChange={(e) => {
                                        const next = [...(imagesRaw ?? [])];
                                        next[i] = { ...img, headline: e.target.value };
                                        onParam('images', next);
                                    }} />
                            </div>
                        </div>
                    ))}
                    <label className='chip px-4 py-2.5 text-sm cursor-pointer self-start hover:border-[var(--cr-montage-violet)]'>
                        + Add images
                        <input
                            type='file'
                            accept='image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
                            multiple
                            className='hidden'
                            onChange={async (e) => {
                                const files = [...(e.target.files ?? [])];
                                if (files.length === 0) return;
                                const added: SceneImage[] = [];
                                for (const file of files) {
                                    const form = new FormData();
                                    form.append('file', file);
                                    try {
                                        const res = await fetch(`/api/montage/shows/${show.id}/images`, { method: 'POST', body: form });
                                        if (res.ok) {
                                            const j = await res.json() as { path: string };
                                            added.push({ src: j.path, motion: 'kenburns', describe: '', headline: '' });
                                        }
                                    } catch { /* ignored — the visible list stays honest */ }
                                }
                                if (added.length > 0) onParam('images', [...(imagesRaw ?? []), ...added]);
                                e.target.value = '';
                            }} />
                    </label>
        </>
    );
}
