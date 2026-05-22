// Headless Open Graph image renderer. Produces og.png (1200×630) using
// the same buildGraph algorithm the landing page renders at runtime —
// same font, same node/edge style — so the social preview matches what
// visitors actually see.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

GlobalFonts.registerFromPath(
  resolve(import.meta.dir, '../fonts/space-grotesk-latin-wght-normal.woff2'),
  'Space Grotesk Variable',
);

const docPolyfill = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error(`document.createElement: unsupported tag "${tag}"`);
  },
};
(globalThis as unknown as { document: typeof docPolyfill }).document = docPolyfill;

const { buildGraph } = await import('../src/lib/graph');

const W = 1200;
const H = 630;
const CFG = {
  text: 'milroc labs',
  font: "'Space Grotesk Variable',sans-serif",
  weight: 700,
  nodesPerLetter: 440,
  k: 24,
  kMin: 18,
  nodeRadius: 1.2,
  edgeAlpha: 0.22,
  edgeWidth: 2.0,
  textColor: '#f4ecd9',
  bgColor: '#3a6b4a',
};

const g = buildGraph(CFG.text, CFG.font, CFG.weight, W, H, CFG.nodesPerLetter, CFG.k, CFG.kMin);
console.log(`nodes: ${g.nodes.length / 2}, edges: ${g.edges.length / 2}`);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

ctx.fillStyle = CFG.bgColor;
ctx.fillRect(0, 0, W, H);

// Edges.
const ec = g.edges.length / 2;
ctx.strokeStyle = CFG.textColor;
ctx.globalAlpha = CFG.edgeAlpha;
ctx.lineWidth = CFG.edgeWidth;
ctx.lineCap = 'round';
ctx.beginPath();
for (let i = 0; i < ec; i++) {
  const a = g.edges[i * 2], b = g.edges[i * 2 + 1];
  ctx.moveTo(g.nodes[a * 2], g.nodes[a * 2 + 1]);
  ctx.lineTo(g.nodes[b * 2], g.nodes[b * 2 + 1]);
}
ctx.stroke();
ctx.globalAlpha = 1;

// Nodes.
const n = g.nodes.length / 2;
ctx.fillStyle = CFG.textColor;
for (let i = 0; i < n; i++) {
  ctx.beginPath();
  ctx.arc(g.nodes[i * 2], g.nodes[i * 2 + 1], CFG.nodeRadius, 0, Math.PI * 2);
  ctx.fill();
}

// Tagline strip along the bottom edge — small, de-emphasized, same vibe
// as the runtime tagline on the landing page.
ctx.font = `400 18px 'Space Grotesk Variable',sans-serif`;
ctx.fillStyle = 'rgba(244, 236, 217, 0.55)';
ctx.textAlign = 'center';
ctx.textBaseline = 'alphabetic';
ctx.fillText('products, services & experiments by Miles McCrocklin', W / 2, H - 36);

const buf = await canvas.encode('png');
const path = resolve(import.meta.dir, '../og.png');
writeFileSync(path, buf);
console.log(`wrote ${path} (${buf.length} bytes)`);
