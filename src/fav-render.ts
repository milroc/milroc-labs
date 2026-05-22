// Favicon-sized previews. Canvas 2D + chaos physics on a small dot field.

import { sampleText } from './lib/sample-text';
import { FONTS, type FontKey, type FontSpec } from './lib/fonts';

type Particle = { x: number; y: number; vx: number; vy: number; tx: number; ty: number };

export class FavRender {
  private ctx: CanvasRenderingContext2D;
  private W: number; private H: number;
  private font: FontSpec;
  private currentText = 'M';
  private particles: Particle[] = [];
  private n: number;

  constructor(canvas: HTMLCanvasElement, fontKey: FontKey) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.W = canvas.width;
    this.H = canvas.height;
    this.font = FONTS[fontKey];
    this.n = canvas.width === 32 ? 60 : canvas.width === 64 ? 200 : 500;
    this.setText('M');
    this.step = this.step.bind(this);
    requestAnimationFrame(this.step);
  }

  setFont(key: FontKey): void {
    this.font = FONTS[key];
    this.setText(this.currentText);
  }

  setText(text: string): void {
    this.currentText = text;
    const targets = sampleText(text, this.font.family, this.font.weight, this.W, this.H, this.n);
    if (targets.length === 0) return;
    if (this.particles.length === 0) {
      for (let i = 0; i < this.n; i++) {
        this.particles.push({
          x: targets[i * 2] + (Math.random() - 0.5) * this.W * 0.3,
          y: targets[i * 2 + 1] + (Math.random() - 0.5) * this.H * 0.3,
          vx: 0, vy: 0,
          tx: targets[i * 2], ty: targets[i * 2 + 1],
        });
      }
    } else {
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].tx = targets[(i % this.n) * 2];
        this.particles[i].ty = targets[(i % this.n) * 2 + 1];
      }
    }
  }

  private step(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#3a6b4a';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#f4ecd9';
    for (const p of this.particles) {
      p.vx += (p.tx - p.x) * 0.014 + (Math.random() - 0.5) * 0.08;
      p.vy += (p.ty - p.y) * 0.014 + (Math.random() - 0.5) * 0.08;
      p.vx *= 0.82; p.vy *= 0.82;
      p.x += p.vx; p.y += p.vy;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(this.step);
  }
}
