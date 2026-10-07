// Post processing on the final composite: film grain (deterministic, seeded by frame),
// a whisper of vignette. Cheap, subtle, identical every render.

import { rng } from './util';

export interface PostParams { grain: number; vignette: number }

export const DEFAULT_POST: PostParams = { grain: 0.05, vignette: 0.22 };

let tiles: HTMLCanvasElement[] | null = null;

function grainTiles(): HTMLCanvasElement[] {
  if (tiles) return tiles;
  tiles = [];
  for (let k = 0; k < 6; k++) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    const r = rng(0x9e3779b9 ^ k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
  return tiles;
}

export function postProcess(
  ctx: CanvasRenderingContext2D, W: number, H: number, t: number,
  params: PostParams = DEFAULT_POST,
) {
  const { grain, vignette } = params;
  if (vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (grain > 0) {
    const ts = grainTiles();
    const tile = ts[Math.floor(t * 60) % ts.length]!;
    ctx.save();
    ctx.globalAlpha = grain;
    ctx.globalCompositeOperation = 'overlay';
    const r = rng(0x85ebca6b ^ Math.floor(t * 60));
    const ox = -Math.floor(r() * 256), oy = -Math.floor(r() * 256);
    for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(tile, x, y);
    ctx.restore();
  }
}
