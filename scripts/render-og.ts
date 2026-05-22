// Open Graph image renderer. Uses headless Chromium (puppeteer) to load
// the actual landing page in a 1200×630 viewport at dpr=2, lets the WebGL
// physics settle for a beat, then screenshots — guaranteeing the OG image
// matches what the website itself draws.
//
// Run after any change to landing.ts / landing.module.css / fonts:
//   bun run render-og
// then commit the updated og.png.

import { serve } from 'bun';
import puppeteer from 'puppeteer';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import landing from '../index.html';

const PORT = 41783;
const HOST = '127.0.0.1';

const server = serve({
  port: PORT,
  hostname: HOST,
  routes: { '/': landing, '/index.html': landing },
  development: { hmr: false },
  async fetch(req: Request): Promise<Response> {
    // Mirror dev.ts's static fallback so /fonts/*, /favicons/*, etc. resolve.
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
// dpr=2 so the supersampled WebGL render matches what retina visitors see.
// We downsample to 1200×630 below.
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
// Let the chaos physics settle — without this the dots are still flying
// in from their seed positions when we capture.
await new Promise(r => setTimeout(r, 1500));

const screenshot = await page.screenshot({ type: 'png' });
await browser.close();
server.stop();

// Downsample the 2400×1260 dpr=2 capture to the canonical 1200×630 OG size.
const img = await loadImage(screenshot);
const out = createCanvas(1200, 630);
const ctx = out.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.drawImage(img, 0, 0, 1200, 630);
const buf = await out.encode('png');

const outPath = resolve(import.meta.dir, '../og.png');
writeFileSync(outPath, buf);
console.log(`wrote ${outPath} (${buf.length} bytes)`);
