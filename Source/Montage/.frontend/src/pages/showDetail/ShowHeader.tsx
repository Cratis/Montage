// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


import { Button } from '@cratis/components/Common';
import { Show } from '../../../Api/Shows/Listing';
import { StatusBadge } from './StatusBadge';

/** The show's title block with the Save and Save & render buttons. */
export function ShowHeader({ show, title, busy, onSave }: { show: Show; title: string; busy: boolean; onSave: (produce: boolean) => void }) {
    return (
        <header className='flex items-start justify-between gap-6 mb-6'>
            <div className='min-w-0'>
                <div className='eyebrow mb-2'>{show.status === 'Failed' ? `failed at ${show.stage}` : 'show'}</div>
                <h1 className='display text-3xl font-bold truncate'>{title}</h1>
                <p className='text-sm text-[var(--cr-montage-dim)] mt-2 max-w-prose'>{show.description}</p>
            </div>
            <div className='flex items-center gap-3 flex-shrink-0 pt-1'>
                <StatusBadge status={show.status} />
                <Button label='Save' icon='pi pi-save' severity='secondary' outlined loading={busy} onClick={() => onSave(false)} />
                <Button label='Save & render' icon='pi pi-sparkles' loading={busy} onClick={() => onSave(true)} />
            </div>
        </header>
    );
}
