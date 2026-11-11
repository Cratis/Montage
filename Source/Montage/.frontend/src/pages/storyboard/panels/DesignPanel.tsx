// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { Show } from '../../../../Api/Shows/Listing';
import { DiagramDesigner } from '../../DiagramDesigner';
import { Scene } from '../model';

export function DesignPanel({ scene, show, sceneNumber, iframeRef, onChange }: { scene: Scene; show: Show; sceneNumber: number; iframeRef: React.RefObject<HTMLIFrameElement | null>; onChange: (patch: Partial<Scene>) => void }) {
    return (
        <>
                    {scene.type === 'diagram' ? (
                        <>
                        <button className='chip px-3 py-2 self-start text-sm' onClick={() => {
                            const bridge = (iframeRef.current?.contentWindow as unknown as { __montage?: { svg: (id: string) => string | null } })?.__montage;
                            const svg = bridge?.svg(`scene-${sceneNumber}`);
                            if (!svg) return;
                            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
                            const link = document.createElement('a'); link.href = url; link.download = `scene-${sceneNumber}.svg`; link.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}>Download packaged SVG (save edits first)</button>
                        <DiagramDesigner params={scene.params} spoken={scene.spoken} defaultProvider={show.AIProviderId}
                            onApply={(params) => onChange({ params })} />
                        </>
                    ) : (
                        <p className='text-sm text-[var(--cr-montage-dim)]'>Choose the Infographic scene type to design an editable relationship diagram with SVG outlines, routed arrows and per-box animation. Image motion is configured in Visuals.</p>
                    )}
        </>
    );
}
