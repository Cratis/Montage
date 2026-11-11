// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { SceneMeta } from '../model';
import { TimingEditor } from '../TimingEditor';

export function TimingPanel({ meta, showId, sceneNumber, timingPreviewHolder }: { meta?: SceneMeta; showId: string; sceneNumber: number; timingPreviewHolder: React.RefObject<React.RefObject<HTMLIFrameElement | null> | null> }) {
    return (
        <>
                    {meta ? (
                        <TimingEditor
                            showId={showId}
                            sceneNumber={sceneNumber}
                            offset={meta.offset}
                            duration={meta.duration}
                            takeFile={meta.file}
                            registerPreviewRef={(ref) => { timingPreviewHolder.current = ref; }} />
                    ) : (
                        <div className='flex flex-col gap-2'>
                            <p className='text-[var(--cr-montage-dim)]'>
                                The show hasn't spoken yet — save & render to get this scene's recording and timing.
                            </p>
                            <p className='text-xs text-[var(--cr-montage-faint)]'>
                                Once it has, this tab becomes a timeline: the recording as a waveform, each
                                word a dot you can drag onto the beat it belongs to.
                            </p>
                        </div>
                    )}
        </>
    );
}
