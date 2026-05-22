export type RGB = [number, number, number];

export function hexToRGB(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Accent particles get a contrasting hue from the site's palette. When the
// text color IS the forest accent, fall back to ink so accent particles
// still pop.
export function computeAccent(textHex: string): RGB {
  if (textHex.toLowerCase() === '#3a6b4a') return hexToRGB('#111111');
  return hexToRGB('#3a6b4a');
}
