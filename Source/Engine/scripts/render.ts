#!/usr/bin/env node
// Offline renderer. Serves the engine's built preview + the show package over a tiny
// local HTTP server (no vite needed), drives headless Chrome, and either:
//
//   stills  node scripts/render.ts stills --pkg <dir|url> --t 1.5,23 [--out dir]
//   sheet   node scripts/render.ts sheet  --pkg <dir|url> --from 20 --to 35 [--n 12] [--out file.png]
//   video   node scripts/render.ts video  --pkg <dir|url> [--from 0 --to <dur>] [--fps 60] [--crf 17]
//                                         [--out ../out/show.mp4] [--noaudio]
//
// The editor backend shells out to `video`. Frames stream raw RGBA over a WebSocket
// from the page into ffmpeg, so memory stays flat at any resolution.

import { chromium } from 'playwright-core';
import { WebSocketServer } from 'ws';
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.map': 'application/json',
};

// ---- static server: / -> engine/dist/preview (or preview/ sources), /pkg/... -> the package dir
function startServer(pkgDir: string | null, port = 0): Promise<{ url: string; stop: () => void }> {
  const previewDir = existsSync(join(APP, 'dist', 'preview')) ? join(APP, 'dist', 'preview') : join(APP, 'preview');
  const srv = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!;
    let filePath: string | null = null;
    if (url.startsWith('/pkg/')) {
      if (!pkgDir) { res.writeHead(404).end(); return; }
      filePath = join(pkgDir, decodeURIComponent(url.slice('/pkg/'.length)));
    } else {
      const rel = url === '/' ? 'index.html' : url.slice(1);
      filePath = join(previewDir, rel);
      if (!existsSync(filePath) && !extname(rel)) filePath = join(previewDir, 'index.html');
    }
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => {
    const p = (srv.address() as any).port;
    res({ url: `http://127.0.0.1:${p}`, stop: () => srv.close() });
  }));
}

async function openPage(baseUrl: string, extraQuery = '') {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL ?? 'chrome',
    headless: !flag('headed'),
    args: [
      process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=metal',
      '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${baseUrl}/?export=1${extraQuery}`);
  await page.waitForFunction(() => (window as any).__motion?.ready || (window as any).__motion?.error, null, { timeout: 120000 });
  const err: string | null = await page.evaluate(() => (window as any).__motion.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__motion.errors());
  if (sceneErrors.length) { await browser.close(); throw new Error('SCENE ERRORS:\n' + sceneErrors.join('\n')); }
  return { browser, page, logs };
}

async function stills(page: any, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const data: string = await page.evaluate((t: number) => (window as any).__motion.still(t), t);
    const f = join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(f, Buffer.from(data.split(',')[1]!, 'base64'));
    files.push(f);
    console.log(f);
  }
  return files;
}

async function sheet(page: any, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols }: { times: number[]; cols: number }) => {
    const M = (window as any).__motion;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#171a22'; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < times.length; i++) {
      M.still(times[i]!);
      const src = document.getElementById('c') as HTMLCanvasElement;
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#9aa1b0'; c.font = '13px monospace';
      c.fillText(`${times[i]!.toFixed(2)}s`, x + 2, y + 13);
    }
    return cv.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(dirname(out), { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  console.log(out);
}

async function video(page: any, pkgBase: string, from: number, to: number, fps: number, out: string) {
  mkdirSync(dirname(out), { recursive: true });
  const W: number = await page.evaluate(() => (window as any).__motion.width);
  const H: number = await page.evaluate(() => (window as any).__motion.height);
  const crf = opt('crf', '17')!;
  const audioPath = !flag('noaudio') ? join(pkgBase, 'audio/voiceover.mp3') : null;
  const hasAudio = audioPath ? existsSync(audioPath) : false;

  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0'];
  if (hasAudio && audioPath) args.push('-ss', String(from), '-t', String(to - from), '-i', audioPath);
  // frames are sRGB; tag BT.709 so players and YouTube decode the colors we drew
  args.push('-vf', 'scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709',
    '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', crf, '-pix_fmt', 'yuv420p',
    '-x264-params', 'aq-mode=3');
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push('-movflags', '+faststart', out);

  const ff = spawn(args[0]!, args.slice(1), { stdio: ['pipe', 'inherit', 'inherit'] });
  const encoded = once(ff, 'close');
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', maxPayload: W * H * 4 + 1024 });
  await new Promise<void>((res) => wss.on('listening', () => res()));
  const wsPort = (wss.address() as any).port;
  wss.on('connection', (ws) => {
    // Acknowledge only after the encoder has accepted the complete frame. Serial writes
    // preserve frame order and honour stdin backpressure rather than buffering a whole film.
    let queue = Promise.resolve();
    ff.stdin!.on('error', () => ws.close());
    ff.on('close', () => { if (frames < total) ws.close(); });
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      queue = queue.then(async () => {
        if (!isBinary || data.length !== W * H * 4) throw new Error('Invalid RGBA frame payload');
        if (!ff.stdin!.write(data)) await once(ff.stdin!, 'drain');
        frames++;
        ws.send(String(frames));
        if (frames % 60 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${Math.round((total - frames) / Math.max(frames / el, 0.01))}s   `);
        }
      }).catch((error) => { console.error(error); ws.close(); });
    });
  });

  try {
    await page.evaluate(({ from, to, fps, ws }: any) => (window as any).__motion.stream({ from, to, fps, ws }), {
      from, to, fps, ws: `ws://127.0.0.1:${wsPort}`,
    });
    if (frames !== total) throw new Error(`Incomplete render: ${frames}/${total} frames`);
    ff.stdin!.end();
    const [exitCode] = await encoded;
    if (exitCode !== 0) throw new Error(`ffmpeg failed with exit code ${exitCode}`);
    console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  } finally {
    for (const c of wss.clients) c.terminate();
    wss.close();
    if (ff.exitCode === null) ff.kill();
  }
}

// ---- main --------------------------------------------------------------------------------
const pkgOpt = opt('pkg', 'package')!;
const isUrl = /^https?:\/\//.test(pkgOpt);
let pkgDir: string | null = null;
if (!isUrl) {
  pkgDir = resolve(pkgOpt);
  if (!existsSync(join(pkgDir, 'show.json'))) {
    console.error(`no show.json in package: ${pkgDir}`);
    process.exit(1);
  }
}

const server = await startServer(pkgDir);
const query = isUrl ? `&pkg=${encodeURIComponent(pkgOpt)}` : '&pkg=/pkg';
try {
  const { browser, page, logs } = await openPage(server.url, query);
  try {
    if (mode === 'stills') {
      const times = (opt('t', '0')!).split(',').map(Number);
      await stills(page, times, resolve(opt('out', 'out/stills')!));
    } else if (mode === 'sheet') {
      const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
      const times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
      await sheet(page, times, +opt('cols', '4')!, resolve(opt('out', `out/sheets/sheet_${from}-${to}.png`)!));
    } else if (mode === 'video') {
      const dur: number = await page.evaluate(() => (window as any).__motion.duration());
      await video(page, pkgDir ?? pkgOpt, +opt('from', '0')!, +opt('to', String(dur))!, +opt('fps', '60')!, resolve(opt('out', 'out/show.mp4')!));
    } else if (mode === 'info') {
      const info = await page.evaluate(() => ({
        duration: (window as any).__motion.duration(),
        width: (window as any).__motion.width,
        height: (window as any).__motion.height,
        timeline: (window as any).__motion.timeline(),
      }));
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.error(`unknown mode: ${mode} (stills | sheet | video | info)`);
      process.exitCode = 1;
    }
    if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
  } finally {
    await browser.close();
  }
} finally {
  server.stop();
}
