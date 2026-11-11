// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


export type ShowTab = 'overview' | 'storyboard';

/** The overview / storyboard switcher. */
export function TabBar({ tab, onSwitch }: { tab: ShowTab; onSwitch: (next: ShowTab) => void }) {
    return (
        <div className='flex gap-1 mb-6 border-b border-[rgba(255,255,255,0.08)] pb-2'>
            {(['overview', 'storyboard'] as const).map((t) => (
                <button
                    key={t}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors capitalize ${tab === t ? 'bg-[rgba(140,124,246,0.14)] text-[var(--cr-montage-violet)]' : 'text-[var(--cr-montage-dim)] hover:text-[var(--cr-montage-ink)]'}`}
                    onClick={() => onSwitch(t)}>
                    {t}
                </button>
            ))}
        </div>
    );
}
