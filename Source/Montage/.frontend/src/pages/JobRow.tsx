// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import type { JobActivity } from '../../Api/Shows/Production';

const jobStatusColor = (job: JobActivity) =>
    job.error ? '#e5484d' : job.isRunning ? 'var(--cr-montage-amber)' : 'var(--cr-montage-violet)';

/**
 * One durable job in the production pipeline: what it is, whether it is running, and why it
 * failed when it did. These are Orleans jobs - they survive a restart - so the view is history,
 * not just the live tick.
 */
export function JobRow({ job }: { job: JobActivity }) {
    const color = jobStatusColor(job);
    const started = new Date(job.created);
    return (
        <div className='panel px-3.5 py-2.5 flex items-center gap-3'>
            <span
                className={`stage-dot flex-shrink-0 ${job.isRunning ? 'active pulsing' : job.error ? 'failed' : 'done'}`}
                style={job.error && !job.isRunning ? { background: '#e5484d', boxShadow: 'none' } : undefined} />
            <div className='min-w-0 flex-1'>
                <div className='text-sm truncate'>{job.details}</div>
                <div className='mono text-[11px] text-[var(--cr-montage-faint)]'>
                    {job.type.replace(/^Montage\.Shows\.[a-z]+\./, '').replace(/Job$/, '')} · {started.toLocaleTimeString()}
                    {job.error && <span className='text-[#e5484d]'> — {job.error}</span>}
                </div>
            </div>
            <span
                className='mono text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap'
                style={{ color, borderColor: color, background: 'rgba(255,255,255,0.03)' }}>
                {job.isRunning ? 'running' : job.error ? 'failed' : (job.status || '').toLowerCase()}
            </span>
        </div>
    );
}
