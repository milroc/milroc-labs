// Inject the self-hosted fonts.css link at runtime. We can't put a static
// <link> in the HTML head because Bun's HTML bundler walks every <link>
// (any rel value, including "preload") and tries to resolve the woff2
// URLs inside the linked CSS, inlining them as base64 data URLs and
// ballooning the bundle. Building the link in JS keeps fonts.css and its
// woff2 references outside Bun's resolution graph.
export function loadFonts(): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/fonts/fonts.css';
  document.head.appendChild(link);
}
