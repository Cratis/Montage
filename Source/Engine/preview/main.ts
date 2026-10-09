// Preview host: loads a show package (show.json + audio + data), boots the engine and
// the player. Also exposes the window.__motion bridge the offline renderer drives.
//
// The package location comes from ?pkg= — either a URL (absolute or relative to this
// page) or nothing, meaning 'package/' next to the page.

import { MotionEngine, Player, normalizeSpec } from '../src/index';
import { diagramSvg, type DiagramSpec } from '../src/scenes/diagram';

const params = new URLSearchParams(location.search);
const pkg = (params.get('pkg') ?? 'package').replace(/\/$/, '');
const startAt = params.get('t') ? parseFloat(params.get('t')!) : 0;
const exportMode = params.get('export') === '1';

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const errorBox = document.getElementById('error')!;

function fail(msg: string) {
  (window as any).__motion = { ready: false, error: msg };
  errorBox.textContent = msg;
  errorBox.style.display = 'grid';
  console.error(msg);
}

async function boot() {
  const r = await fetch(`${pkg}/show.json`);
  if (!r.ok) throw new Error(`show.json not found at ${pkg}/ (${r.status})`);
  const spec = normalizeSpec(await r.json());

  // stage fits the window, canvas keeps the exact show size
  const fit = () => {
    const s = Math.min(window.innerWidth / spec.width!, (window.innerHeight - (exportMode ? 0 : 72)) / spec.height!);
    stage.style.width = `${Math.floor(spec.width! * s)}px`;
    stage.style.height = `${Math.floor(spec.height! * s)}px`;
  };
  fit();
  window.addEventListener('resize', fit);

  const engine = new MotionEngine(canvas, spec, pkg);
  await engine.init();
  if (engine.errors.length) console.warn('scene errors:', engine.errors);

  const player = new Player(engine, canvas, document.createElement('div'));
  player.attachAudio(spec.voiceover ? `${pkg}/${spec.voiceover}` : null);

  const api = {
    ready: true,
    error: null as string | null,
    engine,
    width: engine.W,
    height: engine.H,
    fps: engine.fps,
    duration: () => engine.duration,
    timeline: () => engine.timeline.map((e) => ({ id: e.id, type: e.type, start: e.start, end: e.end })),
    errors: () => engine.errors,
    seek: (t: number) => player.seek(t),
    play: () => player.toggle(),
    pause: () => player.pause(),
    still: (t: number) => { player.seek(t); return engine.png(); },
    pixels: (t: number) => { player.seek(t); engine.renderAt(t); return engine.pixels().buffer; },
    png: () => engine.png(),
    svg: (sceneId: string) => {
      const scene = engine.timeline.find(e => e.id === sceneId);
      return scene?.type === 'diagram' ? diagramSvg(scene.spec.params as DiagramSpec) : null;
    },
    /** Stream raw RGBA frames [from,to) at fps over a WebSocket; acks keep a few frames in flight. */
    stream: (opts: { from: number; to: number; fps: number; ws: string; inflight?: number }) =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const { from, to, fps, ws: wsUrl, inflight = 10 } = opts;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        const first = Math.round(from * fps);
        const total = Math.round(to * fps) - first;
        let sent = 0;          // frames sent (relative)
        let acked = 0;         // frames acked by the encoder (relative)
        let resolved = false;
        const finish = () => { if (!resolved) { resolved = true; resolve({}); try { ws.close(); } catch { /* already */ } } };
        ws.onopen = () => pump();
        ws.onerror = () => { if (!resolved) { resolved = true; reject(new Error('stream ws error')); } };
        const pump = () => {
          while (sent < total && sent - acked < inflight) {
            engine.renderAt((first + sent) / fps);
            ws.send(engine.pixels().buffer as ArrayBuffer);
            sent++;
          }
          if (sent >= total && acked >= total) finish();
        };
        ws.onmessage = (ev) => {
          acked = parseInt(String(ev.data), 10);
          pump();
        };
        ws.onclose = () => { if (!resolved) { resolved = true; reject(new Error(`Frame stream closed early: ${acked}/${total} acknowledged`)); } };
      }),
  };
  (window as any).__motion = api;

  const sceneParam = params.get('scene');
  if (sceneParam) {
    player.playPlate(sceneParam, params.get('loop') === '1');
  } else {
    player.start(startAt);
  }
  if (exportMode) player.setHudVisible(false);

  // hosts (the scene inspector) pause the preview when its tab is hidden, and scrub it
  // to an absolute show time so the timing editor's playhead and the visuals stay in lock;
  // the preview reports its position back so the host's scrubber mirrors the player's
  window.addEventListener('message', (e) => {
    if (e.data === 'motion:pause') player.pause();
    else if (e.data && typeof e.data === 'object' && e.data.motion === 'seek') {
      player.pause();
      const t = Number(e.data.t);
      if (!Number.isNaN(t)) player.seek(Math.max(0, Math.min(engine.duration, t)));
    }
  });
  setInterval(() => {
    window.parent?.postMessage({ motion: 'position', t: player.current, playing: player.isPlaying }, '*');
  }, 100);

  // opened from the editor's package panel: keep a visible way back to the show
  const back = params.get('back');
  if (back && !exportMode) {
    const chip = document.createElement('a');
    chip.href = back;
    chip.textContent = '\u2190 back to show';
    chip.style.cssText = 'position:fixed;top:16px;left:18px;z-index:30;font:500 13px "JetBrains Mono",monospace;color:#9aa1b0;text-decoration:none;padding:8px 14px;border:1px solid rgba(255,255,255,0.14);border-radius:999px;background:rgba(11,13,18,0.78);backdrop-filter:blur(6px)';
    chip.onmouseenter = () => { chip.style.color = '#f0eee6'; };
    chip.onmouseleave = () => { chip.style.color = '#9aa1b0'; };
    document.body.appendChild(chip);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') location.href = back; });
  }
}

boot().catch((e) => fail(String((e as Error)?.stack ?? e)));
