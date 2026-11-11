// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { Field, ListField } from './fields';
import type { ReactNode } from 'react';
import { asString, asList, csv, fromCsvNumbers } from './model';

type Params = Record<string, unknown>;
type SetParam = (key: string, value: unknown) => void;

function renderDiagram(p: Params, set: SetParam) {
    return <p className='text-sm text-[var(--cr-montage-dim)]'>The Design tab edits boxes, animation beats and look & feel, or generates a new infographic proposal with AI.</p>;
}

function renderImage(p: Params, set: SetParam) {
    return <><Field label='Headline' value={asString(p.headline)} onChange={(v) => set('headline', v)} /><Field label='Caption' value={asString(p.text)} onChange={(v) => set('text', v)} /></>;
}

function renderTitle(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Kicker' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} placeholder='a short label above' />
            <Field label='Headline' value={asString(p.headline)} onChange={(v) => set('headline', v)} placeholder='2–8 words' />
            <Field label='Emphasis (word to colour)' value={asString(p.emphasis)} onChange={(v) => set('emphasis', v)} />
            <Field label='Sub line (optional)' value={asString(p.sub)} onChange={(v) => set('sub', v)} />
        </>
    );
}

function renderStatement(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Headline — the claim' value={asString(p.headline)} onChange={(v) => set('headline', v)} placeholder='max 12 words' />
            <Field label='Accent (phrase to colour)' value={asString(p.accent)} onChange={(v) => set('accent', v)} />
            <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
        </>
    );
}

function renderKinetic(p: Params, set: SetParam) {
    return (
        <ListField label='Emphasised words' value={p.emphasis} onChange={(v) => set('emphasis', v)} placeholder='words to colour' />
    );
}

function renderSteps(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
            <div className='md:col-span-2 flex flex-col gap-2'>
                <span className='eyebrow'>Steps</span>
                {asList(p.steps).map((step, i) => {
                    const item = step as Record<string, unknown>;
                    return (
                        <div key={i} className='flex gap-2'>
                            <input
                                className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent w-40'
                                placeholder='title'
                                value={asString(item.title)}
                                onChange={(e) => {
                                    const steps = [...asList(p.steps)];
                                    steps[i] = { ...item, title: e.target.value };
                                    set('steps', steps);
                                }} />
                            <input
                                className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent flex-1'
                                placeholder='one short line'
                                value={asString(item.text)}
                                onChange={(e) => {
                                    const steps = [...asList(p.steps)];
                                    steps[i] = { ...item, text: e.target.value };
                                    set('steps', steps);
                                }} />
                            <button className='text-[var(--cr-montage-faint)] hover:text-[#e5484d] px-1' onClick={() => set('steps', asList(p.steps).filter((_, j) => j !== i))}>✕</button>
                        </div>
                    );
                })}
                <button
                    className='mono text-[11px] text-[var(--cr-montage-faint)] hover:text-[var(--cr-montage-ink)] text-left'
                    onClick={() => set('steps', [...asList(p.steps), { title: '', text: '' }])}>
                    + step
                </button>
            </div>
        </>
    );
}

function renderCompare(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
            <Field label='Verdict (optional)' value={asString(p.verdict)} onChange={(v) => set('verdict', v)} />
            {(['left', 'right'] as const).map((side) => {
                const item = (p[side] ?? {}) as Record<string, unknown>;
                return (
                    <div key={side} className='md:col-span-2 panel p-3 flex flex-col gap-2'>
                        <span className='eyebrow'>{side === 'left' ? 'Left side (before)' : 'Right side (after)'}</span>
                        <Field label='Title' value={asString(item.title)} onChange={(v) => set(side, { ...item, title: v })} />
                        <ListField
                            label='Points'
                            value={item.points}
                            onChange={(points) => set(side, { ...item, points })}
                            placeholder='three short strings' />
                    </div>
                );
            })}
        </>
    );
}

function renderFlow(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Headline (optional)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
            <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
            <div className='md:col-span-2 flex flex-col gap-2'>
                <span className='eyebrow'>Nodes</span>
                {asList(p.nodes).map((node, i) => {
                    const item = node as Record<string, unknown>;
                    return (
                        <div key={i} className='flex gap-2'>
                            <input
                                className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent w-44'
                                placeholder='label (1–2 words)'
                                value={asString(item.label)}
                                onChange={(e) => {
                                    const nodes = [...asList(p.nodes)];
                                    nodes[i] = { ...item, label: e.target.value };
                                    set('nodes', nodes);
                                }} />
                            <input
                                className='panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent flex-1'
                                placeholder='sub (optional)'
                                value={asString(item.sub)}
                                onChange={(e) => {
                                    const nodes = [...asList(p.nodes)];
                                    nodes[i] = { ...item, sub: e.target.value };
                                    set('nodes', nodes);
                                }} />
                            <button className='text-[var(--cr-montage-faint)] hover:text-[#e5484d] px-1' onClick={() => set('nodes', asList(p.nodes).filter((_, j) => j !== i))}>✕</button>
                        </div>
                    );
                })}
                <button
                    className='mono text-[11px] text-[var(--cr-montage-faint)] hover:text-[var(--cr-montage-ink)] text-left'
                    onClick={() => set('nodes', [...asList(p.nodes), { label: '' }])}>
                    + node
                </button>
            </div>
        </>
    );
}

function renderMetric(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Value' value={asString(p.value)} onChange={(v) => set('value', Number(v) || 0)} />
            <label className='block'>
                <span className='eyebrow block mb-1.5'>Format</span>
                <select
                    className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                    value={asString(p.format) || 'number'}
                    onChange={(e) => set('format', e.target.value)}>
                    <option value='number'>number</option>
                    <option value='percent'>percent</option>
                    <option value='currency'>currency</option>
                    <option value='x'>x (multiplier)</option>
                </select>
            </label>
            <Field label='Label' value={asString(p.label)} onChange={(v) => set('label', v)} placeholder='one short line' />
            <Field label='Delta (optional)' value={asString(p.delta)} onChange={(v) => set('delta', v)} placeholder='+38%' />
            <div className='md:col-span-2'>
                <Field
                    label='Spark line (comma-separated numbers)'
                    mono
                    value={csv(p.spark)}
                    onChange={(v) => set('spark', fromCsvNumbers(v))}
                    placeholder='1, 2, 3, 5, 8' />
            </div>
        </>
    );
}

function renderChart(p: Params, set: SetParam) {
    return (
        <>
            <label className='block'>
                <span className='eyebrow block mb-1.5'>Chart type</span>
                <select
                    className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                    value={asString(p.type) || 'bar'}
                    onChange={(e) => set('type', e.target.value)}>
                    <option value='bar'>bar</option>
                    <option value='line'>line</option>
                </select>
            </label>
            <Field label='Title (optional)' value={asString(p.title)} onChange={(v) => set('title', v)} />
            <div className='md:col-span-2'>
                <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
            </div>
            <ListField label='Labels' value={p.labels} onChange={(labels) => set('labels', labels)} placeholder='before, after' />
            <Field
                label='Values (comma-separated numbers)'
                mono
                value={csv(p.values)}
                onChange={(v) => set('values', fromCsvNumbers(v))}
                placeholder='10, 2' />
        </>
    );
}

function renderQuote(p: Params, set: SetParam) {
    return (
        <>
            <div className='md:col-span-2'>
                <Field label='Quote (max 25 words)' value={asString(p.text)} onChange={(v) => set('text', v)} />
            </div>
            <Field label='Attribution' value={asString(p.attribution)} onChange={(v) => set('attribution', v)} />
        </>
    );
}

function renderCode(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Title (optional)' value={asString(p.title)} onChange={(v) => set('title', v)} />
            <Field label='Kicker (optional)' value={asString(p.kicker)} onChange={(v) => set('kicker', v)} />
            <label className='block'>
                <span className='eyebrow block mb-1.5'>Language</span>
                <select
                    className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent'
                    value={asString(p.language) || 'typescript'}
                    onChange={(e) => set('language', e.target.value)}>
                    <option value='typescript'>typescript</option>
                    <option value='csharp'>csharp</option>
                    <option value='json'>json</option>
                    <option value='sql'>sql</option>
                </select>
            </label>
            <div className='md:col-span-2'>
                <label className='block'>
                    <span className='eyebrow block mb-1.5'>Code (max 14 lines)</span>
                    <textarea
                        className='w-full panel px-3 py-2 text-sm outline-none focus:border-[var(--cr-montage-violet)] bg-transparent resize-y mono'
                        rows={5}
                        value={asString(p.code)}
                        onChange={(e) => set('code', e.target.value)} />
                </label>
            </div>
        </>
    );
}

function renderEndcard(p: Params, set: SetParam) {
    return (
        <>
            <Field label='Headline (3–7 words)' value={asString(p.headline)} onChange={(v) => set('headline', v)} />
            <Field label='Call to action (optional)' value={asString(p.cta)} onChange={(v) => set('cta', v)} />
        </>
    );
}

const RENDERERS: Record<string, (p: Params, set: SetParam) => ReactNode> = {
    diagram: renderDiagram,
    image: renderImage,
    title: renderTitle,
    statement: renderStatement,
    kinetic: renderKinetic,
    steps: renderSteps,
    compare: renderCompare,
    flow: renderFlow,
    metric: renderMetric,
    chart: renderChart,
    quote: renderQuote,
    code: renderCode,
    endcard: renderEndcard,
};

/** The type-specific visual parameters, one structured control each - never raw JSON. */
export function ParamsEditor({ scene, onParam }: { scene: { type: string; params: Params }; onParam: SetParam }) {
    const render = RENDERERS[scene.type];
    if (!render) {
        return <div className='text-xs text-[var(--cr-montage-faint)] md:col-span-2'>Unknown scene type — parameters are kept as they are.</div>;
    }
    return <>{render(scene.params, onParam)}</>;
}
