// Local dev server with HMR.
//
// Routes match the production build's HTML outputs:
//
//   /        → ./index.html      (landing)
//   /lab     → ./lab/index.html  (design playground)
//   /lab/    → same

import { serve } from "bun";
import landing from "./index.html";
import lab from "./lab/index.html";

const PORT = Number(process.env.PORT ?? 4319);
const HOST = process.env.HOST ?? "127.0.0.1";

const server = serve({
  port: PORT,
  hostname: HOST,
  routes: {
    "/": landing,
    "/lab": lab,
    "/lab/": lab,
  },
  development: {
    hmr: false,
    console: true,
  },
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = "." + decodeURIComponent(url.pathname);
    const file = Bun.file(path);
    if (await file.exists()) return new Response(file);
    return new Response("not found", { status: 404 });
  },
});

console.log(`  lab        → ${server.url}lab/`);
console.log(`dev server → ${server.url}`);
