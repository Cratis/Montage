// Scene-to-scene transitions: composite the incoming canvas B over the outgoing canvas A.

import { ease } from './util';

/** Everything a transition needs: the target context, both layers, the size and the accent. */
export interface TransitionLayers {
  ctx: CanvasRenderingContext2D;
  a: HTMLCanvasElement;
  b: HTMLCanvasElement;
  W: number;
  H: number;
  accent: string;
}

/** Progress of a transition: raw (k) and eased (e). */
interface Progress { k: number; e: number }

/** Scale `draw` about the center of the frame. */
function scaledAbout(L: TransitionLayers, s: number, draw: () => void): void {
  const { ctx, W, H } = L;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
  draw();
}

function slide(L: TransitionLayers, p: Progress): void {
  const { ctx, a, b, W, H } = L;
  ctx.drawImage(a, -W * 0.10 * p.e, 0);
  ctx.drawImage(b, W * (1 - p.e), 0);
  // hairline leading edge
  ctx.fillStyle = L.accent;
  ctx.globalAlpha = Math.sin(Math.PI * p.k) * 0.9;
  ctx.fillRect(W * (1 - p.e) - 2, 0, 2, H);
  ctx.globalAlpha = 1;
}

function wipe(L: TransitionLayers, p: Progress): void {
  const { ctx, a, b, W, H } = L;
  ctx.drawImage(a, 0, 0);
  const x = W * p.e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, x, H);
  ctx.clip();
  ctx.drawImage(b, 0, 0);
  ctx.restore();
  ctx.fillStyle = L.accent;
  ctx.globalAlpha = Math.sin(Math.PI * p.k) * 0.8;
  ctx.fillRect(x - 1.5, 0, 3, H);
  ctx.globalAlpha = 1;
}

function zoom(L: TransitionLayers, p: Progress): void {
  const { ctx, a, b } = L;
  const e = p.e;
  ctx.save();
  ctx.globalAlpha = 1 - e * 0.9;
  scaledAbout(L, 1 + 0.10 * e, () => ctx.drawImage(a, 0, 0));
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = e;
  scaledAbout(L, 0.94 + 0.06 * e, () => ctx.drawImage(b, 0, 0));
  ctx.restore();
}

function rise(L: TransitionLayers, p: Progress): void {
  const { ctx, a, b, H } = L;
  const e = p.e;
  ctx.globalAlpha = 1 - e * 0.55;
  ctx.drawImage(a, 0, 0);
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.6);
  ctx.drawImage(b, 0, H * 0.18 * (1 - e));
  ctx.restore();
}

function crossfade(L: TransitionLayers, p: Progress): void {
  const { ctx, a, b } = L;
  ctx.drawImage(a, 0, 0);
  ctx.globalAlpha = p.e;
  ctx.drawImage(b, 0, 0);
  ctx.globalAlpha = 1;
}

const TRANSITIONS: Record<string, (L: TransitionLayers, p: Progress) => void> = { slide, wipe, zoom, rise, crossfade };

/** Composite B over A with the named transition at raw progress k (unknown kinds crossfade). */
export function composite(L: TransitionLayers, kind: string, k: number): void {
  const { ctx, W, H } = L;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const draw = Object.prototype.hasOwnProperty.call(TRANSITIONS, kind) ? TRANSITIONS[kind]! : crossfade;
  draw(L, { k, e: ease.inOutCubic(k) });
}
