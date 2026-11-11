// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


import { JobActivity } from '../../../Api/Shows/Production';
import { JobRow } from '../JobRow';

/** What the page shows before the show itself has arrived. */
export function ProductionActivity({ showJobs, connecting }: { showJobs: JobActivity[]; connecting: boolean }) {
    return (
        <div className='min-h-screen grid place-items-center px-8'>
            <div className='w-full max-w-2xl flex flex-col gap-3'>
                <div className='eyebrow mb-1'>production activity</div>
                {showJobs.length === 0 && (
                    <div className='panel p-6 text-center text-sm text-[var(--cr-montage-dim)]'>
                        {connecting ? 'Connecting…' : 'No production activity yet.'}
                    </div>
                )}
                {showJobs.map((job) => <JobRow key={job.jobId.toString()} job={job} />)}
            </div>
        </div>
    );
}
