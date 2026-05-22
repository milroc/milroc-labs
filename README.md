# Milroc Labs

A one-person studio of projects & consulting work.

The landing page is a generative graph-network visualization of the wordmark "milroc labs". Each letter is rendered as a connected force-graph: nodes sampled from the letter's filled shape, edges drawn via shape-respecting k-nearest-neighbors with line-of-sight pruning, per-edge weights sampled from a kurtotic Laplace distribution, and a small spring-and-Brownian physics loop running on the GPU via WebGL.

## Develop

```sh
bun install
bun run dev    # http://127.0.0.1:4319
```

Routes:

- `/` → landing page (fullscreen generative canvas)
- `/lab/` → design playground (sliders for every parameter)

## Build

```sh
bun run build  # → dist/
```

## Deploy

Pushes to `main` are deployed to GitHub Pages via `.github/workflows/deploy.yml`. The workflow runs `bun run build` and uploads `dist/` as the Pages artifact.

## Structure

```
.
├── index.html              # landing shell
├── lab/index.html          # lab shell
├── src/
│   ├── landing.ts          # landing entry + WebGL renderer
│   ├── landing.module.css
│   ├── lab.ts              # lab entry + DOM + UI wiring
│   ├── lab.module.css
│   ├── gl-field.ts         # lab's WebGL particle/graph field
│   ├── fav-render.ts       # lab's animated Canvas 2D favicon previews
│   ├── fav-builder.ts      # lab's static WebGL favicon builder + PNG export
│   └── lib/
│       ├── color.ts        # hexToRGB + computeAccent
│       ├── fonts.ts        # font catalog for the lab
│       ├── graph.ts        # buildGraph + truncatedNormalInt
│       ├── load-fonts.ts   # runtime <link> injection (see note below)
│       ├── sample-text.ts  # sampleText (dot mode)
│       └── webgl.ts        # compileShader + createProgram
├── fonts/                  # self-hosted woff2s + fonts.css
├── favicons/               # PNG + SVG favicons (committed; linked from HTML)
├── scripts/
│   └── render-favicon.ts   # headless render → favicons/ (Bun + @napi-rs/canvas)
├── dev.ts                  # Bun fullstack dev server
├── build.ts                # Bun.build → dist/
└── .github/workflows/deploy.yml
```

## Configuration

The landing visualization's locked defaults live in the `CONFIG` object at the top of `src/landing.ts`. To re-tune:

1. Open `/lab/` in a browser.
2. Drag sliders until the layout feels right.
3. Copy the values into `CONFIG` in `src/landing.ts`.

## Favicons

PNGs (16/32/48/64/128/180/192/256/512) and an SVG live in `favicons/`. The HTML pages link the 16/32/180 PNGs. To regenerate from the same `buildGraph` algorithm the lab uses (with current settings hardcoded at the top of the script):

```sh
bun run render-favicon
```

The lab's "Favicon Builder" panel offers an interactive version with on-the-fly param tweaking and per-size PNG download from the browser.

## Tech

- Bun for dev + build (no Webpack, no Vite).
- TypeScript, vanilla WebGL (no Three.js, no D3, no React).
- CSS Modules per page (`*.module.css`).
- Self-hosted fonts in `fonts/` — latin subset, ~260KB total. Variable fonts for Inter, Space Grotesk, Playfair Display, Fraunces; static weights for Cormorant Garamond and IBM Plex Mono.

## Notes

The fonts stylesheet is linked at runtime by `src/lib/load-fonts.ts` instead of via a static `<link>` in HTML. Reason: Bun's HTML bundler walks every `<link>` (any `rel`, including `preload`), follows the linked CSS, and inlines the `url(...)` woff2 references as base64 data URLs. That blew the CSS bundle past 1.5MB. Injecting the link via JS keeps `fonts/fonts.css` and its woff2 references outside Bun's resolution graph; the browser fetches them as ordinary static files at runtime.

## License

MIT. See LICENSE.
