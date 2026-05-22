// Open Graph video renderer. Boots the landing page in headless Chromium
// (1200×630 viewport, dpr=2), starts a screencast, then sweeps the
// virtual mouse cursor from the left edge to the right edge through the
// vertical center over 10 seconds — driving the WebGL mouse-repel field
// through the entire "milroc labs" wordmark. Captures WebM, then
// transcodes to MP4 (h.264 + yuv420p) for broad social-platform
// compatibility (Twitter/X, Slack, iMessage, Facebook, Discord).
//
// Run after any visual change to landing.ts / landing.module.css:
//   bun run render-og-video
// then commit og.mp4.

import { serve } from 'bun';
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import landing from '../index.html';

const PORT = 41784;
const HOST = '127.0.0.1';
const VIEW_W = 1200;
const VIEW_H = 630;
const FRAME_HZ = 30;

// Choreography (totals to 7s):
//   2s — idle: just the wordmark, no cursor interaction
//   3s — cursor sweeps left → right through the vertical middle (ease-in-out)
//   2s — idle: cursor leaves the canvas, dots settle back to their targets
const IDLE_START_MS = 2000;
const SWEEP_FWD_MS = 3000;
const IDLE_END_MS = 2000;
const DURATION_MS = IDLE_START_MS + SWEEP_FWD_MS + IDLE_END_MS;

const server = serve({
  port: PORT,
  hostname: HOST,
  routes: { '/': landing, '/index.html': landing },
  development: { hmr: false },
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = '.' + decodeURIComponent(url.pathname);
    const file = Bun.file(path);
    if (await file.exists()) return new Response(file);
    return new Response('not found', { status: 404 });
  },
});

const url = `http://${HOST}:${PORT}/`;
console.log(`server: ${url}`);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
// Settle the chaos physics for a beat before recording so the dots have
// snapped to the letter targets.
await new Promise(r => setTimeout(r, 800));

// Start screencast.
const tmp = mkdtempSync(join(tmpdir(), 'og-video-'));
const webmPath = join(tmp, 'og.webm');
const recorder = await page.screencast({ path: webmPath });
console.log(`recording to ${webmPath}`);

const startX = 40;
const endX = VIEW_W - 40;
const y = VIEW_H / 2;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

async function sweep(fromX: number, toX: number, durationMs: number): Promise<void> {
  const steps = Math.max(1, Math.round((durationMs / 1000) * FRAME_HZ));
  const stepMs = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    const eased = easeInOut(i / steps);
    const x = fromX + (toX - fromX) * eased;
    await page.mouse.move(x, y);
    await new Promise(r => setTimeout(r, stepMs));
  }
}

// 2s idle: initial state has mouse.active=false (initialized in landing.ts),
// so the wordmark renders untouched. Just sleep.
await new Promise(r => setTimeout(r, IDLE_START_MS));

// 3s forward sweep. page.mouse.move emits a mousemove, which the canvas's
// listener picks up and sets mouse.active=true.
await page.mouse.move(startX, y);
await sweep(startX, endX, SWEEP_FWD_MS);

// 2s idle outro: fire a synthetic mouseleave on the canvas so the landing
// resets mouse.active=false (otherwise the repel field stays engaged at
// wherever the cursor stopped, even though no further moves arrive).
await page.evaluate(() => {
  const c = document.getElementById('gl-canvas');
  if (c) c.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
});
await new Promise(r => setTimeout(r, IDLE_END_MS));

await recorder.stop();
await browser.close();
server.stop();

if (!existsSync(webmPath)) {
  console.error('screencast file missing');
  process.exit(1);
}

// Transcode to MP4 (h.264 / yuv420p) for universal compatibility.
const mp4Path = resolve(import.meta.dir, '../og.mp4');
const proc = Bun.spawn([
  'ffmpeg', '-y',
  '-i', webmPath,
  // page.screencast pads its output with warmup + flush frames, so the
  // raw WebM runs ~8s longer than the mouse sweep. Cap at the sweep
  // duration so the OG video is exactly 10s.
  '-t', String(DURATION_MS / 1000),
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  // CRF 26 is a good balance for an OG video at this resolution. Adjust
  // down for higher quality, up for smaller file.
  '-crf', '26',
  '-preset', 'medium',
  '-movflags', '+faststart',
  '-an',
  mp4Path,
], { stderr: 'inherit', stdout: 'inherit' });
const code = await proc.exited;
if (code !== 0) {
  console.error(`ffmpeg exited ${code}`);
  process.exit(code);
}
rmSync(tmp, { recursive: true, force: true });

const size = (Bun.file(mp4Path).size / 1024).toFixed(1);
console.log(`wrote ${mp4Path} (${size} KB)`);
