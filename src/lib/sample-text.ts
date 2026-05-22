// Sample dark pixels from a text rendering on an offscreen 2D canvas.
// Returns a flat Float32Array of [x, y, x, y, …] target points (canvas coords).
export function sampleText(text: string, fontFamily: string, fontWeight: number, w: number, h: number, n: number): Float32Array {
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) return new Float32Array(0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const maxW = w * 0.86;
  const maxH = h * 0.72;
  let size = Math.min(h * 0.78, w * 0.78);
  ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
  let metrics = ctx.measureText(text);
  while ((metrics.width > maxW || size > maxH) && size > 6) {
    size *= 0.95;
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    metrics = ctx.measureText(text);
  }
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, (w - metrics.width) / 2, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  const dark: number[] = [];
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 80000)));
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * 4;
      if (data[i] < 60) dark.push(x, y);
    }
  }
  if (dark.length === 0) return new Float32Array(0);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const idx = (Math.random() * (dark.length / 2)) | 0;
    out[i * 2] = dark[idx * 2] + (Math.random() - 0.5) * 1.6;
    out[i * 2 + 1] = dark[idx * 2 + 1] + (Math.random() - 0.5) * 1.6;
  }
  return out;
}
