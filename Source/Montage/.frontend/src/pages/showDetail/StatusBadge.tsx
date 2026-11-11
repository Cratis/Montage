// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


export function StatusBadge({ status }: { status: string }) {
    const failed = status === 'Failed';
    const done = status === 'Rendered';
    const color = failed ? '#e5484d' : done ? 'var(--cr-montage-violet)' : 'var(--cr-montage-amber)';
    return (
        <span
            className='mono text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap'
            style={{ color, borderColor: color, background: 'rgba(255,255,255,0.03)' }}>
            {status.toLowerCase()}
        </span>
    );
}
