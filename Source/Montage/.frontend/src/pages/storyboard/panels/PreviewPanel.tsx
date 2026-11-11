// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

export function PreviewPanel({ showId, sceneNumber, iframeRef }: { showId: string; sceneNumber: number; iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
    return (
        <>
                        <iframe
                            ref={iframeRef}
                            key={`${showId}-${sceneNumber}`}
                            title={`scene ${sceneNumber} preview`}
                            className='w-full aspect-video rounded-lg border border-[rgba(255,255,255,0.1)] bg-black'
                            src={`/preview/index.html?pkg=/packages/${showId}/package&scene=scene-${sceneNumber}`}
                            allow='autoplay' />
                        <p className='text-xs text-[var(--cr-montage-faint)]'>
                            The engine in the browser, playing this scene with its voiceover — the same
                            scene the renderer captures. Space plays/pauses; the HUD scrubs.
                        </p>
        </>
    );
}
