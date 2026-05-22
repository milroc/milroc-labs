// Headless favicon renderer. Mirrors the lab's "favicon builder" using
// @napi-rs/canvas + buildGraph, then writes PNGs at common favicon sizes.
//
// The lab's WebGL rendering and this Canvas 2D rendering aren't pixel-
// identical (WebGL's gl.lineWidth is usually clamped to 1px on desktops,
// and its point sprites have a discard-based edge falloff that Canvas 2D
// arc fills approximate but don't match exactly). The look is close
// enough for a favicon, and the topology — which is what makes the
// monogram recognizable — is identical because buildGraph is shared.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Register the self-hosted variable font under the same family name the
// lab uses ('Space Grotesk Variable').
GlobalFonts.registerFromPath(
  resolve(import.meta.dir, '../fonts/space-grotesk-latin-wght-normal.woff2'),
  'Space Grotesk Variable',
);

// buildGraph rasterizes the target text via `document.createElement('canvas')`.
// Polyfill that to use @napi-rs/canvas so the function can run in Bun.
const docPolyfill = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error(`document.createElement: unsupported tag "${tag}"`);
  },
};
(globalThis as unknown as { document: typeof docPolyfill }).document = docPolyfill;

const { buildGraph } = await import('../src/lib/graph');

const SRC = 512;
const CFG = {
  font: "'Space Grotesk Variable',sans-serif",
  weight: 700,
  nodesPerLetter: 790,
  k: 16,
  kMin: 14,
  nodeRadius: 3.5,
  edgeAlpha: 0.18,
  edgeWidth: 2.0,
  textColor: '#f4ecd9',
  bgColor: '#3a6b4a',
};

const g = buildGraph('m', CFG.font, CFG.weight, SRC, SRC, CFG.nodesPerLetter, CFG.k, CFG.kMin);
console.log(`nodes: ${g.nodes.length / 2}, edges: ${g.edges.length / 2}`);

const canvas = createCanvas(SRC, SRC);
const ctx = canvas.getContext('2d');

// Background.
ctx.fillStyle = CFG.bgColor;
ctx.fillRect(0, 0, SRC, SRC);

// Edges first so points draw on top.
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
const r = CFG.nodeRadius;
for (let i = 0; i < n; i++) {
  ctx.beginPath();
  ctx.arc(g.nodes[i * 2], g.nodes[i * 2 + 1], r, 0, Math.PI * 2);
  ctx.fill();
}

// Emit at common favicon sizes. We downsample from the 512px source via
// drawImage with high-quality smoothing; small sizes won't preserve the
// graph detail but the silhouette and color reads cleanly.
const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
for (const size of sizes) {
  const out = createCanvas(size, size);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, size, size);
  const buf = await out.encode('png');
  const path = resolve(import.meta.dir, `../favicons/favicon-${size}.png`);
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${buf.length} bytes)`);
}

// SVG: vector version of the same graph. To keep the file small, all
// edges collapse into a single <path> with M/L commands, and all nodes
// collapse into a second <path> using a zero-length subpath per dot
// (M x,y h0) with stroke-linecap="round" — that paints a circle of
// stroke-width diameter, so the dot radius is encoded once on the group
// instead of repeated per node. 1-decimal coords.
const fmt = (x: number): string => Math.round(x).toString();
let edgesD = '';
for (let i = 0; i < ec; i++) {
  const a = g.edges[i * 2], b = g.edges[i * 2 + 1];
  edgesD += `M${fmt(g.nodes[a * 2])} ${fmt(g.nodes[a * 2 + 1])}L${fmt(g.nodes[b * 2])} ${fmt(g.nodes[b * 2 + 1])}`;
}
let dotsD = '';
for (let i = 0; i < n; i++) {
  dotsD += `M${fmt(g.nodes[i * 2])} ${fmt(g.nodes[i * 2 + 1])}h0`;
}
const dotDiameter = CFG.nodeRadius * 2;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SRC} ${SRC}">` +
  `<rect width="${SRC}" height="${SRC}" fill="${CFG.bgColor}"/>` +
  `<path d="${edgesD}" stroke="${CFG.textColor}" stroke-width="${CFG.edgeWidth}" stroke-opacity="${CFG.edgeAlpha}" stroke-linecap="round" fill="none"/>` +
  `<path d="${dotsD}" stroke="${CFG.textColor}" stroke-width="${dotDiameter}" stroke-linecap="round" fill="none"/>` +
  `</svg>`;
const svgPath = resolve(import.meta.dir, '../favicons/favicon.svg');
writeFileSync(svgPath, svg);
console.log(`wrote ${svgPath} (${svg.length} bytes)`);
