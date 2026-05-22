// Milroc Labs — graph-text visualization (production landing).
// Locked configuration: Space Grotesk, "milroc labs", 440 nodes/letter,
// k ∈ N(15, 0.5) on [14, 16], Laplace weight var b=0.8, no FDG.

import './landing.module.css';
import { hexToRGB, type RGB } from './lib/color';
import { buildGraph } from './lib/graph';
import { loadFonts } from './lib/load-fonts';
import { createProgram } from './lib/webgl';

loadFonts();

const CONFIG = {
  font: { family: "'Space Grotesk Variable',sans-serif", weight: 700 },
  kMin: 18,
  kMax: 24,
  textColor: '#f4ecd9',
  bgColor: '#3a6b4a',
  nodeRadius: 1.0,
  edgeAlpha: 0.18,
  edgeWidth: 2.0,
  chaos: { springK: 0.05, basinK: 0.025, damping: 0.70, brownian: 0.30 },
  mouse: { radius: 100, force: 0.05 },
};

// "milroc labs" naturally typesets ~5:1. Below this viewport aspect, the
// single line gets too small — break to two stacked lines.
const TWO_LINE_ASPECT = 1.6;

function pickText(w: number, h: number): string {
  return w / h < TWO_LINE_ASPECT ? 'milroc\nlabs' : 'milroc labs';
}

// Mobile GPUs choke on ~5k nodes + edge updates per frame. Scale density
// with the smaller viewport dimension so phones get a lighter graph.
function pickNodesPerLetter(w: number, h: number): number {
  const minDim = Math.min(w, h);
  if (minDim < 480) return 200;
  if (minDim < 768) return 300;
  return 440;
}

const VS = `
attribute vec2 a_position;
attribute float a_size;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
}`;
const FS = `
precision mediump float;
uniform vec3 u_color;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float aa = 1.0 - smoothstep(0.78, 1.0, d);
  gl_FragColor = vec4(u_color, 0.96 * aa);
}`;
const VS_LINE = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;
const FS_LINE = `
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

class Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private lineProg: WebGLProgram;
  private aPos: number; private aSize: number;
  private uRes: WebGLUniformLocation | null; private uCol: WebGLUniformLocation | null;
  private lAPos: number;
  private lURes: WebGLUniformLocation | null; private lUCol: WebGLUniformLocation | null;
  private pointBuf: WebGLBuffer | null; private lineBuf: WebGLBuffer | null;

  private textColor: RGB;
  private bg: RGB;
  private W = 2; private H = 2; private dpr = 1;

  private tx = new Float32Array(0); private ty = new Float32Array(0);
  private tvx = new Float32Array(0); private tvy = new Float32Array(0);
  private ttx = new Float32Array(0); private tty = new Float32Array(0);
  private edges: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private n = 0;

  private pointVBO = new Float32Array(0);
  private lineVBO = new Float32Array(0);
  private pointAlloc = 0;
  private lineAlloc = 0;

  private mouse = { x: -9999, y: -9999, active: false };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false });
    if (!gl) throw new Error('webgl unavailable');
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.aPos = gl.getAttribLocation(this.prog, 'a_position');
    this.aSize = gl.getAttribLocation(this.prog, 'a_size');
    this.uRes = gl.getUniformLocation(this.prog, 'u_resolution');
    this.uCol = gl.getUniformLocation(this.prog, 'u_color');
    this.lineProg = createProgram(gl, VS_LINE, FS_LINE);
    this.lAPos = gl.getAttribLocation(this.lineProg, 'a_position');
    this.lURes = gl.getUniformLocation(this.lineProg, 'u_resolution');
    this.lUCol = gl.getUniformLocation(this.lineProg, 'u_color');
    this.pointBuf = gl.createBuffer();
    this.lineBuf = gl.createBuffer();

    this.textColor = hexToRGB(CONFIG.textColor);
    this.bg = hexToRGB(CONFIG.bgColor);

    const setFromClient = (clientX: number, clientY: number): void => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (clientX - rect.left) * (this.W / rect.width);
      this.mouse.y = (clientY - rect.top) * (this.H / rect.height);
      this.mouse.active = true;
    };
    const clearPointer = (): void => {
      this.mouse.active = false; this.mouse.x = -9999; this.mouse.y = -9999;
    };
    canvas.addEventListener('mousemove', (e) => setFromClient(e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', clearPointer);
    const onTouch = (e: TouchEvent): void => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      setFromClient(t.clientX, t.clientY);
    };
    canvas.addEventListener('touchstart', onTouch, { passive: true });
    canvas.addEventListener('touchmove', onTouch, { passive: true });
    canvas.addEventListener('touchend', clearPointer);
    canvas.addEventListener('touchcancel', clearPointer);

    this.resize();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { this.resize(); this.rebuild(); }, 120);
    });
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(2, Math.floor(window.innerWidth * dpr));
    this.H = Math.max(2, Math.floor(window.innerHeight * dpr));
    this.dpr = dpr;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.gl.viewport(0, 0, this.W, this.H);
  }

  rebuild(): void {
    const text = pickText(window.innerWidth, window.innerHeight);
    const npl = pickNodesPerLetter(window.innerWidth, window.innerHeight);
    const g = buildGraph(text, CONFIG.font.family, CONFIG.font.weight,
      this.W, this.H, npl, CONFIG.kMax, CONFIG.kMin);
    const n = g.nodes.length / 2;
    if (n === 0) return;
    this.n = n;
    this.tx = new Float32Array(n); this.ty = new Float32Array(n);
    this.tvx = new Float32Array(n); this.tvy = new Float32Array(n);
    this.ttx = new Float32Array(n); this.tty = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ttx[i] = g.nodes[i * 2];
      this.tty[i] = g.nodes[i * 2 + 1];
      this.tx[i] = this.ttx[i];
      this.ty[i] = this.tty[i];
    }
    this.edges = g.edges;
  }

  private step(): void {
    const mA = this.mouse.active;
    const mx = this.mouse.x, my = this.mouse.y;
    const C = CONFIG.chaos;
    const mR = CONFIG.mouse.radius * this.dpr;
    const mR2 = mR * mR;
    const mF = CONFIG.mouse.force;
    for (let i = 0; i < this.n; i++) {
      let vx = this.tvx[i], vy = this.tvy[i];
      let x = this.tx[i], y = this.ty[i];
      const tx = this.ttx[i], ty = this.tty[i];
      const dx = tx - x, dy = ty - y;
      const dist2 = dx * dx + dy * dy;
      const k = dist2 < 36 ? C.basinK : C.springK;
      vx += dx * k; vy += dy * k;
      if (mA) {
        const mdx = x - mx, mdy = y - my;
        const d2 = mdx * mdx + mdy * mdy;
        if (d2 < mR2 && d2 > 0.1) {
          const d = Math.sqrt(d2);
          const f = (mR - d) * mF;
          vx += (mdx / d) * f; vy += (mdy / d) * f;
        }
      }
      vx += (Math.random() - 0.5) * C.brownian;
      vy += (Math.random() - 0.5) * C.brownian;
      vx *= C.damping; vy *= C.damping;
      this.tvx[i] = vx; this.tvy[i] = vy;
      this.tx[i] = x + vx; this.ty[i] = y + vy;
    }
  }

  draw(): void {
    if (this.n === 0) return;
    this.step();
    const gl = this.gl;
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Lines
    const ec = this.edges.length / 2;
    if (ec > 0) {
      const needed = ec * 4;
      if (needed > this.lineAlloc) {
        this.lineVBO = new Float32Array(Math.max(needed, this.lineAlloc * 2 | 0, 1024));
        this.lineAlloc = this.lineVBO.length;
      }
      const buf = this.lineVBO;
      let p = 0;
      for (let i = 0; i < ec; i++) {
        const a = this.edges[i * 2], b = this.edges[i * 2 + 1];
        buf[p++] = this.tx[a]; buf[p++] = this.ty[a];
        buf[p++] = this.tx[b]; buf[p++] = this.ty[b];
      }
      gl.useProgram(this.lineProg);
      gl.uniform2f(this.lURes!, this.W, this.H);
      gl.uniform4f(this.lUCol!, this.textColor[0], this.textColor[1], this.textColor[2], CONFIG.edgeAlpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.lineVBO.subarray(0, ec * 4), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lAPos);
      gl.vertexAttribPointer(this.lAPos, 2, gl.FLOAT, false, 0, 0);
      gl.lineWidth(CONFIG.edgeWidth);
      gl.drawArrays(gl.LINES, 0, ec * 2);
      gl.disableVertexAttribArray(this.lAPos);
    }

    // Points
    const ptSize = Math.max(1.0, CONFIG.nodeRadius * this.dpr);
    const pNeeded = this.n * 3;
    if (pNeeded > this.pointAlloc) {
      this.pointVBO = new Float32Array(Math.max(pNeeded, this.pointAlloc * 2 | 0, 1024));
      this.pointAlloc = this.pointVBO.length;
    }
    const pbuf = this.pointVBO;
    let p = 0;
    for (let i = 0; i < this.n; i++) {
      pbuf[p++] = this.tx[i];
      pbuf[p++] = this.ty[i];
      pbuf[p++] = ptSize;
    }
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes!, this.W, this.H);
    gl.uniform3f(this.uCol!, this.textColor[0], this.textColor[1], this.textColor[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pointVBO.subarray(0, this.n * 3), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(this.aSize);
    gl.vertexAttribPointer(this.aSize, 1, gl.FLOAT, false, 3 * 4, 2 * 4);
    gl.drawArrays(gl.POINTS, 0, this.n);
  }
}

document.fonts.ready.then(() => {
  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  const r = new Renderer(canvas);
  r.rebuild();
  const loop = (): void => { r.draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
