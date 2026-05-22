// Static favicon builder. Renders a single "M" using the same params the
// lab applies to the main canvas (mode, font, count, k, weight, radius,
// edge alpha/width, text color), then downloads scaled PNG copies at
// common favicon sizes. Source canvas is 512×512 for crisp downsampling.

import { hexToRGB, type RGB } from './lib/color';
import { buildGraph } from './lib/graph';
import { sampleText } from './lib/sample-text';
import { createProgram } from './lib/webgl';
import type { FontSpec } from './lib/fonts';

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

const SRC = 512;

export type FavConfig = {
  mode: 'dots' | 'graph';
  font: FontSpec;
  textColor: string;
  bgColor: string;
  nodes: number;       // textCount in dots mode, nodesPerLetter in graph mode
  k: number;
  kMin: number;
  nodeRadius: number;
  edgeAlpha: number;   // 0 → auto
  edgeWidth: number;
};

export class FavBuilder {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private lineProg: WebGLProgram;
  private aPos: number; private aSize: number;
  private uRes: WebGLUniformLocation | null;
  private uCol: WebGLUniformLocation | null;
  private lAPos: number;
  private lURes: WebGLUniformLocation | null;
  private lUCol: WebGLUniformLocation | null;
  private buffer: WebGLBuffer | null;
  private lineBuffer: WebGLBuffer | null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = SRC;
    canvas.height = SRC;
    // preserveDrawingBuffer so toBlob() / drawImage see the rendered pixels
    // after a single static draw.
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
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
    this.buffer = gl.createBuffer();
    this.lineBuffer = gl.createBuffer();
    gl.viewport(0, 0, SRC, SRC);
  }

  render(cfg: FavConfig): void {
    const gl = this.gl;
    const bg = hexToRGB(cfg.bgColor);
    const fg = hexToRGB(cfg.textColor);
    gl.clearColor(bg[0], bg[1], bg[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (cfg.mode === 'graph') this.renderGraph(cfg, fg);
    else this.renderDots(cfg, fg);
  }

  private renderGraph(cfg: FavConfig, fg: RGB): void {
    const g = buildGraph('m', cfg.font.family, cfg.font.weight, SRC, SRC, cfg.nodes, cfg.k, cfg.kMin);
    const n = g.nodes.length / 2;
    if (n === 0) return;
    const gl = this.gl;

    // Edges.
    const ec = g.edges.length / 2;
    if (ec > 0) {
      const lvbo = new Float32Array(ec * 4);
      let p = 0;
      for (let i = 0; i < ec; i++) {
        const a = g.edges[i * 2], b = g.edges[i * 2 + 1];
        lvbo[p++] = g.nodes[a * 2]; lvbo[p++] = g.nodes[a * 2 + 1];
        lvbo[p++] = g.nodes[b * 2]; lvbo[p++] = g.nodes[b * 2 + 1];
      }
      const alpha = cfg.edgeAlpha > 0
        ? cfg.edgeAlpha
        : Math.max(0.04, Math.min(0.35, 350 / Math.max(1, Math.sqrt(ec))));
      gl.useProgram(this.lineProg);
      gl.uniform2f(this.lURes!, SRC, SRC);
      gl.uniform4f(this.lUCol!, fg[0], fg[1], fg[2], alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, lvbo, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.lAPos);
      gl.vertexAttribPointer(this.lAPos, 2, gl.FLOAT, false, 0, 0);
      gl.lineWidth(cfg.edgeWidth);
      gl.drawArrays(gl.LINES, 0, ec * 2);
      gl.disableVertexAttribArray(this.lAPos);
    }

    // Nodes.
    const ptSize = Math.max(1.0, cfg.nodeRadius * (SRC / 256));
    const vbo = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      vbo[i * 3] = g.nodes[i * 2];
      vbo[i * 3 + 1] = g.nodes[i * 2 + 1];
      vbo[i * 3 + 2] = ptSize;
    }
    this.drawPoints(vbo, n, fg);
  }

  private renderDots(cfg: FavConfig, fg: RGB): void {
    const targets = sampleText('m', cfg.font.family, cfg.font.weight, SRC, SRC, cfg.nodes);
    const n = targets.length / 2;
    if (n === 0) return;
    // Same point sizing the lab uses in dots mode, scaled to the 512 canvas.
    const ptSize = Math.max(2.0, 1.6 * (SRC / 256));
    const vbo = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      vbo[i * 3] = targets[i * 2];
      vbo[i * 3 + 1] = targets[i * 2 + 1];
      vbo[i * 3 + 2] = ptSize;
    }
    this.drawPoints(vbo, n, fg);
  }

  private drawPoints(vbo: Float32Array, n: number, fg: RGB): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes!, SRC, SRC);
    gl.uniform3f(this.uCol!, fg[0], fg[1], fg[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vbo, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(this.aSize);
    gl.vertexAttribPointer(this.aSize, 1, gl.FLOAT, false, 3 * 4, 2 * 4);
    gl.drawArrays(gl.POINTS, 0, n);
  }

  download(size: number): void {
    const scaled = document.createElement('canvas');
    scaled.width = size;
    scaled.height = size;
    const ctx = scaled.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, size, size);
    scaled.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `favicon-${size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}
