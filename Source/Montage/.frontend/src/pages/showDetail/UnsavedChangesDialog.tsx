// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


import { Button } from '@cratis/components/Common';

/** Asks whether leaving the storyboard should discard the unsaved scene edits or generate them. */
export function UnsavedChangesDialog({ onDismiss, onDiscard, onGenerate }: { onDismiss: () => void; onDiscard: () => void; onGenerate: () => void }) {
    return (
        <div
            className='fixed inset-0 z-50 grid place-items-center bg-[rgba(6,7,10,0.72)] p-6'
            onClick={onDismiss}>
            <div className='panel panel-accent w-full max-w-md p-6' onClick={(e) => e.stopPropagation()}>
                <h2 className='display text-lg font-bold mb-2'>Changes not recorded</h2>
                <p className='text-sm text-[var(--cr-montage-dim)] mb-5'>
                    Your scene changes aren't saved or spoken yet — leaving now discards them.
                    Generate to record the voice, re-time the scenes and render.
                </p>
                <div className='flex justify-end gap-2'>
                    <Button label='Discard changes' severity='secondary' outlined onClick={onDiscard} />
                    <Button label='Generate' icon='pi pi-sparkles' onClick={onGenerate} />
                </div>
            </div>
        </div>
    );
}
