#!/usr/bin/env node
// A tiny local mock of the three self-hosted services Montage talks to, for wiring tests:
//   POST /v1/chat/completions      -> a canned show plan (OpenAI-compatible)
//   POST /v1/audio/speech          -> a synthesized WAV: a soft tone per word (OpenAI-compatible)
//   POST /v1/audio/transcriptions  -> verbose_json with evenly spread word timings (OpenAI-compatible)
// Run: node docker/mock-services.mjs   (listens on :8790)

import { createServer } from 'node:http';

const PORT = 8790;

const plan = {
  title: 'Motion as Code',
  scenes: [
    { type: 'title', spoken: 'What if your next video was written, not edited?', params: { kicker: 'motion as code', headline: 'Describe it once. Get a video.', emphasis: 'once' } },
    { type: 'flow', spoken: 'One prompt becomes a plan. The plan becomes a voice, and the voice becomes the cut.', params: { headline: 'One pipeline, five moves', nodes: [ { label: 'Describe', sub: 'one prompt' }, { label: 'Plan', sub: 'story + script' }, { label: 'Voice', sub: 'self-hosted TTS' }, { label: 'Time', sub: 'word alignment' }, { label: 'Render', sub: 'deterministic' } ] } },
    { type: 'metric', spoken: 'Every frame is a pure function of time, so the preview and the export are pixel identical at 60 frames per second.', params: { value: 60, format: 'number', label: 'frames per second, drift-free', delta: '0 drift' } },
    { type: 'endcard', spoken: 'Stop keyframing. Start describing.', params: { headline: 'Make motion like this', cta: 'cratis.io' } },
  ],
};

function toneWav(seconds, freq = 220) {
  const rate = 24000, samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 500) * Math.min(1, (samples - i) / 500);
    const v = Math.sin((2 * Math.PI * freq * i) / rate) * 0.25 * envelope;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const spokenTexts = plan.scenes.map((s) => s.spoken);
const sceneGaps = 0.45;
// simulate the per-scene synthesis + concatenation the backend does, so word times line up
const sceneWindows = [];
{
  let cursor = 0.5;
  for (const text of spokenTexts) {
    const words = text.split(' ').length;
    const dur = Math.max(1.2, words * 0.34);
    sceneWindows.push({ text, start: cursor, dur });
    cursor += dur + sceneGaps;
  }
}
const totalDuration = sceneWindows.reduce((a, s) => a + s.dur + sceneGaps, 0.5);

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && url === '/v1/chat/completions') {
      const content = JSON.stringify(plan);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      return;
    }
    if (req.method === 'POST' && url === '/v1/audio/speech') {
      try {
        const parsed = JSON.parse(body);
        const words = String(parsed.input ?? '').split(' ').filter(Boolean).length;
        const wav = toneWav(Math.max(1.2, words * 0.34), 200 + words * 4);
        res.writeHead(200, { 'content-type': 'audio/wav' });
        res.end(wav);
      } catch {
        res.writeHead(400).end();
      }
      return;
    }
    if (req.method === 'POST' && url === '/v1/audio/transcriptions') {
      const words = [];
      for (const scene of sceneWindows) {
        const tokens = scene.text.split(' ').filter(Boolean);
        const per = scene.dur / tokens.length;
        tokens.forEach((w, i) => words.push({ word: w, start: +(scene.start + i * per).toFixed(3), end: +(scene.start + (i + 1) * per - 0.02).toFixed(3) }));
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: sceneWindows.map((s) => s.text).join(' '), words }));
      return;
    }
    res.writeHead(404).end();
  });
});

server.listen(PORT, () => console.log(`mock services on http://localhost:${PORT} (planned duration ~${totalDuration.toFixed(1)}s)`));
