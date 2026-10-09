// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useRef, useState } from 'react';
import { AllAIProviders } from '@cratis/ai';

type Node = { id: string; label: string; x: number; y: number; width?: number; height?: number; at?: number; duration?: number; effect?: string };
type Edge = { from: string; to: string; at?: number; duration?: number; points?: number[][] };
type Template = { name: string; design?: Record<string, unknown>; template?: string; effect?: string; stagger?: number; describe?: string };
const control = 'panel px-3 py-2 text-sm bg-transparent outline-none focus:border-[var(--cr-montage-violet)]';

/** Semantic infographic editing, reference-guided model drafts and reusable style templates. */
export function DiagramDesigner({ params, spoken, defaultProvider, onApply }: {
    params: Record<string, unknown>; spoken: string; defaultProvider?: string;
    onApply: (params: Record<string, unknown>) => void;
}) {
    const [providers] = AllAIProviders.use();
    const [provider, setProvider] = useState(defaultProvider ?? '');
    const [direction, setDirection] = useState(String(params.describe ?? ''));
    const [refs, setRefs] = useState<string[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [auto, setAuto] = useState(true);
    const latest = useRef(params);
    latest.current = params;
    const seen = useRef(JSON.stringify({ params, spoken }));
    const request = useRef<AbortController | null>(null);
    const chosen = provider || providers.data[0]?.id?.toString() || '';
    const nodes = (params.nodes ?? []) as Node[];
    const edges = (params.edges ?? []) as Edge[];
    const loadTemplates = () => fetch('/api/montage/design/templates').then(r => r.json()).then(setTemplates).catch(() => setError('Could not load templates.'));
    useEffect(() => { void loadTemplates(); return () => request.current?.abort(); }, []);

    const generate = async () => {
        request.current?.abort();
        const abort = new AbortController(); request.current = abort;
        const snapshot = JSON.stringify(latest.current);
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/montage/design/draft', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
                body: JSON.stringify({ providerId: chosen, prompt: `${direction}\nNarration: ${spoken}`, current: latest.current, references: refs }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.detail ?? body.error ?? 'Design generation failed');
            if (snapshot !== JSON.stringify(latest.current)) throw new Error('The slide changed while the model was designing. Generate again for the current version.');
            setProposal(body as Record<string, unknown>);
        } catch (e) {
            if (!abort.signal.aborted) setError(String((e as Error).message));
        } finally { if (request.current === abort) setBusy(false); }
    };
    useEffect(() => {
        const value = JSON.stringify({ params, spoken });
        if (seen.current === value) return;
        seen.current = value;
        request.current?.abort();setBusy(false);setProposal(null);
        if (!auto || !chosen || !Array.isArray(params.nodes)) return;
        const timer = setTimeout(() => { void generate(); }, 1400);
        return () => clearTimeout(timer);
        // A saved model result is acknowledged before applying it, preventing recursive redesign.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params, spoken, auto, chosen]);

    const apply = (value: Record<string, unknown>, generated = false) => {
        if (generated) seen.current = JSON.stringify({ params: value, spoken });
        onApply(value); setProposal(null);
    };
    const addReferences = async (files: File[]) => {
        for (const file of files.slice(0, 3)) {
            if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 4_000_000) { setError('Use PNG, JPEG, WebP or GIF references under 4 MB.'); continue; }
            const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file); });
            setRefs(previous => [...previous, data].slice(-3));
        }
    };
    return <div className='flex flex-col gap-3 text-sm' onPaste={e => {
        const files = Array.from(e.clipboardData.files);if (files.length) {e.preventDefault();void addReferences(files);}
    }}>
        <p className='text-[var(--cr-montage-dim)]'>An editable SVG infographic: boxes, labels and connectors with their own draw beats. AI drafts are reviewed before they replace your slide. Save refreshes the packaged motion.</p>
        <div className='flex flex-wrap gap-2'>
            <select className={control} value={String(params.template ?? 'cratis')} onChange={e => apply({...params,template:e.target.value,design:undefined})}>
                <option value='cratis'>Cratis diagram</option><option value='blueprint'>Blueprint / drafting pen</option><option value='editorial'>Editorial / paper</option>
            </select>
            <select className={control} value={String(params.effect ?? 'draw')} onChange={e => apply({...params,effect:e.target.value})}>
                {['draw','pen','wipe','pop','slide','fade'].map(v => <option key={v}>{v}</option>)}
            </select>
            <select className={control} defaultValue='' onChange={e => {const t=templates[Number(e.target.value)];if(t)apply({...params,...t});}}>
                <option value='' disabled>Saved look & feel…</option>{templates.map((t,i)=><option key={i} value={i}>{t.name}</option>)}
            </select>
        </div>
        <div className='flex gap-2'>
            <input className={`${control} flex-1`} value={String(params.headline ?? '')} placeholder='Infographic headline' onChange={e => onApply({...params,headline:e.target.value})}/>
            <label className='flex items-center gap-2'>Stagger <input className={`${control} w-20`} type='number' min={0} step={0.1} value={Number(params.stagger ?? 0.42)} onChange={e => onApply({...params,stagger:Number(e.target.value)})}/></label>
        </div>
        <div className='max-h-64 overflow-auto flex flex-col gap-2'>
            {nodes.map((node,i) => <div className='flex gap-2 items-center' key={node.id}>
                <span className='mono w-24 truncate text-xs text-[var(--cr-montage-dim)]'>{node.id}</span>
                <input className={`${control} flex-1 min-w-0`} value={node.label} onChange={e => {const next=[...nodes];next[i]={...node,label:e.target.value};onApply({...params,nodes:next});}}/>
                <label className='text-xs'>at <input className={`${control} w-20`} type='number' min={0} step={0.1} value={node.at ?? 0} onChange={e => {const next=[...nodes];next[i]={...node,at:Number(e.target.value)};onApply({...params,nodes:next});}}/></label>
                <select className={control} value={node.effect ?? ''} onChange={e=>{const next=[...nodes];next[i]={...node,effect:e.target.value||undefined};onApply({...params,nodes:next});}}>
                    <option value=''>inherit</option>{['draw','pen','wipe','pop','slide','fade'].map(v=><option key={v}>{v}</option>)}
                </select>
            </div>)}
        </div>
        <button className='chip px-3 py-2 self-start' onClick={() => onApply({ ...params, nodes: [...nodes, { id: `box-${crypto.randomUUID().slice(0,8)}`, label: 'New box', x: 64, y: 180, width: 300, height: 120, at: 0.5 + nodes.length * 0.5 }] })}>+ Box</button>
        <details className='panel p-3'>
            <summary className='cursor-pointer'>Layout & connectors · 1600 × 900 SVG coordinates</summary>
            <div className='max-h-64 overflow-auto flex flex-col gap-2 mt-3'>
                {nodes.map((node,i) => <div key={node.id} className='flex flex-wrap gap-2 items-center'>
                    <span className='mono text-xs w-24 truncate'>{node.id}</span>
                    {(['x','y','width','height'] as const).map(key => <label key={key} className='text-xs'>{key} <input className={`${control} w-20`} type='number' value={node[key] ?? (key==='width'?260:key==='height'?120:0)} onChange={e => {const next=[...nodes];next[i]={...node,[key]:Number(e.target.value)};onApply({...params,nodes:next});}}/></label>)}
                    <button className='chip px-2 py-1' onClick={()=>onApply({...params,nodes:nodes.filter((_,j)=>j!==i),edges:edges.filter(e=>e.from!==node.id&&e.to!==node.id)})}>remove</button>
                </div>)}
                {edges.map((edge,i) => <div key={i} className='flex gap-2 items-center'>
                    {(['from','to'] as const).map(key => <select key={key} className={control} value={edge[key]} onChange={e=>{const next=[...edges];next[i]={...edge,[key]:e.target.value};onApply({...params,edges:next});}}>{nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select>)}
                    <label className='text-xs'>at <input className={`${control} w-20`} type='number' min={0} step={0.1} value={edge.at ?? ''} placeholder='auto' onChange={e=>{const next=[...edges];next[i]={...edge,at:e.target.value===''?undefined:Number(e.target.value)};onApply({...params,edges:next});}}/></label>
                    <button className='chip px-2 py-1' onClick={()=>onApply({...params,edges:edges.filter((_,j)=>j!==i)})}>remove</button>
                </div>)}
                <button className='chip px-3 py-2 self-start' disabled={nodes.length<2} onClick={()=>onApply({...params,edges:[...edges,{from:nodes[0]!.id,to:nodes[1]!.id}]})}>+ Connector</button>
            </div>
        </details>
        <textarea rows={3} className={control} placeholder='Describe the layout, look and motion. For example: recreate the reference as three parallel rows; trace outlines left to right, then fill each box and reveal the label.' value={direction} onChange={e=>setDirection(e.target.value)}/>
        <div className='flex gap-2 items-center flex-wrap'>
            <select className={control} value={chosen} onChange={e=>setProvider(e.target.value)}><option value=''>Choose AI provider</option>{providers.data.map(p=><option key={p.id.toString()} value={p.id.toString()}>{p.name}</option>)}</select>
            <button className='chip px-3 py-2' disabled={busy||!chosen} onClick={()=>void generate()}>{busy?'Designing…':'Generate motion & look with AI'}</button>
            <label className='flex gap-2 items-center'><input type='checkbox' checked={auto} onChange={e=>setAuto(e.target.checked)}/>AI draft after infographic edits</label>
            <label className='chip px-3 py-2 cursor-pointer'>+ Reference images<input className='hidden' type='file' accept='image/png,image/jpeg,image/webp,image/gif' multiple onChange={e=>void addReferences(Array.from(e.target.files??[]))}/></label>
        </div>
        <p className='text-xs text-[var(--cr-montage-faint)]'>Paste an image here to guide the design. The provider must support image input. GIFs are visual references, not analysed motion timelines. Nothing generates on opening this tab.</p>
        {refs.length>0&&<div className='flex gap-2'>{refs.map((src,i)=><button key={i} title='Remove reference' onClick={()=>setRefs(refs.filter((_,j)=>j!==i))}><img src={src} className='h-20 w-32 object-contain rounded'/></button>)}</div>}
        {error&&<p role='alert' className='text-[#e5484d]'>{error}</p>}
        {proposal&&<div className='panel p-3 flex flex-col gap-2'>
            <strong>AI proposal · {((proposal.nodes??[]) as unknown[]).length} boxes</strong>
            <p>{String(proposal.describe??'')}</p>
            <div className='flex gap-2'><button className='chip px-3 py-2' onClick={()=>apply({...params,...proposal},true)}>Apply proposal</button><button className='chip px-3 py-2' onClick={()=>setProposal(null)}>Discard</button></div>
        </div>}
        <div className='flex gap-2'>
            <input className={`${control} flex-1`} placeholder='Name this reusable look & feel' value={templateName} onChange={e=>setTemplateName(e.target.value)}/>
            <button className='chip px-3 py-2' disabled={!templateName.trim()} onClick={async()=>{
                try {
                    const source=proposal??params;
                    const response=await fetch('/api/montage/design/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:templateName,design:source.design,template:source.template,effect:source.effect,stagger:source.stagger,describe:direction})});
                    if(!response.ok)throw new Error('Could not save the design template');setTemplateName('');await loadTemplates();
                }catch(e){setError((e as Error).message);}
            }}>Save template</button>
        </div>
    </div>;
}
