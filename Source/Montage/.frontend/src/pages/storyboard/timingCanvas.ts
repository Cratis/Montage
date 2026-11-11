// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

export interface TimedWord { word: string; start: number; end: number; orig: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export type TimeToX = (t: number) => number;

export const PAD = 14;
export const WAVE_TOP = 88;
export const WAVE_BOTTOM = 148;
export const dotY = (i: number) => 58 + (i % 2) * 9;

export function drawRuler(c: CanvasRenderingContext2D, x: TimeToX, duration: number) {
    c.font = '9px "JetBrains Mono", monospace';
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let s = 0; s <= duration; s += 0.5) {
        const px = x(s);
        c.beginPath();
        c.moveTo(px, 26); c.lineTo(px, 34);
        c.stroke();
        if (Math.abs(s % 1) < 0.01) c.fillText(`${Math.round(s)}s`, px - 4, 20);
    }
}

export function drawWaveform(c: CanvasRenderingContext2D, peaks: number[], w: number) {
    const mid = (WAVE_TOP + WAVE_BOTTOM) / 2;
    if (peaks.length === 0) {
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(PAD, mid, w - PAD * 2, 1);
        return;
    }
    c.fillStyle = 'rgba(140,124,246,0.34)';
    const bw = (w - PAD * 2) / peaks.length;
    peaks.forEach((peak, i) => {
        const amp = Math.max(1, peak * (WAVE_BOTTOM - WAVE_TOP) / 2);
        c.fillRect(PAD + i * bw, mid - amp, Math.max(1, bw - 0.5), amp * 2);
    });
}

export interface Point { x: number; y: number }
export interface WordState { active: boolean; past: boolean; hot: boolean; selected: boolean }
export interface WordDraw { word: TimedWord; at: Point; state: WordState; canvasWidth: number }

function dotFill({ active, past, hot }: WordState) {
    if (hot || active) return '#8c7cf6';
    return past ? 'rgba(240,238,230,0.75)' : 'rgba(240,238,230,0.35)';
}

export function drawWord(c: CanvasRenderingContext2D, { word, at, state, canvasWidth }: WordDraw) {
    const emphasized = state.hot || state.active || state.selected;
    if (state.selected) {
        c.strokeStyle = 'rgba(140,124,246,0.85)';
        c.beginPath();
        c.arc(at.x, at.y, 6.5, 0, Math.PI * 2);
        c.stroke();
    }
    c.beginPath();
    c.arc(at.x, at.y, state.hot ? 5.5 : 4, 0, Math.PI * 2);
    c.fillStyle = dotFill(state);
    c.fill();
    // stem down to the waveform - where the word sits in the recording
    c.strokeStyle = emphasized ? 'rgba(140,124,246,0.5)' : 'rgba(255,255,255,0.12)';
    c.beginPath();
    c.moveTo(at.x, at.y + 6); c.lineTo(at.x, WAVE_TOP - 2);
    c.stroke();
    if (state.hot) drawWordLabel(c, `${word.word} · ${word.start.toFixed(2)}s`, at, canvasWidth);
}

function drawWordLabel(c: CanvasRenderingContext2D, label: string, at: Point, canvasWidth: number) {
    const tw = c.measureText(label).width + 12;
    const lx = Math.min(Math.max(at.x - tw / 2, 2), canvasWidth - tw - 2);
    c.fillStyle = 'rgba(11,13,18,0.92)';
    c.strokeStyle = 'rgba(140,124,246,0.6)';
    c.beginPath();
    c.roundRect(lx, at.y + 12, tw, 18, 5);
    c.fill(); c.stroke();
    c.fillStyle = '#f0eee6';
    c.fillText(label, lx + 6, at.y + 25);
}

export function drawSelectRect(c: CanvasRenderingContext2D, r: Rect) {
    c.fillStyle = 'rgba(140,124,246,0.14)';
    c.strokeStyle = 'rgba(140,124,246,0.7)';
    c.setLineDash([4, 3]);
    c.beginPath();
    c.rect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
    c.fill(); c.stroke();
    c.setLineDash([]);
}

export function drawPlayhead(c: CanvasRenderingContext2D, px: number, h: number, scrubbing: boolean) {
    c.strokeStyle = '#8c7cf6';
    c.lineWidth = scrubbing ? 2.5 : 1.5;
    c.beginPath();
    c.moveTo(px, 32); c.lineTo(px, h - 8);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = '#8c7cf6';
    c.beginPath();
    c.moveTo(px - 4, 32); c.lineTo(px + 4, 32); c.lineTo(px, 38);
    c.fill();
}

const within = (value: number, a: number, b: number, slack: number) =>
    value >= Math.min(a, b) - slack && value <= Math.max(a, b) + slack;

/** The indexes of the words whose dots fall inside the rubber band. */
export function wordsInRect(words: TimedWord[], r: Rect, pxOf: TimeToX): number[] {
    const indexes: number[] = [];
    words.forEach((word, i) => {
        if (within(pxOf(word.start), r.x0, r.x1, 4) && within(dotY(i), r.y0, r.y1, 6)) indexes.push(i);
    });
    return indexes;
}

/** Shifts the selected words by delta, clamped so the group stays inside [0, duration]. */
export function shiftGroup(words: TimedWord[], selected: number[], delta: number, duration: number): TimedWord[] {
    const next = [...words];
    const minStart = Math.min(...selected.map((idx) => next[idx].start));
    const maxEnd = Math.max(...selected.map((idx) => next[idx].end));
    const d = Math.min(Math.max(delta, -minStart), duration - maxEnd);
    for (const idx of selected) {
        next[idx] = { ...next[idx], start: next[idx].start + d, end: next[idx].end + d };
    }
    return next;
}

/** Moves one word to t, snapped to 20 ms and kept between its neighbours. */
export function moveWord(words: TimedWord[], i: number, t: number, duration: number): TimedWord[] {
    const next = [...words];
    const word = { ...next[i] };
    const snapped = Math.round(t * 50) / 50;
    const lo = i > 0 ? next[i - 1].start + 0.04 : 0;
    const hi = i < next.length - 1 ? next[i + 1].start - 0.04 : duration - 0.05;
    word.start = Math.min(Math.max(snapped, lo), Math.max(lo, hi));
    word.end = Math.min(duration, word.start + (word.orig || 0.2));
    next[i] = word;
    return next;
}

/** True when a window message is the preview reporting its playback position. */
export function isPositionMessage(data: unknown): data is { montage: 'position'; t: unknown } {
    return !!data && typeof data === 'object' && (data as { montage?: unknown }).montage === 'position';
}

/** Re-seeks the audio only when it has drifted noticeably from the wanted position. */
export function syncAudioTo(audio: HTMLAudioElement | null, want: number) {
    if (audio && Math.abs(audio.currentTime - want) > 0.3) audio.currentTime = want;
}
