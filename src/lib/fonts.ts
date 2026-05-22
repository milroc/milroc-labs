export type FontKey = 1 | 2 | 3 | 4 | 5;
export type FontSpec = { family: string; weight: number; label: string };

export const FONTS: Record<FontKey, FontSpec> = {
  1: { family: "'Cormorant Garamond',serif", weight: 700, label: 'Cormorant Garamond 700' },
  2: { family: "'IBM Plex Mono',monospace", weight: 700, label: 'IBM Plex Mono 700' },
  3: { family: "'Playfair Display Variable',serif", weight: 900, label: 'Playfair Display 900' },
  4: { family: "'Space Grotesk Variable',sans-serif", weight: 700, label: 'Space Grotesk 700' },
  5: { family: "'Fraunces Variable',serif", weight: 900, label: 'Fraunces 900' },
};
