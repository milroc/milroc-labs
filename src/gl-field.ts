// WebGL particle field for the lab.
// Two modes: 'dots' (sample text into N particles) and 'graph' (k-NN per
// letter, shape-respecting LOS, Laplace-weighted edges). CPU physics +
// GPU draw via gl.POINTS for nodes and gl.LINES for edges.

import { hexToRGB, computeAccent, type RGB } from './lib/color';
import { buildGraph } from './lib/graph';
import { sampleText } from './lib/sample-text';
import { createProgram } from './lib/webgl';
import { FONTS, type FontKey, type FontSpec } from './lib/fonts';

const VS_SRC = `
attribute vec2 a_position;
attribute vec4 a_color;
attribute float a_size;
uniform vec2 u_resolution;
varying vec4 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

const FS_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float aa = 1.0 - smoothstep(0.78, 1.0, d);
  gl_FragColor = vec4(v_color.rgb, v_color.a * aa);
}`;

const VS_LINE_SRC = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FS_LINE_SRC = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

export type Mode = 'dots' | 'graph';

export class GLField {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private lineProgram: WebGLProgram;
  private locPos: number; private locColor: number; private locSize: number;
  private locRes: WebGLUniformLocation | null;
  private lineLocPos: number;
  private lineLocRes: WebGLUniformLocation | null;
  private lineLocColor: WebGLUniformLocation | null;
  private buffer: WebGLBuffer | null;
  private lineBuffer: WebGLBuffer | null;

  W = 2; H = 2;
  mode: Mode = 'dots';
  nodesPerLetter = 60;
  graphK = 3;
  graphKMin = 1;
  nodeRadius = 1.0;
  chaosKSpring = 0.05;
  chaosDamping = 0.70;
  chaosBrownian = 0.30;
  edgeAlphaOverride = 0.18;
  edgeWidth = 2.0;
  graphWeightScale = 0.8;

  private readonly graphWeightClipLo = 0.15;
  private readonly graphWeightClipHi = 5.0;

  private graphEdges: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private graphWeights = new Float32Array(0);
  private lineVBO = new Float32Array(0);
  private lineAllocated = 0;
  private letterOf: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private letterCount = 0;
  private fontKey: FontKey = 4;

  textCount = 0;
  wsCount = 0;

  private tx = new Float32Array(0);
  private ty = new Float32Array(0);
  private tvx = new Float32Array(0);
  private tvy = new Float32Array(0);
  private ttx = new Float32Array(0);
  private tty = new Float32Array(0);
  private tAccent = new Uint8Array(0);
  private wx = new Float32Array(0);
  private wy = new Float32Array(0);
  private wvx = new Float32Array(0);
  private wvy = new Float32Array(0);
  private wtone = new Float32Array(0);

  private vbo = new Float32Array(0);
  private vboAllocated = 0;

  font: FontSpec = FONTS[4];
  currentText = 'milroc labs';
  textColor: RGB = [244 / 255, 236 / 255, 217 / 255];
  textAccent: RGB = [0, 0, 0];
  wsColor: RGB = [188 / 255, 182 / 255, 169 / 255];

  private mouse = { x: -9999, y: -9999, active: false };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error('webgl unavailable');
    this.gl = gl;
    this.program = createProgram(gl, VS_SRC, FS_SRC);
    this.locPos = gl.getAttribLocation(this.program, 'a_position');
    this.locColor = gl.getAttribLocation(this.program, 'a_color');
    this.locSize = gl.getAttribLocation(this.program, 'a_size');
    this.locRes = gl.getUniformLocation(this.program, 'u_resolution');
    this.lineProgram = createProgram(gl, VS_LINE_SRC, FS_LINE_SRC);
    this.lineLocPos = gl.getAttribLocation(this.lineProgram, 'a_position');
    this.lineLocRes = gl.getUniformLocation(this.lineProgram, 'u_resolution');
    this.lineLocColor = gl.getUniformLocation(this.lineProgram, 'u_color');
    this.buffer = gl.createBuffer();
    this.lineBuffer = gl.createBuffer();

    this.setTextColor('#f4ecd9');
    this.setWhitespaceColor('#bcb6a9');

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (this.W / rect.width);
      this.mouse.y = (e.clientY - rect.top) * (this.H / rect.height);
      this.mouse.active = true;
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouse.active = false; this.mouse.x = -9999; this.mouse.y = -9999;
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.floor(rect.width * dpr);
    this.H = Math.floor(rect.height * dpr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.gl.viewport(0, 0, this.W, this.H);
    if (this.textCount > 0) this.setText(this.currentText);
  }

  setFont(key: FontKey): void {
    this.fontKey = key;
    this.font = FONTS[key];
    this.setText(this.currentText);
  }

  setMode(m: Mode): void {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 'graph') this.buildGraph();
    else this.setText(this.currentText);
  }

  private buildGraph(): void {
    const g = buildGraph(this.currentText, this.font.family, this.font.weight,
      this.W, this.H, this.nodesPerLetter, this.graphK, this.graphKMin);
    const n = g.nodes.length / 2;
    if (n === 0) return;
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const tvx = new Float32Array(n);
    const tvy = new Float32Array(n);
    const ttx = new Float32Array(n);
    const tty = new Float32Array(n);
    const tAccent = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      ttx[i] = g.nodes[i * 2];
      tty[i] = g.nodes[i * 2 + 1];
      tx[i] = ttx[i]; ty[i] = tty[i];
    }
    this.tx = tx; this.ty = ty;
    this.tvx = tvx; this.tvy = tvy;
    this.ttx = ttx; this.tty = tty;
    this.tAccent = tAccent;
    this.textCount = n;
    this.graphEdges = g.edges;
    this.graphWeights = new Float32Array(g.edges.length / 2);
    this.resampleGraphWeights();
    this.letterOf = g.letterOf;
    this.letterCount = g.letterCount;
  }

  resetGraph(): void {
    if (this.mode !== 'graph') return;
    this.buildGraph();
  }

  exportState(): object {
    const nodes = new Array(this.textCount);
    for (let i = 0; i < this.textCount; i++) {
      nodes[i] = [
        Math.round(this.tx[i] * 10) / 10,
        Math.round(this.ty[i] * 10) / 10,
        this.letterOf[i] | 0,
      ];
    }
    const ec = this.graphEdges.length / 2;
    const edges = new Array(ec);
    for (let i = 0; i < ec; i++) {
      edges[i] = [
        this.graphEdges[i * 2] | 0,
        this.graphEdges[i * 2 + 1] | 0,
        Math.round(this.graphWeights[i] * 1000) / 1000,
      ];
    }
    return {
      version: 2,
      capturedAt: new Date().toISOString(),
      font: { key: this.fontKey, family: this.font.family, weight: this.font.weight },
      text: this.currentText,
      params: {
        nodesPerLetter: this.nodesPerLetter,
        kMin: this.graphKMin,
        kMax: this.graphK,
        kDistribution: { type: 'truncatedNormal', lo: this.graphKMin, hi: this.graphK, mean: 'midpoint', std: 'range/4' },
        weightDistribution: { type: 'laplace', mu: 1.0, b: this.graphWeightScale, clip: [this.graphWeightClipLo, this.graphWeightClipHi] },
      },
      canvas: { w: this.W, h: this.H },
      letterCount: this.letterCount,
      nodes,
      edges,
    };
  }

  setNodesPerLetter(n: number): void {
    this.nodesPerLetter = n;
    if (this.mode === 'graph') this.buildGraph();
  }

  setGraphK(k: number): void {
    this.graphK = k;
    if (this.graphKMin > k) this.graphKMin = k;
    if (this.mode === 'graph') this.buildGraph();
  }

  setGraphKMin(k: number): void {
    this.graphKMin = k;
    if (this.graphKMin > this.graphK) this.graphK = this.graphKMin;
    if (this.mode === 'graph') this.buildGraph();
  }

  private resampleGraphWeights(): void {
    const ec = this.graphWeights.length;
    const b = this.graphWeightScale;
    const lo = this.graphWeightClipLo, hi = this.graphWeightClipHi;
    for (let i = 0; i < ec; i++) {
      const u = Math.random() - 0.5;
      const sign = u < 0 ? -1 : 1;
      let w = 1 - b * sign * Math.log(Math.max(1e-9, 1 - 2 * Math.abs(u)));
      if (w < lo) w = lo;
      else if (w > hi) w = hi;
      this.graphWeights[i] = w;
    }
  }

  setWeightScale(b: number): void {
    this.graphWeightScale = b;
    if (this.mode === 'graph' && this.graphWeights.length > 0) this.resampleGraphWeights();
  }

  setTextColor(hex: string): void {
    this.textColor = hexToRGB(hex);
    this.textAccent = computeAccent(hex);
  }

  setWhitespaceColor(hex: string): void {
    this.wsColor = hexToRGB(hex);
  }

  setText(text: string): void {
    this.currentText = text;
    if (this.mode === 'graph') { this.buildGraph(); return; }
    if (this.textCount === 0) return;
    const targets = sampleText(text, this.font.family, this.font.weight, this.W, this.H, this.textCount);
    if (targets.length === 0) return;
    for (let i = 0; i < this.textCount; i++) {
      this.ttx[i] = targets[i * 2];
      this.tty[i] = targets[i * 2 + 1];
    }
  }

  setTextCount(n: number): void {
    if (n === this.textCount) return;
    const oldN = this.textCount;
    const targets = sampleText(this.currentText, this.font.family, this.font.weight, this.W, this.H, n);
    if (targets.length === 0) return;
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const tvx = new Float32Array(n);
    const tvy = new Float32Array(n);
    const ttx = new Float32Array(n);
    const tty = new Float32Array(n);
    const tAccent = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      ttx[i] = targets[i * 2];
      tty[i] = targets[i * 2 + 1];
      if (i < oldN) {
        tx[i] = this.tx[i]; ty[i] = this.ty[i];
        tvx[i] = this.tvx[i]; tvy[i] = this.tvy[i];
        tAccent[i] = this.tAccent[i];
      } else {
        tx[i] = ttx[i] + (Math.random() - 0.5) * this.W * 0.4;
        ty[i] = tty[i] + (Math.random() - 0.5) * this.H * 0.4;
        tAccent[i] = Math.random() < 0.1 ? 1 : 0;
      }
    }
    this.tx = tx; this.ty = ty;
    this.tvx = tvx; this.tvy = tvy;
    this.ttx = ttx; this.tty = tty;
    this.tAccent = tAccent;
    this.textCount = n;
  }

  setWhitespaceCount(n: number): void {
    if (n === this.wsCount) return;
    const oldN = this.wsCount;
    const wx = new Float32Array(n);
    const wy = new Float32Array(n);
    const wvx = new Float32Array(n);
    const wvy = new Float32Array(n);
    const wtone = new Float32Array(n);
    for (let i = 0; i < Math.min(oldN, n); i++) {
      wx[i] = this.wx[i]; wy[i] = this.wy[i];
      wvx[i] = this.wvx[i]; wvy[i] = this.wvy[i];
      wtone[i] = this.wtone[i];
    }
    for (let i = oldN; i < n; i++) {
      wx[i] = Math.random() * this.W;
      wy[i] = Math.random() * this.H;
      wtone[i] = 0.04 + Math.random() * 0.12;
    }
    this.wx = wx; this.wy = wy;
    this.wvx = wvx; this.wvy = wvy;
    this.wtone = wtone;
    this.wsCount = n;
  }

  private ensureVBO(count: number): void {
    const needed = count * 7;
    if (needed > this.vboAllocated) {
      this.vbo = new Float32Array(Math.max(needed, this.vboAllocated * 2 | 0, 7 * 1024));
      this.vboAllocated = this.vbo.length;
    }
  }

  private step(): number {
    const W = this.W, H = this.H;
    const mouseActive = this.mouse.active;
    const mx = this.mouse.x, my = this.mouse.y;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ptSizeBase = this.mode === 'graph'
      ? Math.max(1.0, this.nodeRadius * dpr)
      : Math.max(2.0, 1.6 * dpr);

    // Whitespace physics
    const wn = this.wsCount;
    for (let i = 0; i < wn; i++) {
      let vx = this.wvx[i], vy = this.wvy[i];
      let x = this.wx[i], y = this.wy[i];
      vx += (Math.random() - 0.5) * 0.06;
      vy += (Math.random() - 0.5) * 0.06;
      if (x < 0) vx += 0.4; else if (x > W) vx -= 0.4;
      if (y < 0) vy += 0.4; else if (y > H) vy -= 0.4;
      if (mouseActive) {
        const mdx = x - mx, mdy = y - my;
        const d2 = mdx * mdx + mdy * mdy;
        const radius = 80 * dpr;
        if (d2 < radius * radius && d2 > 0.1) {
          const d = Math.sqrt(d2);
          const force = (radius - d) * 0.025;
          vx += (mdx / d) * force;
          vy += (mdy / d) * force;
        }
      }
      vx *= 0.9; vy *= 0.9;
      this.wvx[i] = vx; this.wvy[i] = vy;
      this.wx[i] = x + vx; this.wy[i] = y + vy;
    }

    // Text physics (chaos jitter, target = letter position).
    const tn = this.textCount;
    const cKBasin = this.chaosKSpring * 0.5;
    const cK = this.chaosKSpring;
    const cBrown = this.chaosBrownian;
    const cDamp = this.chaosDamping;
    for (let i = 0; i < tn; i++) {
      let vx = this.tvx[i], vy = this.tvy[i];
      let x = this.tx[i], y = this.ty[i];
      const tx = this.ttx[i], ty = this.tty[i];
      const dx = tx - x, dy = ty - y;
      const dist2 = dx * dx + dy * dy;
      const springK = dist2 < 36 ? cKBasin : cK;
      vx += dx * springK;
      vy += dy * springK;
      if (mouseActive) {
        const mdx = x - mx, mdy = y - my;
        const d2 = mdx * mdx + mdy * mdy;
        const radius = 100 * dpr;
        if (d2 < radius * radius && d2 > 0.1) {
          const d = Math.sqrt(d2);
          const force = (radius - d) * 0.05;
          vx += (mdx / d) * force;
          vy += (mdy / d) * force;
        }
      }
      vx += (Math.random() - 0.5) * cBrown;
      vy += (Math.random() - 0.5) * cBrown;
      vx *= cDamp; vy *= cDamp;
      this.tvx[i] = vx; this.tvy[i] = vy;
      this.tx[i] = x + vx; this.ty[i] = y + vy;
    }

    return this.packVBO(ptSizeBase);
  }

  private packVBO(ptSizeBase: number): number {
    const wn = this.wsCount, tn = this.textCount;
    const total = wn + tn;
    this.ensureVBO(total);
    const buf = this.vbo;
    let p = 0;
    const [wcR, wcG, wcB] = this.wsColor;
    const [tcR, tcG, tcB] = this.textColor;
    const [acR, acG, acB] = this.textAccent;
    for (let i = 0; i < wn; i++) {
      buf[p++] = this.wx[i]; buf[p++] = this.wy[i];
      buf[p++] = wcR; buf[p++] = wcG; buf[p++] = wcB; buf[p++] = this.wtone[i];
      buf[p++] = ptSizeBase * 0.95;
    }
    for (let i = 0; i < tn; i++) {
      buf[p++] = this.tx[i]; buf[p++] = this.ty[i];
      if (this.tAccent[i]) { buf[p++] = acR; buf[p++] = acG; buf[p++] = acB; }
      else { buf[p++] = tcR; buf[p++] = tcG; buf[p++] = tcB; }
      buf[p++] = 0.96;
      buf[p++] = this.tAccent[i] ? ptSizeBase * 1.4 : ptSizeBase * 1.1;
    }
    return total;
  }

  private packEdges(): number {
    const ec = this.graphEdges.length / 2;
    const needed = ec * 4;
    if (needed > this.lineAllocated) {
      this.lineVBO = new Float32Array(Math.max(needed, this.lineAllocated * 2 | 0, 4 * 256));
      this.lineAllocated = this.lineVBO.length;
    }
    const buf = this.lineVBO;
    let p = 0;
    for (let i = 0; i < ec; i++) {
      const a = this.graphEdges[i * 2];
      const b = this.graphEdges[i * 2 + 1];
      buf[p++] = this.tx[a]; buf[p++] = this.ty[a];
      buf[p++] = this.tx[b]; buf[p++] = this.ty[b];
    }
    return ec * 2;
  }

  draw(): void {
    const total = this.step();
    const gl = this.gl;
    gl.clearColor(58 / 255, 107 / 255, 74 / 255, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (this.mode === 'graph' && this.graphEdges.length > 0) {
      const lineCount = this.packEdges();
      gl.useProgram(this.lineProgram);
      gl.uniform2f(this.lineLocRes!, this.W, this.H);
      const ec = this.graphEdges.length / 2;
      const alpha = this.edgeAlphaOverride > 0
        ? this.edgeAlphaOverride
        : Math.max(0.04, Math.min(0.35, 350 / Math.max(1, Math.sqrt(ec))));
      gl.uniform4f(this.lineLocColor!, this.textColor[0], this.textColor[1], this.textColor[2], alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.lineVBO.subarray(0, lineCount * 2), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lineLocPos);
      gl.vertexAttribPointer(this.lineLocPos, 2, gl.FLOAT, false, 0, 0);
      gl.lineWidth(this.edgeWidth);
      gl.drawArrays(gl.LINES, 0, lineCount);
      gl.disableVertexAttribArray(this.lineLocPos);
    }

    if (total === 0) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.locRes!, this.W, this.H);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vbo.subarray(0, total * 7), gl.DYNAMIC_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(this.locPos);
    gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.locColor);
    gl.vertexAttribPointer(this.locColor, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(this.locSize);
    gl.vertexAttribPointer(this.locSize, 1, gl.FLOAT, false, stride, 6 * 4);
    gl.drawArrays(gl.POINTS, 0, total);
  }
}
