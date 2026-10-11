/* Código Humano · T1 — motor de render.
   Todo cuadro es una función pura del tiempo: render(t) dibuja lo mismo
   en vivo y en la exportación cuadro a cuadro. */
(function () {
'use strict';
const D = window.CH_DATA;
const CH = window.CH = window.CH || {};

/* ---------- paleta y tipografía ---------- */
const C = {
  ink: '#0E0C12', ink2: '#17141D', ink3: '#221E2A',
  hueso: '#F5F5F5', gris: '#9C97A6', grisO: '#6B6B6B',
  violeta: '#A78BFA', lavanda: '#E9E1FF', ambar: '#F2B36B', ambarO: '#C9803A'
};
const F = {
  serif: '"DM Serif Display", Georgia, serif',
  sans: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace'
};
CH.C = C; CH.F = F;

/* ---------- utilidades ---------- */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, d) => clamp((t - a) / d);
const eo3 = t => 1 - Math.pow(1 - t, 3);
const eo5 = t => 1 - Math.pow(1 - t, 5);
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eoBack = t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const eoExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
const frac = x => x - Math.floor(x);
const hash = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const hash2 = (a, b) => hash(a * 57.31 + b * 113.97);
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = Math.round(lerp(a >> 16 & 255, b >> 16 & 255, t)), g = Math.round(lerp(a >> 8 & 255, b >> 8 & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}
Object.assign(CH, { clamp, lerp, prog, eo3, eo5, eio, eoBack, eoExpo, frac, hash, hash2, vnoise, rgba, mix });

/* ---------- tiempo musical ---------- */
const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
CH.BPM = BPM; CH.BEAT = BEAT; CH.BAR = BAR;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaLarga(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; }
function fechaCorta(iso) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES_C[m - 1]}`; }
CH.fechaLarga = fechaLarga; CH.fechaCorta = fechaCorta;

/* ---------- línea de tiempo ---------- */
function buildTimeline(kind) {
  const S = []; let bar = 0;
  const add = (type, bars, extra = {}) => { S.push(Object.assign({ type, bar0: bar, bars, t0: bar * BAR, dur: bars * BAR, idx: S.length }, extra)); bar += bars; };
  const eps = D.episodios;
  if (kind === 'vertical') {
    add('cold', 2); add('title', 2);
    eps.forEach((ep, i) => add('ep', 1, { ep, i, compact: true }));
    add('close', 3);
  } else {
    add('cold', 2); add('title', 3);
    eps.forEach((ep, i) => add('ep', 3, { ep, i }));
    add('montage', 4); add('close', 5);
  }
  const tl = { kind, sections: S, bars: bar, dur: bar * BAR, TR: kind === 'vertical' ? BEAT * 0.75 : BEAT };
  // episodios de "respiro" y de "clímax" (tres movimientos)
  const n = eps.length;
  tl.breath = n >= 6 ? [n - 4, n - 3] : [];
  tl.payoff = n >= 6 ? n - 2 : Math.max(0, n - 1);
  return tl;
}
CH.buildTimeline = buildTimeline;

function sectionAt(tl, t) {
  const S = tl.sections;
  for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0) return S[i];
  return S[0];
}
CH.sectionAt = sectionAt;

/* intensidad de batería por compás, para pulsos de luz */
function drumLevel(tl, t) {
  const s = sectionAt(tl, t);
  if (s.type === 'cold') return 0;
  if (s.type === 'title') return (t - s.t0) > BAR ? .6 : .3;
  if (s.type === 'ep') {
    if (tl.breath.includes(s.i)) return .15;
    return s.i >= tl.payoff ? 1 : .75;
  }
  if (s.type === 'montage') return 1;
  if (s.type === 'close') { const lb = (t - s.t0) / BAR; return lb < 2 ? .5 : .1; }
  return .5;
}
function beatPulse(tl, t) {
  const ph = frac(t / BEAT);
  return Math.exp(-ph * 6) * drumLevel(tl, t);
}
CH.beatPulse = beatPulse;

/* ---------- geometría de pantalla ---------- */
function geom(W, H, compact) {
  const portrait = H > W * 1.1;
  const s = portrait ? W / 1080 : Math.min(H / 1080, W / 1920 * 1.0);
  const g = { W, H, s, portrait, compact: !!compact };
  if (portrait) {
    g.vis = { cx: W * .5, cy: H * (compact ? .36 : .33), R: Math.min(W * .36, H * .22) };
    g.text = { x: W * .08, y: H * (compact ? .62 : .58), w: W * .84 };
  } else {
    g.vis = { cx: W * .695, cy: H * .5, R: Math.min(H * .34, W * .2) };
    g.text = { x: W * .075, y: H * .22, w: W * .4 };
  }
  return g;
}
CH.geom = geom;

/* ---------- texto cinético ---------- */
const LC = new Map();
function parseEm(text) {
  // palabras separadas por espacios; el signo pegado a un énfasis queda pegado ("*queda*?")
  const out = []; let em = false;
  text.split(/\s+/).filter(Boolean).forEach(word => {
    let first = true;
    word.split(/(\*)/).forEach(seg => {
      if (seg === '*') { em = !em; return; }
      if (!seg) return;
      out.push({ w: seg, em, glue: !first }); first = false;
    });
  });
  return out;
}
function fontOf(o, em) {
  if (o.fam === 'serif') return `${em ? 'italic ' : ''}400 ${o.size}px ${F.serif}`;
  if (o.fam === 'mono') return `500 ${o.size}px ${F.mono}`;
  return `${o.weight || 500} ${o.size}px ${F.sans}`;
}
function layoutText(ctx, text, o) {
  const key = [text, o.size.toFixed(2), o.fam, o.weight, o.maxW.toFixed(1)].join('|');
  if (LC.has(key)) return LC.get(key);
  const toks = parseEm(text);
  ctx.font = fontOf(o, false);
  const space = ctx.measureText(' ').width;
  const lines = []; let cur = [], w = 0;
  for (const tk of toks) {
    ctx.font = fontOf(o, tk.em && o.fam === 'serif');
    const tw = ctx.measureText(tk.w).width;
    if (cur.length && !tk.glue && w + space + tw > o.maxW) { lines.push({ words: cur, w }); cur = []; w = 0; }
    tk.x = cur.length ? w + (tk.glue ? 0 : space) : 0; tk.tw = tw; w = tk.x + tw; cur.push(tk);
  }
  if (cur.length) lines.push({ words: cur, w });
  const res = { lines };
  if (LC.size > 400) LC.clear();
  LC.set(key, res);
  return res;
}
function fitText(ctx, text, o, maxLines, minSize) {
  let size = o.size, L;
  for (let k = 0; k < 14; k++) {
    L = layoutText(ctx, text, Object.assign({}, o, { size }));
    if (L.lines.length <= maxLines || size <= minSize) break;
    size *= .92;
  }
  return { L, size };
}
/* palabras que entran con ritmo: sube, aparece, y el énfasis va en violeta */
function kinetic(ctx, text, o) {
  const fit = fitText(ctx, text, o, o.maxLines || 3, o.minSize || o.size * .6);
  const size = fit.size, L = fit.L, lh = size * (o.lh || 1.08);
  let wi = 0; const t = o.t;
  for (let li = 0; li < L.lines.length; li++) {
    const line = L.lines[li];
    const ox = o.align === 'center' ? o.x - line.w / 2 : o.x;
    const by = o.y + size * .82 + li * lh;
    for (const tk of line.words) {
      const st = o.start + wi * (o.stagger || .07);
      const e = o.instant ? 1 : eo3(prog(t, st, o.dur || .55));
      wi++;
      if (e <= 0) continue;
      ctx.save();
      ctx.globalAlpha = e * (o.alpha == null ? 1 : o.alpha);
      ctx.font = fontOf(Object.assign({}, o, { size }), tk.em && o.fam === 'serif');
      ctx.fillStyle = tk.em ? (o.emColor || C.violeta) : (o.color || C.hueso);
      const dy = (1 - e) * size * .55;
      ctx.translate(ox + tk.x, by + dy);
      if (o.skew) ctx.transform(1, 0, -(1 - e) * .25, 1, 0, 0);
      ctx.fillText(tk.w, 0, 0);
      ctx.restore();
    }
  }
  return { h: L.lines.length * lh, size, lines: L.lines.length };
}
/* letra por letra, una sola línea centrada (frases héroe) */
function charsLine(ctx, text, o) {
  const toks = parseEm(text);
  const size = o.size;
  const parts = [];
  let x = 0;
  ctx.font = fontOf(o, false); const space = ctx.measureText(' ').width;
  toks.forEach((tk, i) => {
    ctx.font = fontOf(o, tk.em && o.fam === 'serif');
    for (const ch of tk.w) { const w = ctx.measureText(ch).width; parts.push({ ch, x, w, em: tk.em }); x += w; }
    if (i < toks.length - 1 && !toks[i + 1].glue) x += space;
  });
  let scale = 1; if (o.maxW && x > o.maxW) scale = o.maxW / x;
  const x0 = (o.align === 'left' ? o.x : o.x - x * scale / 2);
  parts.forEach((p, i) => {
    const e = eo3(prog(o.t, o.start + i * (o.stagger || .028), o.dur || .6));
    if (e <= 0) return;
    ctx.save();
    ctx.globalAlpha = e * (o.alpha == null ? 1 : o.alpha);
    ctx.font = fontOf(Object.assign({}, o, { size: size * scale }), p.em && o.fam === 'serif');
    ctx.fillStyle = p.em ? (o.emColor || C.violeta) : (o.color || C.hueso);
    ctx.translate(x0 + p.x * scale + p.w * scale / 2, o.y + (1 - e) * size * .6);
    ctx.rotate((1 - e) * -.18);
    ctx.fillText(p.ch, -p.w * scale / 2, 0);
    ctx.restore();
  });
  return x * scale;
}
/* etiqueta mono que se escribe como código, con cursor */
function typed(ctx, text, x, y, size, color, t, start, opts = {}) {
  const cps = opts.cps || 42;
  const n = Math.floor(clamp((t - start) * cps, 0, text.length));
  if (t < start) return;
  ctx.save();
  ctx.font = `500 ${size}px ${F.mono}`;
  try { ctx.letterSpacing = (size * .08) + 'px'; } catch (e) { }
  ctx.fillStyle = color;
  ctx.textAlign = opts.align || 'left';
  const s = text.slice(0, n);
  ctx.fillText(s, x, y);
  const done = n >= text.length;
  const blink = done ? (frac(t * 1.6) < .5 ? 1 : 0) * clamp(1 - (t - start - text.length / cps) / 2.4) : 1;
  if (opts.cursor !== false && blink > 0 && opts.align !== 'center') {
    const w = ctx.measureText(s).width + (s.length ? size * .08 * s.length * 0 : 0);
    ctx.globalAlpha = blink;
    ctx.fillStyle = C.ambar;
    ctx.fillRect(x + w + size * .2, y - size * .82, size * .55, size * .95);
  }
  ctx.restore();
}
Object.assign(CH, { parseEm, layoutText, kinetic, charsLine, typed, fontOf });

/* ---------- la voz: forma de onda humana (ámbar) y de Miles (violeta) ---------- */
function speechEnv(x, seed) {
  const syl = Math.pow(Math.abs(Math.sin(x * Math.PI * 4.6 + seed)), .7);
  const phr = .55 + .45 * Math.sin(x * 1.3 + seed * 2.1);
  const n = vnoise(x * 3.7 + seed * 10);
  return clamp(syl * phr * (.45 + .8 * n));
}
function voiceGate(x, who) {
  const hb = Math.floor(x / (BAR / 2)), ph = frac(x / (BAR / 2));
  return (((hb % 2) + 2) % 2 === who) ? Math.pow(Math.sin(ph * Math.PI), .45) : .06;
}
function wave(ctx, x0, x1, yc, amp, t, who, color, lw, o = {}) {
  const span = x1 - x0; if (span <= 0) return;
  const step = Math.max(2, span / 260);
  const seed = who * 7.31 + (o.seed || 0);
  ctx.beginPath();
  for (let x = x0; x <= x1 + .1; x += step) {
    const u = (x - x0) / span;
    const tx = t - (1 - u) * (o.history || 1.4);
    let env = speechEnv(tx, seed) * (o.gate === false ? 1 : voiceGate(tx, who));
    env = env * (o.gain || 1) + (o.idle || .03);
    const taper = Math.pow(Math.sin(u * Math.PI), o.taper || .6);
    const k = o.k || 1;
    const y = yc + amp * env * taper * (Math.sin(u * 38 * k + t * 7 + who * 2) * .62 + Math.sin(u * 91 * k - t * 11 + who) * .38);
    if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(color, (o.alpha || 1) * .18); ctx.lineWidth = lw * 5; ctx.stroke();
  ctx.strokeStyle = rgba(color, (o.alpha || 1) * .95); ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
}
CH.wave = wave; CH.speechEnv = speechEnv; CH.voiceGate = voiceGate;

/* ---------- luz ---------- */
function glow(ctx, x, y, r, color, a) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(.4, rgba(color, a * .35)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
CH.glow = glow;
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
CH.rr = rr;

/* ---------- fondo con profundidad ---------- */
let grainCanvas = null;
function grain() {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), d = x.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = Math.floor(hash(i * .7 + 3.1) * 255); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0); grainCanvas = c; return c;
}
const BOKEH = Array.from({ length: 46 }, (_, i) => ({
  x: hash(i * 3.1), y: hash(i * 5.7), z: .25 + hash(i * 9.3) * .75, r: 1 + hash(i * 1.9) * 5,
  c: hash(i * 2.3) < .55 ? C.violeta : C.ambar, sp: .006 + hash(i * 4.4) * .014, ph: hash(i * 7.7) * 6.28
}));
function background(ctx, g, t, cam, pulse, opts = {}) {
  const { W, H, s } = g;
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  // dos fuentes de luz lentas: lo humano (ámbar) y la máquina (violeta)
  const ax = W * (.18 + .05 * Math.sin(t * .11)) - cam.x * .3, ay = H * (.86 + .04 * Math.cos(t * .13)) - cam.y * .3;
  const vx = W * (.86 + .04 * Math.cos(t * .09)) - cam.x * .3, vy = H * (.12 + .05 * Math.sin(t * .12)) - cam.y * .3;
  const big = Math.max(W, H);
  glow(ctx, ax, ay, big * .62, C.ambar, .085 + pulse * .025 + (opts.warm || 0));
  glow(ctx, vx, vy, big * .66, C.violeta, .10 + pulse * .03 + (opts.cool || 0));
  // retícula de puntos: el papel cuadriculado del código
  const sp = 36 * s;
  const ox = -frac((cam.x * .55 + t * 4 * s) / sp) * sp, oy = -frac((cam.y * .55) / sp) * sp;
  ctx.fillStyle = rgba(C.hueso, .045);
  for (let y = oy; y < H + sp; y += sp) for (let x = ox; x < W + sp; x += sp) ctx.fillRect(x, y, 1.6 * s, 1.6 * s);
  // partículas en tres profundidades
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const b of BOKEH) {
    const px = frac(b.x + Math.sin(t * .05 + b.ph) * .02) * (W + 200) - 100 - cam.x * b.z * 1.4;
    const py = frac(b.y - t * b.sp * b.z) * (H + 200) - 100 - cam.y * b.z * 1.4;
    const r = b.r * s * (1 + b.z * 2.2);
    const a = (.05 + .1 * b.z) * (.6 + .4 * Math.sin(t * 1.3 + b.ph)) * (1 + pulse * .6);
    glow(ctx, px, py, r * 3, b.c, a);
  }
  ctx.restore();
}
function finish(ctx, g, t, frame) {
  const { W, H } = g;
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const gc = grain();
  ctx.save(); ctx.globalAlpha = .045;
  const pat = ctx.createPattern(gc, 'repeat');
  const ox = Math.floor(hash(frame * 1.37) * 256), oy = Math.floor(hash(frame * 2.11) * 256);
  ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(ox, oy, W, H);
  ctx.restore();
}
CH.background = background; CH.finish = finish;
})();
