// Generative monogram lab — design playground.
// Mounts the controls + canvas DOM, wires sliders/buttons to a GLField,
// and animates per-size favicon previews from the same text+font params.

import s from './lab.module.css';
import { GLField } from './gl-field';
import { FavRender } from './fav-render';
import { FavBuilder } from './fav-builder';
import { FONTS, type FontKey } from './lib/fonts';
import { loadFonts } from './lib/load-fonts';

loadFonts();

function mount(): void {
  document.body.innerHTML = `
    <header class="${s.header}">
      <h1 class="${s.title}">Generative monogram lab — WebGL</h1>
      <p class="${s.sub}">single canvas · gl.POINTS · CPU physics + GPU draw</p>
    </header>

    <div class="${s.controls}">
      <span class="${s.lbl}">FONT</span>
      <div class="${s.group}">
        <button class="${s.btn} font-btn" data-font="1">Cormorant</button>
        <button class="${s.btn} font-btn" data-font="2">Plex Mono</button>
        <button class="${s.btn} font-btn" data-font="3">Playfair</button>
        <button class="${s.btn} font-btn active" data-font="4">Space Grotesk</button>
        <button class="${s.btn} font-btn" data-font="5">Fraunces</button>
      </div>
      <span class="${s.divider}"></span>
      <span class="${s.lbl}">TEXT</span>
      <div class="${s.group}">
        <button class="${s.btn} text-btn" data-text="M">M</button>
        <button class="${s.btn} text-btn" data-text="Milroc">Milroc</button>
        <button class="${s.btn} text-btn" data-text="milroc">milroc</button>
        <button class="${s.btn} text-btn" data-text="Milroc Labs">Milroc Labs</button>
        <button class="${s.btn} text-btn active" data-text="milroc labs">milroc labs</button>
        <input id="text-input" class="${s.textInput}" type="text" placeholder="type custom…" maxlength="40" />
      </div>
      <span class="${s.divider}"></span>
      <span class="${s.lbl}">MODE</span>
      <div class="${s.group}">
        <button class="${s.btn} mode-btn active" data-mode="dots">Dots</button>
        <button class="${s.btn} mode-btn" data-mode="graph">Graph</button>
      </div>
      <span class="${s.divider}"></span>
      <span class="${s.lbl}" id="count-lbl">DOTS</span>
      <input id="count-slider" type="range" min="100" max="50000" step="100" value="20000" />
      <span id="count-value" class="${s.countReadout}">20,000</span>
      <span class="${s.divider} graph-only" hidden></span>
      <span class="${s.lbl} graph-only" hidden title="Lower bound of the truncated-normal degree distribution">MIN EDGES/NODE</span>
      <input id="kmin-slider" class="graph-only" type="range" min="1" max="16" step="1" value="1" hidden />
      <span id="kmin-value" class="${s.countReadout} graph-only" hidden>1</span>
      <span class="${s.lbl} graph-only" hidden title="Per-node degree is drawn from a truncated normal in [MIN, MAX]">MAX EDGES/NODE</span>
      <input id="k-slider" class="graph-only" type="range" min="1" max="16" step="1" value="3" hidden />
      <span id="k-value" class="${s.countReadout} graph-only" hidden>3</span>
      <span class="${s.divider} graph-only" hidden></span>
      <span class="${s.lbl} graph-only" hidden title="Laplace scale parameter">WEIGHT VAR</span>
      <input id="wscale-slider" class="graph-only" type="range" min="0" max="1.5" step="0.05" value="0.8" hidden />
      <span id="wscale-value" class="${s.countReadout} graph-only" hidden>0.80</span>
      <span class="${s.divider} graph-only" hidden></span>
      <span class="${s.lbl} graph-only" hidden>NODE RADIUS</span>
      <input id="radius-slider" class="graph-only" type="range" min="0.5" max="12" step="0.1" value="3.5" hidden />
      <span id="radius-value" class="${s.countReadout} graph-only" hidden>3.5</span>
      <span class="${s.divider} graph-only" hidden></span>
      <button id="export-btn" class="${s.actionBtn} secondary graph-only" hidden>Copy graph state</button>
      <button id="reset-btn" class="${s.actionBtn} secondary graph-only" hidden>Reset</button>
      <span class="${s.divider}"></span>
      <span class="${s.lbl}">TEXT COLOR</span>
      <div class="${s.swatchRow}" id="text-swatches">
        <button class="${s.swatch}" data-color="#111111" style="background-color:#111111" title="Ink #111111"></button>
        <button class="${s.swatch} active" data-color="#3a6b4a" style="background-color:#3a6b4a" title="Forest #3a6b4a"></button>
        <button class="${s.swatch}" data-color="#6b6b6b" style="background-color:#6b6b6b" title="Muted #6b6b6b"></button>
        <button class="${s.swatch}" data-color="#1c1f1a" style="background-color:#1c1f1a" title="Canvas #1c1f1a"></button>
        <input class="${s.colorPicker}" id="text-picker" type="color" value="#3a6b4a" />
      </div>
    </div>

    <div class="${s.controls}">
      <label class="${s.toggle}">
        <input id="whitespace-toggle" type="checkbox" checked />
        <span class="${s.lbl}">WHITESPACE</span>
      </label>
      <input id="ws-slider" type="range" min="0" max="1000000" step="2000" value="536000" />
      <span id="ws-value" class="${s.countReadout}">536,000</span>
      <span class="${s.divider}"></span>
      <span class="${s.lbl}">WS COLOR</span>
      <div class="${s.swatchRow}" id="ws-swatches">
        <button class="${s.swatch}" data-color="#3a6b4a" style="background-color:#3a6b4a"></button>
        <button class="${s.swatch}" data-color="#111111" style="background-color:#111111"></button>
        <button class="${s.swatch}" data-color="#1c1f1a" style="background-color:#1c1f1a"></button>
        <button class="${s.swatch} active" data-color="#bcb6a9" data-tone="light" style="background-color:#bcb6a9"></button>
        <input class="${s.colorPicker}" id="ws-picker" type="color" value="#bcb6a9" />
      </div>
    </div>

    <div class="${s.controls} ${s.advControls} graph-only" id="adv-controls" hidden>
      <span class="${s.sectionLbl}">CHAOS</span>
      <span class="${s.lblSmall}">spring</span>
      <input id="cspring-slider" type="range" min="0.001" max="0.1" step="0.0005" value="0.05" />
      <span id="cspring-value" class="${s.countReadout}">0.0500</span>
      <span class="${s.lblSmall}">damping</span>
      <input id="cdamp-slider" type="range" min="0.4" max="0.99" step="0.01" value="0.70" />
      <span id="cdamp-value" class="${s.countReadout}">0.70</span>
      <span class="${s.lblSmall}">jitter</span>
      <input id="cjit-slider" type="range" min="0" max="1.5" step="0.02" value="0.30" />
      <span id="cjit-value" class="${s.countReadout}">0.30</span>
      <span class="${s.divider}"></span>
      <span class="${s.sectionLbl}">EDGE</span>
      <span class="${s.lblSmall}">alpha</span>
      <input id="ealpha-slider" type="range" min="0" max="1" step="0.02" value="0.18" />
      <span id="ealpha-value" class="${s.countReadout}">0.18</span>
      <span class="${s.lblSmall}">width</span>
      <input id="ewidth-slider" type="range" min="0.5" max="8" step="0.5" value="2.0" />
      <span id="ewidth-value" class="${s.countReadout}">2.0</span>
    </div>

    <div class="${s.stageWrap}">
      <div class="${s.stage}" id="stage">
        <canvas id="gl-canvas"></canvas>
        <span class="${s.fps}" id="fps">— fps</span>
      </div>
    </div>
    <div id="toast" class="${s.toast}"></div>

    <div class="${s.meta}">
      <div class="${s.previewRow}">
        <span class="${s.pl}">FAVICON</span>
        <canvas class="${s.favCanvas}" id="fav-32" width="32" height="32"></canvas>
        <span class="${s.pl}">64PX</span>
        <canvas class="${s.favCanvas}" id="fav-64" width="64" height="64"></canvas>
        <span class="${s.pl}">128PX</span>
        <canvas class="${s.favCanvas}" id="fav-128" width="128" height="128"></canvas>
      </div>
      <div class="${s.statRow}">
        <span>total particles: <b id="stat-total">3,000</b></span>
        <span>·</span>
        <span>text: <b id="stat-text">3,000</b></span>
        <span>·</span>
        <span>whitespace: <b id="stat-ws">0</b></span>
      </div>
    </div>

    <div class="${s.previewRow}" style="margin-top:18px;max-width:1200px;margin-left:auto;margin-right:auto;">
      <span class="${s.pl}">FAVICON BUILDER · STATIC m</span>
      <canvas class="${s.favCanvas}" id="fav-builder" style="width:128px;height:128px"></canvas>
      <span class="${s.pl}">DOWNLOAD</span>
      <button class="${s.btn} fav-dl" data-size="16">16</button>
      <button class="${s.btn} fav-dl" data-size="32">32</button>
      <button class="${s.btn} fav-dl" data-size="48">48</button>
      <button class="${s.btn} fav-dl" data-size="64">64</button>
      <button class="${s.btn} fav-dl" data-size="128">128</button>
      <button class="${s.btn} fav-dl" data-size="180">180</button>
      <button class="${s.btn} fav-dl" data-size="512">512</button>
    </div>
  `;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

document.fonts.ready.then(() => {
  mount();

  const canvas = el<HTMLCanvasElement>('gl-canvas');
  const field = new GLField(canvas);
  field.setTextCount(20000);
  field.setText('milroc labs');
  field.setWhitespaceCount(536000);

  const fav32 = new FavRender(el<HTMLCanvasElement>('fav-32'), 4);
  const fav64 = new FavRender(el<HTMLCanvasElement>('fav-64'), 4);
  const fav128 = new FavRender(el<HTMLCanvasElement>('fav-128'), 4);
  const favs = [fav32, fav64, fav128];
  favs.forEach(f => f.setText('milroc labs'));

  // Static favicon builder — single "M" rendered with the lab's current
  // mode/font/count/k/weight/radius/edge/color params.
  const favBuilder = new FavBuilder(el<HTMLCanvasElement>('fav-builder'));
  let currentFontKey: FontKey = 4;
  let currentTextHex = '#f4ecd9';
  const renderFavicon = (): void => {
    favBuilder.render({
      mode: field.mode,
      font: FONTS[currentFontKey],
      textColor: currentTextHex,
      bgColor: '#3a6b4a',
      nodes: field.mode === 'graph' ? field.nodesPerLetter : field.textCount,
      k: field.graphK,
      kMin: field.graphKMin,
      nodeRadius: field.nodeRadius,
      edgeAlpha: field.edgeAlphaOverride,
      edgeWidth: field.edgeWidth,
    });
  };
  renderFavicon();
  document.querySelectorAll<HTMLButtonElement>('.fav-dl').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = +btn.getAttribute('data-size')!;
      favBuilder.download(size);
    });
  });

  // Render loop with fps readout.
  const fpsEl = el<HTMLSpanElement>('fps');
  let lastT = performance.now();
  let acc = 0, accFrames = 0;
  function loop(now: number): void {
    const dt = now - lastT;
    lastT = now;
    acc += dt; accFrames++;
    if (acc > 500) {
      const fps = (1000 * accFrames / acc).toFixed(0);
      fpsEl.textContent = `${fps} fps`;
      acc = 0; accFrames = 0;
    }
    field.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Stats.
  const statTotal = el<HTMLElement>('stat-total');
  const statText = el<HTMLElement>('stat-text');
  const statWs = el<HTMLElement>('stat-ws');
  const updateStats = (): void => {
    statText.textContent = field.textCount.toLocaleString();
    statWs.textContent = field.wsCount.toLocaleString();
    statTotal.textContent = (field.textCount + field.wsCount).toLocaleString();
  };

  // Text buttons.
  const textInput = el<HTMLInputElement>('text-input');
  document.querySelectorAll<HTMLButtonElement>('.text-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.text-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const text = btn.getAttribute('data-text')!;
      textInput.value = '';
      field.setText(text);
      favs.forEach(f => f.setText(text));
    });
  });

  // Free-form text input (debounced).
  let textTimer: ReturnType<typeof setTimeout> | null = null;
  textInput.addEventListener('input', () => {
    const v = textInput.value;
    if (textTimer) clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      if (v.trim().length === 0) return;
      document.querySelectorAll('.text-btn').forEach(b => b.classList.remove('active'));
      field.setText(v);
      favs.forEach(f => f.setText(v));
    }, 180);
  });

  // Font buttons.
  document.querySelectorAll<HTMLButtonElement>('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = +btn.getAttribute('data-font')! as FontKey;
      field.setFont(key);
      favs.forEach(f => f.setFont(key));
      currentFontKey = key;
      renderFavicon();
    });
  });

  // Count slider (dots or nodes-per-letter depending on mode).
  const countSlider = el<HTMLInputElement>('count-slider');
  const countValue = el<HTMLElement>('count-value');
  const countLabel = el<HTMLElement>('count-lbl');
  countSlider.addEventListener('input', e => {
    const n = +(e.target as HTMLInputElement).value;
    countValue.textContent = n.toLocaleString();
    if (field.mode === 'graph') field.setNodesPerLetter(n);
    else field.setTextCount(n);
    updateStats();
    renderFavicon();
  });

  // Mode buttons.
  const kSlider = el<HTMLInputElement>('k-slider');
  const kValue = el<HTMLElement>('k-value');
  const kMinSlider = el<HTMLInputElement>('kmin-slider');
  const kMinValue = el<HTMLElement>('kmin-value');
  const wsToggle = el<HTMLInputElement>('whitespace-toggle');
  const wsSlider = el<HTMLInputElement>('ws-slider');
  const wsValue = el<HTMLElement>('ws-value');

  const applyWhitespace = (): void => {
    const enabled = wsToggle.checked;
    wsSlider.disabled = !enabled;
    wsValue.classList.toggle('dim', !enabled);
    const n = enabled ? +wsSlider.value : 0;
    wsValue.textContent = n.toLocaleString();
    field.setWhitespaceCount(n);
    updateStats();
  };

  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-mode') as 'dots' | 'graph';
      const graphOnlyEls = document.querySelectorAll<HTMLElement>('.graph-only');
      if (mode === 'graph') {
        countLabel.textContent = 'NODES/LETTER';
        countSlider.min = '10'; countSlider.max = '20000'; countSlider.step = '10';
        countSlider.value = '440';
        countValue.textContent = '440';
        graphOnlyEls.forEach(el => el.hidden = false);
        kMinSlider.value = '14'; kMinValue.textContent = '14';
        kSlider.value = '16'; kValue.textContent = '16';
        field.setGraphKMin(14);
        field.setGraphK(16);
        if (wsToggle.checked) { wsToggle.checked = false; applyWhitespace(); }
        field.setNodesPerLetter(440);
        field.setMode('graph');
      } else {
        countLabel.textContent = 'DOTS';
        countSlider.min = '100'; countSlider.max = '50000'; countSlider.step = '100';
        countSlider.value = '20000';
        countValue.textContent = '20,000';
        graphOnlyEls.forEach(el => el.hidden = true);
        field.setMode('dots');
        field.setTextCount(20000);
      }
      updateStats();
      renderFavicon();
    });
  });

  // K sliders.
  kSlider.addEventListener('input', e => {
    const k = +(e.target as HTMLInputElement).value;
    kValue.textContent = String(k);
    field.setGraphK(k);
    if (+kMinSlider.value > k) {
      kMinSlider.value = String(k);
      kMinValue.textContent = String(k);
    }
    updateStats();
    renderFavicon();
  });
  kMinSlider.addEventListener('input', e => {
    const kMin = +(e.target as HTMLInputElement).value;
    kMinValue.textContent = String(kMin);
    field.setGraphKMin(kMin);
    if (kMin > +kSlider.value) {
      kSlider.value = String(kMin);
      kValue.textContent = String(kMin);
    }
    updateStats();
    renderFavicon();
  });

  // Weight variance.
  const wsScaleSlider = el<HTMLInputElement>('wscale-slider');
  const wsScaleValue = el<HTMLElement>('wscale-value');
  wsScaleSlider.addEventListener('input', e => {
    const v = +(e.target as HTMLInputElement).value;
    wsScaleValue.textContent = v.toFixed(2);
    field.setWeightScale(v);
    renderFavicon();
  });

  // Node radius.
  const radiusSlider = el<HTMLInputElement>('radius-slider');
  const radiusValue = el<HTMLElement>('radius-value');
  radiusSlider.addEventListener('input', e => {
    const v = +(e.target as HTMLInputElement).value;
    radiusValue.textContent = v.toFixed(1);
    field.nodeRadius = v;
    renderFavicon();
  });

  // Toast.
  const toast = el<HTMLElement>('toast');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const showToast = (msg: string, ms = 2400): void => {
    toast.textContent = msg;
    toast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), ms);
  };

  // Reset graph.
  el<HTMLButtonElement>('reset-btn').addEventListener('click', () => {
    field.resetGraph();
    showToast('Graph reset');
  });

  // Advanced sliders.
  type Prop = 'chaosKSpring' | 'chaosDamping' | 'chaosBrownian';
  const bindSlider = (sliderId: string, valueId: string, prop: Prop, format: (v: number) => string = v => v.toFixed(2)): void => {
    const s = el<HTMLInputElement>(sliderId);
    const out = el<HTMLElement>(valueId);
    s.addEventListener('input', e => {
      const v = +(e.target as HTMLInputElement).value;
      out.textContent = format(v);
      (field as unknown as Record<Prop, number>)[prop] = v;
    });
  };
  bindSlider('cspring-slider', 'cspring-value', 'chaosKSpring', v => v.toFixed(4));
  bindSlider('cdamp-slider', 'cdamp-value', 'chaosDamping');
  bindSlider('cjit-slider', 'cjit-value', 'chaosBrownian');
  // Edge width affects the favicon too — bind it manually so we can hook
  // renderFavicon() into its input event.
  const ewidthSlider = el<HTMLInputElement>('ewidth-slider');
  const ewidthValue = el<HTMLElement>('ewidth-value');
  ewidthSlider.addEventListener('input', e => {
    const v = +(e.target as HTMLInputElement).value;
    ewidthValue.textContent = v.toFixed(1);
    field.edgeWidth = v;
    renderFavicon();
  });

  // Edge alpha — 0 means "auto".
  const ealphaSlider = el<HTMLInputElement>('ealpha-slider');
  const ealphaValue = el<HTMLElement>('ealpha-value');
  ealphaSlider.addEventListener('input', e => {
    const v = +(e.target as HTMLInputElement).value;
    field.edgeAlphaOverride = v;
    ealphaValue.textContent = v === 0 ? 'auto' : v.toFixed(2);
    renderFavicon();
  });

  // Export.
  el<HTMLButtonElement>('export-btn').addEventListener('click', async () => {
    const state = field.exportState() as { nodes: unknown[]; edges: unknown[] };
    const json = JSON.stringify(state);
    try {
      await navigator.clipboard.writeText(json);
      const kb = (json.length / 1024).toFixed(1);
      showToast(`Copied ${state.nodes.length} nodes · ${state.edges.length} edges (${kb} KB)`);
    } catch {
      showToast('Clipboard blocked · open devtools console to copy');
      console.log('=== GRAPH STATE EXPORT (copy from here) ===');
      console.log(json);
    }
  });

  // Whitespace toggle + slider.
  wsToggle.addEventListener('change', applyWhitespace);
  wsSlider.addEventListener('input', applyWhitespace);
  updateStats();

  // Color swatches.
  document.querySelectorAll<HTMLButtonElement>('#text-swatches .' + s.swatch).forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('#text-swatches .' + s.swatch).forEach(b => b.classList.remove('active'));
      sw.classList.add('active');
      const c = sw.getAttribute('data-color')!;
      field.setTextColor(c);
      currentTextHex = c;
      renderFavicon();
      el<HTMLInputElement>('text-picker').value = c;
    });
  });
  el<HTMLInputElement>('text-picker').addEventListener('input', e => {
    document.querySelectorAll('#text-swatches .' + s.swatch).forEach(b => b.classList.remove('active'));
    const c = (e.target as HTMLInputElement).value;
    field.setTextColor(c);
    currentTextHex = c;
    renderFavicon();
  });
  document.querySelectorAll<HTMLButtonElement>('#ws-swatches .' + s.swatch).forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('#ws-swatches .' + s.swatch).forEach(b => b.classList.remove('active'));
      sw.classList.add('active');
      const c = sw.getAttribute('data-color')!;
      field.setWhitespaceColor(c);
      el<HTMLInputElement>('ws-picker').value = c;
    });
  });
  el<HTMLInputElement>('ws-picker').addEventListener('input', e => {
    document.querySelectorAll('#ws-swatches .' + s.swatch).forEach(b => b.classList.remove('active'));
    field.setWhitespaceColor((e.target as HTMLInputElement).value);
  });
});
