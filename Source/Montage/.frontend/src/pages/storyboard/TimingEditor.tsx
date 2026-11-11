// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@cratis/components/Common';
import { SaveSceneTiming } from '../../../Api/Shows/Timing/SaveSceneTiming';
import { PAD, Rect, TimedWord, dotY, drawPlayhead, drawRuler, drawSelectRect, drawWaveform, drawWord, isPositionMessage, moveWord, shiftGroup, syncAudioTo, wordsInRect } from './timingCanvas';

/**
 * The timing editor: the scene's own recording as a waveform, its words as draggable dots on a
 * horizontal time axis, and a karaoke playhead - press play and watch which dots light up; drag
 * any word that lands off its beat. Saving writes the words back into the lyrics data (and the
 * packaged copy the preview reads), so the motion follows the edit without a re-run.
 */
export function TimingEditor({ showId, sceneNumber, offset, duration, takeFile, registerPreviewRef }: {
    showId: string;
    sceneNumber: number;
    offset: number;
    duration: number;
    takeFile?: string;
    registerPreviewRef?: (ref: React.RefObject<HTMLIFrameElement | null>) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const previewRef = useRef<HTMLIFrameElement | null>(null);
    const dragRef = useRef<number | null>(null);
    const scrubRef = useRef(false);
    const downRef = useRef<{ x: number; y: number; time: number; hit: number } | null>(null);
    const groupAnchorRef = useRef<number | null>(null);
    const selectRectRef = useRef<Rect | null>(null);
    const lastSentRef = useRef(0);
    const [words, setWords] = useState<TimedWord[]>([]);
    const [baseline, setBaseline] = useState<TimedWord[]>([]);
    const [peaks, setPeaks] = useState<number[]>([]);
    const [hover, setHover] = useState<number | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [selectRect, setSelectRect] = useState<Rect | null>(null);
    const [playing, setPlaying] = useState(false);
    const [playhead, setPlayhead] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [command, setValues] = SaveSceneTiming.use();

    // the page pauses this preview when the timing tab is hidden
    useEffect(() => { registerPreviewRef?.(previewRef); }, [registerPreviewRef]);

    // two-way sync: when the preview's own HUD scrubs, our playhead follows. Reports never
    // touch our playing state - our timeline is the clock while it plays (the preview is
    // parked after a seek and would otherwise report playing:false and freeze playback).
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.source !== previewRef.current?.contentWindow || !isPositionMessage(e.data)) return;
            if (playing || scrubRef.current) return;
            const local = Math.min(duration, Math.max(0, (Number(e.data.t) || 0) - offset));
            setPlayhead(local);
            syncAudioTo(audioRef.current, takeFile ? local : offset + local);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [duration, offset, takeFile, playing]);

    // leaving the dialog entirely must not leave the voice talking
    useEffect(() => () => { audioRef.current?.pause(); }, []);

    // the words the engine actually uses - from the packaged lyrics data, scene-local
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/packages/${showId}/package/data/lyrics.json`);
                if (!res.ok) return;
                const doc = await res.json();
                const flat = (doc.lines ?? [])
                    .filter((l: any) => l.scene_id === `scene-${sceneNumber}`)
                    .flatMap((l: any) => l.words ?? [])
                    .map((w: any) => ({
                        word: String(w.w ?? w.word ?? ''),
                        start: Math.min(duration, Math.max(0, (Number(w.start) || 0) - offset)),
                        end: Math.min(duration, Math.max(0.05, (Number(w.end) || 0) - offset)),
                        orig: Math.min(duration, Math.max(0.05, (Number(w.end) || 0) - offset)),
                    }))
                    .sort((a: any, b: any) => a.start - b.start);
                if (cancelled || flat.length === 0) return;
                setWords(flat);
                setBaseline(flat.map((w: any) => ({ ...w })));
            } catch { /* the show hasn't been packaged yet */ }
        })();
        return () => { cancelled = true; };
    }, [showId, sceneNumber, offset, duration]);

    // the recording as peaks - the take when there is one, else the scene's slice of the mix
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const url = takeFile ? `/packages/${showId}/${takeFile}` : `/packages/${showId}/voiceover.wav`;
                const res = await fetch(url);
                if (!res.ok) return;
                const buf = await res.arrayBuffer();
                const Ctx = window.AudioContext;
                const ctx = new Ctx();
                const audio = await ctx.decodeAudioData(buf);
                const skip = takeFile ? 0 : offset;
                const from = Math.floor(skip * audio.sampleRate);
                const to = Math.min(audio.length, Math.floor((skip + duration) * audio.sampleRate));
                const channel = audio.getChannelData(0);
                const buckets = 500;
                const size = Math.max(1, Math.floor((to - from) / buckets));
                const next: number[] = [];
                for (let b = 0; b < buckets; b++) {
                    let peak = 0;
                    for (let i = from + b * size; i < Math.min(from + (b + 1) * size, to); i += 16) peak = Math.max(peak, Math.abs(channel[i] || 0));
                    next.push(peak);
                }
                void ctx.close();
                if (!cancelled) setPeaks(next);
            } catch { /* no waveform - the dots still work */ }
        })();
        return () => { cancelled = true; };
    }, [showId, takeFile, offset, duration]);

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        const W = canvas.width = (parent?.clientWidth ?? 800) * 2;
        const H = canvas.height = 170 * 2;
        const c = canvas.getContext('2d');
        if (!c) return;
        c.scale(2, 2);
        const w = W / 2, h = H / 2;
        const x = (t: number) => PAD + (Math.min(t, duration) / Math.max(duration, 0.001)) * (w - PAD * 2);
        c.clearRect(0, 0, w, h);

        drawRuler(c, x, duration);
        drawWaveform(c, peaks, w);
        // words: a dot per word, staggered vertically so neighbours stay readable
        words.forEach((word, i) => {
            const state = {
                active: playhead >= word.start && playhead < word.end,
                past: playhead >= word.end,
                hot: hover === i || dragRef.current === i,
                selected: selected.includes(i),
            };
            drawWord(c, { word, at: { x: x(word.start), y: dotY(i) }, state, canvasWidth: w });
        });
        if (selectRect) drawSelectRect(c, selectRect);
        // playhead - always visible, grab it to scrub
        drawPlayhead(c, x(playhead), h, scrubRef.current);
    };

    useEffect(draw);

    // playback: the scene's own take, scene-local - the karaoke shows the drift live,
    // and the visuals below follow the playhead so eye and ear agree
    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        const tick = () => {
            const t = audioRef.current?.currentTime ?? 0;
            setPlayhead(t);
            if (Math.abs(t - lastSentRef.current) > 0.08) {
                lastSentRef.current = t;
                previewRef.current?.contentWindow?.postMessage({ montage: 'seek', t: offset + t }, '*');
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [playing, offset]);

    const scrubTo = (t: number) => {
        const clamped = Math.min(duration, Math.max(0, t));
        setPlayhead(clamped);
        if (audioRef.current) audioRef.current.currentTime = takeFile ? clamped : offset + clamped;
        previewRef.current?.contentWindow?.postMessage({ montage: 'seek', t: offset + clamped }, '*');
        draw();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === ' ') {
            e.preventDefault();
            play();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            scrubTo(Math.min(duration, playhead + duration * 0.1));
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            scrubTo(Math.max(0, playhead - duration * 0.1));
        }
    };

    const toTime = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pad = 14;
        return Math.min(duration, Math.max(0, ((e.clientX - rect.left - pad) / (rect.width - pad * 2)) * duration));
    };
    const toClientX = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientX - rect.left;
    };
    const hitWord = (t: number) => {
        let best = -1, bestDist = 12 / (canvasRef.current?.parentElement?.clientWidth ?? 800) * duration;
        words.forEach((word, i) => {
            const d = Math.abs(word.start - t);
            if (d < bestDist) { best = i; bestDist = d; }
        });
        return best;
    };

    const grabPlayhead = (e: React.PointerEvent<HTMLCanvasElement>, px: number, py: number, t: number) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const phx = PAD + (playhead / Math.max(duration, 0.001)) * (rect.width - PAD * 2);
        if (Math.abs(px - phx) >= 8 || py <= 26) return false;
        scrubRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubTo(t);
        return true;
    };

    const grabWord = (e: React.PointerEvent<HTMLCanvasElement>, hit: number, t: number) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = hit;
        if (selected.includes(hit) && selected.length > 1) {
            // the selection moves as one
            groupAnchorRef.current = t;
        } else {
            if (selected.length) setSelected([]);
            setHover(hit);
        }
    };

    // empty space: rubber-band select
    const startRubberBand = (e: React.PointerEvent<HTMLCanvasElement>, px: number, py: number) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = { x0: px, y0: py, x1: px, y1: py };
        selectRectRef.current = r;
        setSelectRect(r);
        setSelected([]);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const t = toTime(e);
        const hit = hitWord(t);
        downRef.current = { x: px, y: py, time: t, hit };
        // the playhead line wins if it is grabbed
        if (grabPlayhead(e, px, py, t)) return;
        if (hit >= 0) grabWord(e, hit, t);
        else startRubberBand(e, px, py);
        draw();
    };

    // rubber band: grow it, select every dot inside
    const growRubberBand = (e: React.PointerEvent<HTMLCanvasElement>, band: Rect) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const r = { ...band, x1: e.clientX - rect.left, y1: e.clientY - rect.top };
        selectRectRef.current = r;
        setSelectRect(r);
        const pxOf = (tt: number) => PAD + (Math.min(tt, duration) / Math.max(duration, 0.001)) * (rect.width - PAD * 2);
        setSelected(wordsInRect(words, r, pxOf));
    };

    // group drag: the whole selection shifts by the pointer's delta
    const dragGroup = (t: number) => {
        const delta = t - (groupAnchorRef.current ?? t);
        groupAnchorRef.current = t;
        setWords((prev) => shiftGroup(prev, selected, delta, duration));
        setDirty(true);
    };

    const dragWord = (i: number, t: number) => {
        setWords((prev) => moveWord(prev, i, t, duration));
        setDirty(true);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const t = toTime(e);
        // scrubbing the playhead: audio, playhead and the visuals below all follow
        if (scrubRef.current) { scrubTo(t); return; }

        if (selectRectRef.current) growRubberBand(e, selectRectRef.current);
        else if (dragRef.current !== null && groupAnchorRef.current !== null && selected.length > 1) dragGroup(t);
        else if (dragRef.current !== null) dragWord(dragRef.current, t);
        else {
            const hit = hitWord(t);
            if (hit === hover) return;
            setHover(hit);
        }
        draw();
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const down = downRef.current;
        downRef.current = null;
        scrubRef.current = false;
        groupAnchorRef.current = null;
        dragRef.current = null;
        if (selectRectRef.current) {
            selectRectRef.current = null;
            setSelectRect(null);
        }
        // a click without a drag jumps the playhead - to the word when a word was hit
        if (down) {
            const rect = e.currentTarget.getBoundingClientRect();
            const dist = Math.hypot(e.clientX - rect.left - down.x, e.clientY - rect.top - down.y);
            if (dist < 4) {
                const jump = down.hit >= 0 && words[down.hit] ? words[down.hit].start : down.time;
                scrubTo(jump);
            }
        }
        draw();
    };

    const audioElement = (url: string) => {
        if (!audioRef.current) {
            audioRef.current = new Audio(url);
            audioRef.current.onended = () => setPlaying(false);
        }
        return audioRef.current;
    };

    const pause = (audio: HTMLAudioElement) => {
        audio.pause();
        setPlaying(false);
        previewRef.current?.contentWindow?.postMessage('montage:pause', '*');
    };

    const play = () => {
        const url = takeFile ? `/packages/${showId}/${takeFile}` : `/packages/${showId}/voiceover.wav`;
        const audio = audioElement(url);
        if (playing) { pause(audio); return; }
        // play from where the scrubber is - only a finished clip starts over
        const startAt = playhead >= duration - 0.05 ? 0 : playhead;
        const absolute = new URL(url, location.href).href;
        if (audio.src !== absolute) audio.src = absolute;
        audio.currentTime = takeFile ? startAt : offset + startAt;
        setPlayhead(startAt);
        previewRef.current?.contentWindow?.postMessage({ montage: 'seek', t: offset + startAt }, '*');
        void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };

    const save = async () => {
        setError('');
        try {
            setValues({
                showId,
                sceneNumber,
                words: words.map((w) => ({ word: w.word, start: +(w.start + offset).toFixed(3), end: +(w.end + offset).toFixed(3) })),
            } as never);
            const result = await command.execute();
            if (result.isSuccess) {
                setBaseline(words.map((w) => ({ ...w })));
                setDirty(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
            } else {
                const problems = [...result.validationResults.map((v) => v.message), ...result.exceptionMessages].filter(Boolean);
                setError(problems.join('; ') || 'The timing could not be saved.');
            }
        } catch (err) {
            setError(String((err as Error)?.message ?? err));
        }
    };

    const reset = () => {
        setWords(baseline.map((w) => ({ ...w })));
        setSelected([]);
        setDirty(false);
    };

    return (
        <div className='flex flex-col gap-3'>
            <div className='flex items-center gap-2'>
                <button
                    className='w-9 h-9 rounded-full border border-[rgba(255,255,255,0.16)] grid place-items-center hover:border-[var(--cr-montage-violet)] text-sm'
                    title={playing ? 'Stop' : 'Play the recording — watch which words light up'}
                    onClick={play}>{playing ? '❙❙' : '▶'}</button>
                <span className='text-xs text-[var(--cr-montage-faint)] flex-1'>
                    Drag words onto the beats they belong to; drag on empty space to select several and
                    move them together; grab the violet playhead to scrub — the visuals below follow.
                </span>
                {dirty && (
                    <>
                        <Button label='Reset' severity='secondary' outlined onClick={reset} />
                        <Button label='Save timing' icon='pi pi-check' onClick={save} />
                    </>
                )}
                {saved && <span className='mono text-[11px] text-[var(--cr-montage-violet)]'>saved — the preview already uses it</span>}
            </div>
            <canvas
                ref={canvasRef}
                className='w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] touch-none select-none focus:outline-none focus:border-[rgba(140,124,246,0.5)]'
                style={{ height: 170 }}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => { if (dragRef.current === null && !scrubRef.current && !selectRectRef.current) setHover(null); }} />
            <iframe
                ref={previewRef}
                key={`${showId}-${sceneNumber}`}
                title={`scene ${sceneNumber} timing preview`}
                className='w-full aspect-video rounded-lg border border-[rgba(255,255,255,0.1)] bg-black'
                src={`/preview/index.html?pkg=/packages/${showId}/package&scene=scene-${sceneNumber}`}
                allow='autoplay' />
            {error && <p className='text-sm text-[#e5484d]'>{error}</p>}
            <div className='mono text-[11px] text-[var(--cr-montage-faint)] flex gap-4'>
                <span>{words.length} words</span>
                <span>scene window {offset.toFixed(2)}s → {(offset + duration).toFixed(2)}s</span>
                <span>{takeFile ? `take ${takeFile.split('/').pop()}` : 'mixed track'}</span>
            </div>
        </div>
    );
}
