// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useRef, useState } from 'react';
import { Show } from '../../../Api/Shows/Listing';
import { JobActivity } from '../../../Api/Shows/Production';
import { ParamsEditor } from './ParamsEditor';
import { MOTION_PRESETS, Scene, SceneImage, SceneMeta, TABS, TYPES, pad2 } from './model';
import { DesignPanel } from './panels/DesignPanel';
import { MotionPanel } from './panels/MotionPanel';
import { NarrationPanel } from './panels/NarrationPanel';
import { PacingPanel } from './panels/PacingPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { TimingPanel } from './panels/TimingPanel';
import { VisualsPanel } from './panels/VisualsPanel';

/**
 * The scene inspector: the engine playing the scene with its voice, and every property the
 * scene has - content parameters, narration, motion preset and description, recorded timing.
 */
export function SceneInspector({
    show, index, scene, meta, jobs, onChange, onParam, onProduce, onClose,
}: {
    show: Show;
    index: number;
    scene: Scene;
    meta?: SceneMeta;
    jobs: JobActivity[];
    onChange: (patch: Partial<Scene>) => void;
    onParam: (key: string, value: unknown) => void;
    onProduce: () => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<(typeof TABS)[number]['id']>('preview');
    const motionRaw = scene.params.motion as { preset?: string; duration?: number; describe?: string } | undefined;
    const pacingRaw = scene.params.pacing as { leadIn?: number; hold?: number } | undefined;
    const imagesRaw = scene.params.images as SceneImage[] | undefined;
    const presets = MOTION_PRESETS[scene.type] ?? [];
    const showId = show.id.toString();
    const sceneNumber = index + 1;
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const timingPreviewHolder = useRef<React.RefObject<HTMLIFrameElement | null> | null>(null);

    // switching tabs never resizes the dialog: every panel is stacked in the same grid
    // cell, so the dialog is sized by the tallest tab; hidden panels keep that size
    const panelStyle = (id: (typeof TABS)[number]['id']): React.CSSProperties => ({
        gridArea: '1 / 1',
        visibility: tab === id ? 'visible' : 'hidden',
        pointerEvents: tab === id ? 'auto' : 'none',
    });

    const switchTab = (id: (typeof TABS)[number]['id']) => {
        // leaving a tab with a live preview pauses it - a hidden iframe would keep playing
        if (tab === 'preview' && id !== 'preview') iframeRef.current?.contentWindow?.postMessage('montage:pause', '*');
        if (tab === 'timing' && id !== 'timing') timingPreviewHolder.current?.current?.contentWindow?.postMessage('montage:pause', '*');
        setTab(id);
    };

    return (
        <div className='fixed inset-0 z-40 grid place-items-center bg-[rgba(6,7,10,0.72)] p-6' onClick={onClose}>
            <div
                className='panel panel-accent w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6'
                onClick={(e) => e.stopPropagation()}>
                <div className='flex items-center gap-3 mb-4'>
                    <span className='mono text-xs text-[var(--cr-montage-faint)]'>{pad2(sceneNumber)}</span>
                    <h2 className='display text-xl font-bold'>{TYPES.find((t) => t.value === scene.type)?.label ?? scene.type}</h2>
                    <span className='mono text-[11px] text-[var(--cr-montage-faint)]'>{meta ? `${meta.offset.toFixed(1)}s · ${meta.duration.toFixed(1)}s` : 'not spoken yet'}</span>
                    <button className='ml-auto w-8 h-8 grid place-items-center hover:text-[var(--cr-montage-ink)] text-[var(--cr-montage-faint)]' onClick={onClose}>✕</button>
                </div>

                <div className='flex gap-1 mb-5 border-b border-[rgba(255,255,255,0.08)] pb-2'>
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${tab === t.id ? 'bg-[rgba(140,124,246,0.14)] text-[var(--cr-montage-violet)]' : 'text-[var(--cr-montage-dim)] hover:text-[var(--cr-montage-ink)]'}`}
                            onClick={() => switchTab(t.id)}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* every panel stacked in one grid cell: the dialog is sized by the tallest
                    tab and switching never resizes it; hidden panels keep that size */}
                <div className='grid items-start'>
                    <div className='flex flex-col gap-3' style={panelStyle('preview')}>
                        <PreviewPanel showId={showId} sceneNumber={sceneNumber} iframeRef={iframeRef} />
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3' style={panelStyle('content')}>
                        <ParamsEditor scene={{ type: scene.type, params: scene.params }} onParam={onParam} />
                    </div>

                    <div className='flex flex-col gap-3' style={panelStyle('visuals')}>
                        <VisualsPanel show={show} imagesRaw={imagesRaw} onParam={onParam} />
                    </div>

                    <div className='flex flex-col gap-3' style={panelStyle('narration')}>
                        <NarrationPanel scene={scene} meta={meta} jobs={jobs} showId={showId} sceneNumber={sceneNumber} onChange={onChange} onProduce={onProduce} />
                    </div>

                    <div className='flex flex-col gap-4' style={panelStyle('motion')}>
                        <MotionPanel scene={scene} presets={presets} motionRaw={motionRaw} onParam={onParam} />
                    </div>

                    <div className='flex flex-col gap-3' style={panelStyle('design')}>
                        <DesignPanel scene={scene} show={show} sceneNumber={sceneNumber} iframeRef={iframeRef} onChange={onChange} />
                    </div>

                    <div className='flex flex-col gap-3' style={panelStyle('pacing')}>
                        <PacingPanel pacingRaw={pacingRaw} onParam={onParam} />
                    </div>

                    <div className='flex flex-col gap-2 text-sm' style={panelStyle('timing')}>
                        <TimingPanel meta={meta} showId={showId} sceneNumber={sceneNumber} timingPreviewHolder={timingPreviewHolder} />
                    </div>
                </div>
            </div>
        </div>
    );
}
