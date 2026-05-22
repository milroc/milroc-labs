// Graph topology builder. Renders text to an offscreen canvas, finds
// connected components (one per letter), samples N nodes per component,
// builds a k-NN graph per component with line-of-sight checks so edges
// don't cross outside the letter shape or jump between letters.

export type Graph = {
  nodes: Float32Array;       // flat [x, y, x, y, …]
  edges: Uint32Array;        // flat [a, b, a, b, …]
  letterCount: number;
  letterOf: Uint32Array;     // per-node component index
};

// Truncated-normal integer sampler — Box-Muller, then clip + round.
export function truncatedNormalInt(lo: number, hi: number): number {
  if (hi <= lo) return lo;
  const mean = (lo + hi) / 2;
  const std = (hi - lo) / 4;
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let x = Math.round(mean + std * z);
  if (x < lo) x = lo;
  else if (x > hi) x = hi;
  return x;
}

export function buildGraph(
  text: string,
  fontFamily: string,
  fontWeight: number,
  w: number,
  h: number,
  nodesPerLetter: number,
  k: number,
  kMin: number,
): Graph {
  kMin = Math.max(1, Math.min(kMin || 1, k));
  const empty: Graph = { nodes: new Float32Array(0), edges: new Uint32Array(0), letterCount: 0, letterOf: new Uint32Array(0) };

  // Downscale labeling grid for speed.
  const lw = Math.max(64, w >> 2);
  const lh = Math.max(64, h >> 2);
  const off = document.createElement('canvas');
  off.width = lw; off.height = lh;
  const ctx = off.getContext('2d');
  if (!ctx) return empty;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lw, lh);
  const lines = text.split('\n');
  const lineGap = 1.05;
  const maxW = lw * 0.9;
  const maxH = lh * 0.86;
  let size = Math.min(maxH / (lines.length * lineGap), lw * 0.78);
  ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  const widest = (): number => {
    let m = 0;
    for (const l of lines) {
      const w = ctx.measureText(l).width;
      if (w > m) m = w;
    }
    return m;
  };
  while (widest() > maxW && size > 6) {
    size *= 0.95;
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  }
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  const lineH = size * lineGap;
  const totalH = lineH * lines.length;
  const startY = (lh - totalH) / 2 + lineH / 2;
  for (let li = 0; li < lines.length; li++) {
    const lineW = ctx.measureText(lines[li]).width;
    ctx.fillText(lines[li], (lw - lineW) / 2, startY + li * lineH);
  }
  const data = ctx.getImageData(0, 0, lw, lh).data;
  const binary = new Uint8Array(lw * lh);
  // Threshold ~55% luminance catches partial-coverage antialiased edge pixels.
  for (let i = 0; i < binary.length; i++) if (data[i * 4] < 140) binary[i] = 1;

  // Connected components — iterative flood fill, 4-connectivity.
  let labels = new Int32Array(lw * lh);
  const components: number[][] = [];
  let next = 1;
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const i = y * lw + x;
      if (!binary[i] || labels[i] !== 0) continue;
      const stack: number[] = [i];
      const pixels: number[] = [];
      const label = next++;
      while (stack.length) {
        const j = stack.pop()!;
        if (j < 0 || j >= binary.length || labels[j] !== 0 || !binary[j]) continue;
        labels[j] = label;
        pixels.push(j);
        const jx = j % lw;
        const jy = (j / lw) | 0;
        if (jx > 0) stack.push(j - 1);
        if (jx < lw - 1) stack.push(j + 1);
        if (jy > 0) stack.push(j - lw);
        if (jy < lh - 1) stack.push(j + lw);
      }
      if (pixels.length >= 8) components.push(pixels);
    }
  }
  if (components.length === 0) return empty;

  // Dilate labels by one pixel so LOS is forgiving of antialiased edges,
  // but skip "narrow corridor" pixels — empty pixels sandwiched between
  // labeled neighbors on opposite sides (the inner counters of a/b/e/o
  // and the throat of s/g). Filling those would let LOS walk straight
  // through what should be empty space inside a letter.
  {
    const out = new Int32Array(labels);
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        const i = y * lw + x;
        if (labels[i] !== 0) continue;
        const L = x > 0 ? labels[i - 1] : 0;
        const R = x < lw - 1 ? labels[i + 1] : 0;
        const U = y > 0 ? labels[i - lw] : 0;
        const D = y < lh - 1 ? labels[i + lw] : 0;
        if ((L !== 0 && R !== 0) || (U !== 0 && D !== 0)) continue;
        const lab = L || R || U || D;
        if (lab !== 0) out[i] = lab;
      }
    }
    labels = out;
  }

  const labelToComp = new Int32Array(next);
  labelToComp.fill(-1);
  for (let ci = 0; ci < components.length; ci++) {
    labelToComp[labels[components[ci][0]]] = ci;
  }

  // Bresenham LOS — every pixel must belong to the same component.
  function losSameComp(x0: number, y0: number, x1: number, y1: number, comp: number): boolean {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    if (x0 < 0 || x0 >= lw || y0 < 0 || y0 >= lh) return false;
    if (x1 < 0 || x1 >= lw || y1 < 0 || y1 >= lh) return false;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      const lab = labels[y0 * lw + x0];
      if (lab === 0 || labelToComp[lab] !== comp) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = err << 1;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }

  const invScaleX = lw / w, invScaleY = lh / h;
  const scaleX = w / lw, scaleY = h / lh;

  const totalPixels = components.reduce((s, c) => s + c.length, 0);
  const allNodes: number[] = [];
  const letterOf: number[] = [];
  const subGraphs: { start: number; count: number }[] = [];
  for (let ci = 0; ci < components.length; ci++) {
    const comp = components[ci];
    const share = comp.length / totalPixels;
    const n = Math.max(8, Math.round(nodesPerLetter * share * components.length));
    const start = allNodes.length / 2;
    for (let i = 0; i < n; i++) {
      const px = comp[(Math.random() * comp.length) | 0];
      const cx = (px % lw) * scaleX + (Math.random() - 0.5) * scaleX;
      const cy = ((px / lw) | 0) * scaleY + (Math.random() - 0.5) * scaleY;
      allNodes.push(cx, cy);
      letterOf.push(ci);
    }
    subGraphs.push({ start, count: n });
  }
  const nodes = new Float32Array(allNodes);
  const letterOfArr = new Uint32Array(letterOf);

  // k-NN with line-of-sight + kMin fallback.
  const edgeSet = new Set<number>();
  const totalNodes = nodes.length / 2;
  const meanArea = (w * h) / Math.max(1, totalNodes);
  const cell = Math.max(4, Math.min(40, Math.sqrt(meanArea) * 1.6));
  for (let ci = 0; ci < subGraphs.length; ci++) {
    const sg = subGraphs[ci];
    const cnt = sg.count;
    if (cnt < 2) continue;
    const kMax = Math.min(k, cnt - 1);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < cnt; i++) {
      const ai = sg.start + i;
      const x = nodes[ai * 2], y = nodes[ai * 2 + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
    const rows = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < cnt; i++) {
      const ai = sg.start + i;
      const cx = ((nodes[ai * 2] - minX) / cell) | 0;
      const cy = ((nodes[ai * 2 + 1] - minY) / cell) | 0;
      const key = cy * cols + cx;
      let arr = grid.get(key);
      if (!arr) { arr = []; grid.set(key, arr); }
      arr.push(ai);
    }
    const dists: number[] = [];
    for (let i = 0; i < cnt; i++) {
      const ai = sg.start + i;
      const ax = nodes[ai * 2], ay = nodes[ai * 2 + 1];
      const cx = ((ax - minX) / cell) | 0;
      const cy = ((ay - minY) / cell) | 0;
      const lo = Math.min(kMin, kMax);
      const k_i = truncatedNormalInt(lo, kMax);
      dists.length = 0;
      const scan = (radius: number): void => {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ncx = cx + dx, ncy = cy + dy;
            if (ncx < 0 || ncx >= cols || ncy < 0 || ncy >= rows) continue;
            const arr = grid.get(ncy * cols + ncx);
            if (!arr) continue;
            for (let m = 0; m < arr.length; m++) {
              const j = arr[m];
              if (j === ai) continue;
              const ddx = nodes[j * 2] - ax;
              const ddy = nodes[j * 2 + 1] - ay;
              dists.push(j, ddx * ddx + ddy * ddy);
            }
          }
        }
      };
      scan(1);
      if (dists.length / 2 < k_i) { dists.length = 0; scan(2); }
      if (dists.length / 2 < k_i) { dists.length = 0; scan(3); }
      // Selection sort by d² (small array is fine here).
      const pairs = dists.length / 2;
      for (let p = 0; p < pairs; p++) {
        let mi = p, mv = dists[p * 2 + 1];
        for (let q = p + 1; q < pairs; q++) {
          if (dists[q * 2 + 1] < mv) { mi = q; mv = dists[q * 2 + 1]; }
        }
        if (mi !== p) {
          const t0 = dists[p * 2], t1 = dists[p * 2 + 1];
          dists[p * 2] = dists[mi * 2]; dists[p * 2 + 1] = dists[mi * 2 + 1];
          dists[mi * 2] = t0; dists[mi * 2 + 1] = t1;
        }
      }
      const accepted = new Set<number>();
      const gxA = ax * invScaleX, gyA = ay * invScaleY;
      for (let p = 0; p < pairs && accepted.size < k_i; p++) {
        const bi = dists[p * 2];
        const gxB = nodes[bi * 2] * invScaleX;
        const gyB = nodes[bi * 2 + 1] * invScaleY;
        if (!losSameComp(gxA, gyA, gxB, gyB, ci)) continue;
        if (accepted.has(bi)) continue;
        const lo2 = ai < bi ? ai : bi;
        const hi2 = ai < bi ? bi : ai;
        edgeSet.add(lo2 * 67108864 + hi2);
        accepted.add(bi);
      }
      for (let p = 0; p < pairs && accepted.size < kMin; p++) {
        const bi = dists[p * 2];
        if (accepted.has(bi)) continue;
        const lo2 = ai < bi ? ai : bi;
        const hi2 = ai < bi ? bi : ai;
        edgeSet.add(lo2 * 67108864 + hi2);
        accepted.add(bi);
      }
    }
  }
  const edges = new Uint32Array(edgeSet.size * 2);
  let e = 0;
  for (const key of edgeSet) {
    const lo = (key / 67108864) | 0;
    const hi = key - lo * 67108864;
    edges[e++] = lo; edges[e++] = hi;
  }
  return { nodes, edges, letterCount: components.length, letterOf: letterOfArr };
}
