// Production build.
//
// Emits two HTML entries to dist/ for GitHub Pages:
//
//   ./index.html        → dist/index.html      (landing)
//   ./lab/index.html    → dist/lab/index.html  (design playground)

import { rmSync, writeFileSync, cpSync } from 'node:fs';

rmSync('./dist', { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [
    './index.html',
    './lab/index.html',
  ],
  outdir: './dist',
  minify: { whitespace: true, identifiers: true, syntax: true },
  sourcemap: 'linked',
  splitting: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Self-hosted fonts. Linked via <link rel="stylesheet" href="/fonts/fonts.css">
// from each HTML head, so they bypass Bun's CSS bundler (which inlines woff2
// files as base64 data URLs, ballooning the bundle).
cpSync('./fonts', './dist/fonts', { recursive: true });
cpSync('./favicons', './dist/favicons', { recursive: true });
// OG image — copied as-is so the absolute URL in <meta og:image> resolves
// to a real file at the apex (https://milroclabs.com/og.png).
cpSync('./og.png', './dist/og.png');

writeFileSync('./dist/.nojekyll', '');
// Custom domain for GH Pages. Without this, the site lives at
// https://milroc.github.io/milroc-labs/ — which breaks absolute paths
// (/fonts/*, /favicons/*) because they expect to resolve at the apex.
writeFileSync('./dist/CNAME', 'milroclabs.com\n');

for (const out of result.outputs) {
  console.log('  ' + out.path.replace(process.cwd() + '/', ''));
}
