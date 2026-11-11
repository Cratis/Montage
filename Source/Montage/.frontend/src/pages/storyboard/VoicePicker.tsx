// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useState } from 'react';

/** The voice dropdown: what the text-to-speech service actually offers, with an audition button. */
export function VoicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [voices, setVoices] = useState<string[]>([]);
    const [previewing, setPreviewing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/montage/voices')
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setVoices(d.voices ?? []); })
            .catch(() => { /* dropdown falls back to the current value */ });
        return () => { cancelled = true; };
    }, []);

    const preview = async () => {
        setPreviewing(true);
        try {
            const audio = new Audio(`/api/montage/voices/preview?voice=${encodeURIComponent(value)}`);
            audio.onended = () => setPreviewing(false);
            audio.onerror = () => setPreviewing(false);
            await audio.play();
        } catch { setPreviewing(false); }
    };

    return (
        <div className='flex gap-2'>
            <select
                className='flex-1 panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent mono'
                value={value}
                onChange={(e) => onChange(e.target.value)}>
                {!voices.includes(value) && <option value={value}>{value || 'pick a voice'}</option>}
                {voices.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button
                className='panel px-3 grid place-items-center hover:border-[var(--cr-montage-violet)] text-[var(--cr-montage-dim)] hover:text-[var(--cr-montage-ink)]'
                title='Hear this voice say a line'
                disabled={previewing || !value}
                onClick={preview}>
                {previewing ? '…' : '▶'}
            </button>
        </div>
    );
}
