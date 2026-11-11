// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { csv, fromCsv } from './model';

/** Small labeled text input. */
export function Field({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
    return (
        <label className='block'>
            <span className='eyebrow block mb-1.5'>{label}</span>
            <input
                className={`w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent ${mono ? 'mono' : ''}`}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)} />
        </label>
    );
}

/** Comma-separated list input producing a string array. */
export function ListField({ label, value, onChange, placeholder }: { label: string; value: unknown; onChange: (v: string[]) => void; placeholder?: string }) {
    return (
        <Field
            label={`${label} (comma-separated)`}
            value={csv(value)}
            onChange={(v) => onChange(fromCsv(v))}
            placeholder={placeholder} />
    );
}
