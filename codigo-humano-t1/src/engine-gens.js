/* Escenas generativas: una por episodio, cada una ligada a su tema.
   Firma: gen(ctx, v) con v = { cx, cy, R, tl, t, s, pulse, portrait }.
   tl = segundos desde el inicio de la escena (negativo durante la transición).
   Todo lo que "se construye" se fija al completarse; lo que respira es periódico,
   así la escena puede quedarse viva en modo presentador. */
(function () {
'use strict';
const CH = window.CH;
const { C, F, clamp, lerp, prog, eo3, eio, eoBack, frac, hash, hash2, rgba, mix, glow, rr, vnoise } = CH;
const G = CH.gens = {};

function label(ctx, text, x, y, size, color, align = 'center', alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `500 ${size}px ${F.mono}`;
  try { ctx.letterSpacing = (size * .06) + 'px'; } catch (e) { }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore();
}
function sansLabel(ctx, text, x, y, size, color, align = 'center', alpha = 1, weight = 500) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px ${F.sans}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); ctx.restore();
}
function pill(ctx, text, x, y, size, color, alpha, align = 'left') {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `500 ${size}px ${F.sans}`;
  const w = ctx.measureText(text).width + size * 1.4, h = size * 2;
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fillStyle = rgba(C.ink, .82); ctx.fill();
  ctx.strokeStyle = rgba(color, .7); ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + size * .7, y + size * .04);
  ctx.restore();
  return w;
}
CH.label = label; CH.sansLabel = sansLabel; CH.pill = pill;

/* E01 · huella: la máquina llena la cuadrícula de tareas; la huella humana queda */
G.huella = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  // cuadrícula de tareas que la IA va resolviendo
  const step = R * .17;
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
    const x = cx + i * step, y = cy + j * step, d = Math.hypot(i * step, (j * step) * .9);
    if (d < R * 1.02 || d > R * 1.6 || i * step < -R * 1.3) continue;
    const h = hash2(i + 20, j + 40);
    const a = eo3(prog(tl, .1 + h * .9, .4));
    if (a <= 0) continue;
    const done = prog(tl, 1.6 + h * 2.4 + d / R * .3, .35);
    const z = step * .62;
    ctx.save(); ctx.globalAlpha = a * (.55 - (d / R - 1) * .45);
    rr(ctx, x - z / 2, y - z / 2, z, z, z * .22);
    ctx.fillStyle = done > 0 ? rgba(C.violeta, .16 + .5 * done) : rgba(C.hueso, .05);
    ctx.fill();
    ctx.strokeStyle = rgba(done > 0 ? C.violeta : C.hueso, .35); ctx.lineWidth = 1; ctx.stroke();
    if (done > 0) { // tilde
      ctx.strokeStyle = rgba(C.ink, .9 * done); ctx.lineWidth = 2 * s; ctx.beginPath();
      ctx.moveTo(x - z * .22, y); ctx.lineTo(x - z * .05, y + z * .17); ctx.lineTo(x + z * .24, y - z * .18); ctx.stroke();
    }
    ctx.restore();
  }
  glow(ctx, cx, cy, R * 1.3, C.ambar, .16 + v.pulse * .06);
  // la huella: anillos con pequeñas imperfecciones únicas
  const rings = 17;
  ctx.save(); ctx.lineCap = 'round';
  for (let k = 0; k < rings; k++) {
    const p = eo3(prog(tl, .05 + k * .065, 1.2));
    if (p <= 0) continue;
    const r0 = R * (.07 + k * .052);
    const breathe = 1 + .008 * Math.sin(tl * 1.4 - k * .45);
    const a0 = -Math.PI / 2 + k * .7;
    const N = 70 + k * 6;
    ctx.strokeStyle = mix(C.hueso, C.ambar, k / rings);
    ctx.globalAlpha = .55 + .45 * (1 - k / rings);
    ctx.lineWidth = (2.6 - k * .06) * s;
    ctx.beginPath(); let pen = false;
    for (let n = 0; n <= N * p; n++) {
      const th = a0 + n / N * Math.PI * 2;
      const gap = hash2(k, Math.floor(n / 9)) < .1;
      if (gap) { pen = false; continue; }
      const r = r0 * breathe * (1 + .07 * Math.sin(2 * th + k * .5) + .035 * Math.sin(5 * th - k) + .02 * Math.sin(9 * th + k * 2));
      const x = cx + Math.cos(th) * r * .84, y = cy + Math.sin(th) * r * 1.06 + R * .04 * Math.sin(th * .5);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, 'lo que queda es nuestro', cx, cy + R * 1.18, 17 * s, C.ambar, 'center', eo3(prog(tl, 2.6, .6)) * .9);
};

/* E02 · compuerta: las decisiones pasan por una persona que puede detenerlas */
G.compuerta = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const L = 7, x0 = cx - R * 1.55, x1 = cx + R * 1.55;
  const laneY = (i, x) => { const off = (i - (L - 1) / 2) / ((L - 1) / 2); const u = Math.abs(x - cx) / (R * 1.55); return cy + off * R * (.08 + .82 * Math.pow(u, 1.4)); };
  const draw = eo3(prog(tl, 0, 1.2));
  ctx.save();
  for (let i = 0; i < L; i++) {
    ctx.beginPath();
    for (let x = x0; x <= lerp(x0, x1, draw); x += 6 * s) { const y = laneY(i, x); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = rgba(C.hueso, .12); ctx.lineWidth = 1.2 * s; ctx.stroke();
  }
  // la compuerta: un ojo con una persona adentro
  const ge = eoBack(prog(tl, .5, .8));
  const gw = R * .34 * ge, gh = R * .62 * ge;
  glow(ctx, cx, cy, R * .9, C.ambar, .22 * ge + v.pulse * .05);
  ctx.beginPath(); ctx.moveTo(cx, cy - gh); ctx.quadraticCurveTo(cx + gw * 1.6, cy, cx, cy + gh); ctx.quadraticCurveTo(cx - gw * 1.6, cy, cx, cy - gh);
  ctx.fillStyle = rgba(C.ink, .85); ctx.fill();
  ctx.strokeStyle = rgba(C.ambar, .95); ctx.lineWidth = 2.4 * s; ctx.stroke();
  // pupila con símbolo de pausa
  const pr = R * .13 * ge;
  ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fillStyle = C.ambar; ctx.fill();
  const paused = frac((tl - 2) / 4.8) > .7 && tl > 2;
  ctx.fillStyle = C.ink;
  ctx.fillRect(cx - pr * .42, cy - pr * .45, pr * .28, pr * .9); ctx.fillRect(cx + pr * .14, cy - pr * .45, pr * .28, pr * .9);
  if (paused) { ctx.beginPath(); ctx.arc(cx, cy, pr * 1.9 + Math.sin(tl * 12) * 2 * s, 0, Math.PI * 2); ctx.strokeStyle = rgba(C.ambar, .5); ctx.lineWidth = 2 * s; ctx.stroke(); }
  // flujo de decisiones: violeta antes, ámbar después de la revisión humana
  ctx.globalCompositeOperation = 'lighter';
  const flowOn = eo3(prog(tl, .6, .8));
  // tiempo del flujo: se congela durante cada pausa humana
  let flowT = tl;
  if (tl > 2) { const n = Math.floor((tl - 2) / 4.8), ph = (tl - 2) - n * 4.8; flowT = 2 + n * 4.8 * .7 + Math.min(ph, 4.8 * .7); }
  for (let i = 0; i < L; i++) for (let j = 0; j < 9; j++) {
    const sp = .085 + hash2(i, 3) * .03;
    const u = frac(flowT * sp + j / 9 + hash2(i, j) * .1);
    const x = lerp(x0, x1, u), y = laneY(i, x);
    const after = x > cx;
    const col = after ? C.ambar : C.violeta;
    const fade = Math.sin(u * Math.PI);
    ctx.globalAlpha = flowOn * fade;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, (2.2 + (after ? 1 : 0)) * s, 0, Math.PI * 2); ctx.fill();
    if (Math.abs(x - cx) < R * .05) glow(ctx, x, y, R * .12, C.ambar, .5 * flowOn);
  }
  ctx.restore();
  label(ctx, 'sugiere', x0 + R * .25, cy - R * 1.02, 17 * s, C.violeta, 'center', eo3(prog(tl, 1.3, .5)));
  label(ctx, 'una persona decide', x1 - R * .4, cy - R * 1.02, 17 * s, C.ambar, 'center', eo3(prog(tl, 1.7, .5)));
};

/* E03 · documento: escanear lo que el Estado compra */
G.documento = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const w = R * 1.12, h = R * 1.5, x = cx - w / 2, y = cy - h / 2;
  const enter = eo3(prog(tl, 0, .9));
  ctx.save();
  ctx.translate(cx, cy + (1 - enter) * R * .3); ctx.transform(1, -.05, .08, 1, 0, 0); ctx.translate(-cx, -cy);
  ctx.globalAlpha = enter;
  // sombra y hoja
  glow(ctx, cx + R * .1, cy + R * .15, R * 1.2, '#000000', .5);
  rr(ctx, x, y, w, h, 10 * s); ctx.fillStyle = '#F3EFE7'; ctx.fill();
  // encabezado
  ctx.fillStyle = '#2A2530'; ctx.fillRect(x + w * .08, y + h * .07, w * .46, h * .035);
  ctx.fillStyle = '#9C95A3'; ctx.fillRect(x + w * .08, y + h * .125, w * .3, h * .018);
  ctx.save(); ctx.font = `500 ${11 * s}px ${F.mono}`; ctx.fillStyle = '#7A7280'; ctx.textAlign = 'right';
  ctx.fillText('ORDEN DE COMPRA', x + w * .92, y + h * .1); ctx.restore();
  // renglones
  const rows = 15, beamU = tl > .6 ? frac((tl - .6) / 3.4) : -1;
  const firstPass = (u) => .6 + u * 3.4;
  const keyRows = { 3: '¿Qué se compró?', 8: '¿A quién?', 12: '¿Qué llegó?' };
  for (let r = 0; r < rows; r++) {
    const u = (r + .5) / rows;
    const ry = y + h * (.2 + u * .72);
    const len = (.45 + hash(r * 3.3) * .4) * w * .84;
    const hit = tl >= firstPass(u * .92 + .04);
    const isKey = keyRows[r];
    ctx.fillStyle = hit && isKey ? C.ambar : (hit ? '#B9B1BE' : '#D9D3DC');
    ctx.fillRect(x + w * .08, ry, isKey ? w * .84 : len, h * .016);
    if (isKey) {
      ctx.fillStyle = hit ? '#2A2530' : '#C9C2CC';
      ctx.fillRect(x + w * .08, ry - h * .028, w * .2, h * .012);
    }
  }
  // haz de escaneo
  if (beamU >= 0) {
    const by = y + h * (.16 + beamU * .8);
    const gr = ctx.createLinearGradient(0, by - h * .1, 0, by + h * .02);
    gr.addColorStop(0, rgba(C.violeta, 0)); gr.addColorStop(.85, rgba(C.violeta, .28)); gr.addColorStop(1, rgba(C.violeta, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - w * .04, by - h * .1, w * 1.08, h * .12);
    ctx.fillStyle = C.violeta; ctx.fillRect(x - w * .06, by, w * 1.12, 2.2 * s);
  }
  ctx.restore();
  // preguntas que aparecen junto a cada hallazgo
  Object.keys(keyRows).forEach((k, i) => {
    const u = ((+k) + .5) / rows;
    const a = eo3(prog(tl, firstPass(u * .92 + .04), .5));
    const ry = y + h * (.2 + u * .72) - (u - .5) * R * .06;
    const px = v.portrait ? cx + w * .18 : x + w + R * .12;
    const ox = (1 - a) * R * .15;
    if (a > 0) {
      ctx.save(); ctx.strokeStyle = rgba(C.ambar, .6 * a); ctx.lineWidth = 1.3 * s; ctx.beginPath();
      ctx.moveTo(x + w * .92 + (v.portrait ? -w * .5 : 0), ry); ctx.lineTo(px - 6 * s + ox, ry); ctx.stroke(); ctx.restore();
    }
    pill(ctx, keyRows[k], px + ox, ry, 17 * s, C.ambar, a, 'left');
  });
};

/* E04 · rompecabezas: un trabajo es una mezcla de tareas */
function tabEdge(ctx, ax, ay, bx, by, sg) {
  if (!sg) { ctx.lineTo(bx, by); return; }
  const dx = bx - ax, dy = by - ay, nx = dy * sg, ny = -dx * sg;
  const P = (u, w) => [ax + dx * u + nx * w, ay + dy * u + ny * w];
  ctx.lineTo(...P(.35, 0));
  ctx.bezierCurveTo(...P(.42, .05), ...P(.28, .25), ...P(.5, .25));
  ctx.bezierCurveTo(...P(.72, .25), ...P(.58, .05), ...P(.65, 0));
  ctx.lineTo(bx, by);
}
function piecePath(ctx, x, y, z, e) {
  const h = z / 2;
  ctx.beginPath(); ctx.moveTo(x - h, y - h);
  tabEdge(ctx, x - h, y - h, x + h, y - h, e.t);
  tabEdge(ctx, x + h, y - h, x + h, y + h, e.r);
  tabEdge(ctx, x + h, y + h, x - h, y + h, e.b);
  tabEdge(ctx, x - h, y + h, x - h, y - h, e.l);
  ctx.closePath();
}
G.rompecabezas = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const cols = 4, rows = 3, z = R * .44;
  const H = (r, c) => hash2(r * 7 + 1, c * 13 + 2) < .5 ? 1 : -1; // borde horizontal bajo (r,c)
  const V = (r, c) => hash2(r * 11 + 5, c * 3 + 9) < .5 ? 1 : -1;  // borde vertical a la derecha de (r,c)
  const roles = { '0,1': 'borrador', '1,3': 'datos', '2,0': 'formato', '2,2': 'código', '1,1': 'criterio' };
  const human = '1,1';
  const order = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([r, c]);
  order.sort((a, b) => hash2(a[0], a[1] + 50) - hash2(b[0], b[1] + 50));
  order.sort((a, b) => (a[0] + ',' + a[1] === human) - (b[0] + ',' + b[1] === human));
  order.forEach(([r, c], k) => {
    const key = r + ',' + c;
    const fx = cx + (c - (cols - 1) / 2) * z, fy = cy + (r - (rows - 1) / 2) * z;
    const st = .1 + k * .17 + (key === human ? .35 : 0);
    const p = prog(tl, st, .85), e = eoBack(p);
    if (p <= 0) return;
    const ang = hash2(r, c) * Math.PI * 2, dist = R * (1.5 + hash2(c, r) * .6);
    const sx = fx + Math.cos(ang) * dist, sy = fy + Math.sin(ang) * dist;
    const x = lerp(sx, fx, e), y = lerp(sy, fy, e), rot = (1 - eo3(p)) * (hash2(r + 3, c) - .5) * 2.4;
    const ed = { t: r === 0 ? 0 : -H(r - 1, c), b: r === rows - 1 ? 0 : H(r, c), l: c === 0 ? 0 : -V(r, c - 1), r: c === cols - 1 ? 0 : V(r, c) };
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = clamp(p * 3);
    const isH = key === human, isAI = roles[key] && !isH;
    if (isH) glow(ctx, 0, 0, z * 1.6, C.ambar, .35 + .15 * Math.sin(tl * 2.4));
    piecePath(ctx, 0, 0, z * .98, ed);
    ctx.fillStyle = isH ? C.ambar : isAI ? rgba(C.violeta, .32 + .08 * Math.sin(tl * 2 + k)) : rgba(C.ink3, .95);
    ctx.fill();
    ctx.strokeStyle = isH ? '#FFE2BC' : isAI ? rgba(C.violeta, .95) : rgba(C.hueso, .28);
    ctx.lineWidth = (isH ? 2.4 : 1.4) * s; ctx.stroke();
    if (roles[key]) label(ctx, roles[key], 0, 0, 13 * s, isH ? C.ink : C.lavanda, 'center', clamp((p - .6) * 3));
    ctx.restore();
  });
  const a = eo3(prog(tl, 3.6, .6));
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = C.violeta; ctx.fillRect(cx - R * .95, cy + R * .84, 10 * s, 10 * s);
  label(ctx, 'tareas que la IA puede hacer', cx - R * .95 + 18 * s, cy + R * .84 + 5 * s, 16 * s, C.gris, 'left');
  ctx.fillStyle = C.ambar; ctx.fillRect(cx - R * .95, cy + R * .95, 10 * s, 10 * s);
  label(ctx, 'lo humano que queda más visible', cx - R * .95 + 18 * s, cy + R * .95 + 5 * s, 16 * s, C.gris, 'left');
  ctx.restore();
};

/* E05 · red: una startup que nace con la IA adentro y crece por conversaciones */
const RED = (() => {
  const n = 40, nodes = [];
  for (let k = 0; k < n; k++) {
    const ang = k * 2.39996 + hash(k) * .5, rad = k === 0 ? 0 : .16 * Math.sqrt(k) * (.85 + hash(k * 3) * .3);
    nodes.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * .9, a: k === 0 ? 0 : .35 + 3.4 * Math.pow(k / n, 1.15), chat: k % 5 === 2 });
  }
  nodes.forEach((nd, k) => {
    if (!k) { nd.p = -1; nd.d = 0; return; }
    let best = 0, bd = 1e9;
    for (let j = 0; j < k; j++) { const d = Math.hypot(nd.x - nodes[j].x, nd.y - nodes[j].y); if (d < bd) { bd = d; best = j; } }
    nd.p = best; nd.d = nodes[best].d + 1;
  });
  return nodes;
})();
function bubble(ctx, x, y, w, h, fill, stroke, lw) {
  rr(ctx, x - w / 2, y - h / 2, w, h, h * .38);
  ctx.moveTo(x - w * .18, y + h / 2); ctx.lineTo(x - w * .32, y + h * .85); ctx.lineTo(x - w * .02, y + h / 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
G.red = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const P = nd => [cx + nd.x * R * 1.12, cy + nd.y * R * 1.12];
  ctx.save();
  // aristas
  RED.forEach(nd => {
    if (nd.p < 0) return;
    const e = eo3(prog(tl, nd.a - .3, .35)); if (e <= 0) return;
    const [x, y] = P(nd), [px, py] = P(RED[nd.p]);
    ctx.strokeStyle = rgba(C.violeta, .35); ctx.lineWidth = 1.3 * s;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lerp(px, x, e), lerp(py, y, e)); ctx.stroke();
  });
  // mensajes que viajan desde el centro
  ctx.globalCompositeOperation = 'lighter';
  RED.forEach((nd, k) => {
    if (nd.p < 0 || tl < nd.a + .1) return;
    const u = frac(tl * .55 - nd.d * .18 + hash(k) * .2);
    const [x, y] = P(nd), [px, py] = P(RED[nd.p]);
    ctx.globalAlpha = Math.sin(u * Math.PI) * .9;
    ctx.fillStyle = C.ambar; ctx.beginPath(); ctx.arc(lerp(px, x, u), lerp(py, y, u), 2.2 * s, 0, 6.283); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // nodos
  RED.forEach((nd, k) => {
    const e = eoBack(prog(tl, nd.a, .45)); if (e <= 0) return;
    const [x, y] = P(nd);
    if (k === 0) {
      glow(ctx, x, y, R * .55, C.ambar, .35 + v.pulse * .1);
      bubble(ctx, x, y, R * .36 * e, R * .24 * e, C.ambar, null, 0);
      for (let d = 0; d < 3; d++) { const b = .5 + .5 * Math.sin(tl * 6 - d * .9); ctx.fillStyle = rgba(C.ink, .5 + .5 * b); ctx.beginPath(); ctx.arc(x + (d - 1) * R * .08, y - b * 2 * s, R * .025, 0, 6.283); ctx.fill(); }
      return;
    }
    const ring = prog(tl, nd.a, .6);
    if (ring < 1) { ctx.strokeStyle = rgba(C.violeta, .7 * (1 - ring)); ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(x, y, R * .03 + ring * R * .12, 0, 6.283); ctx.stroke(); }
    if (nd.chat) bubble(ctx, x, y, R * .12 * e, R * .085 * e, rgba(C.ink, .9), C.ambar, 1.6 * s);
    else { ctx.fillStyle = C.violeta; ctx.beginPath(); ctx.arc(x, y, R * .028 * e, 0, 6.283); ctx.fill(); }
  });
  ctx.restore();
  label(ctx, 'cada punto, una conversación', cx, cy + R * 1.16, 17 * s, C.gris, 'center', eo3(prog(tl, 3, .6)));
};

/* E06 · radar: 800 palabras que se vuelven un retrato */
const PALABRAS = ['empatía', 'orden', 'curiosidad', 'constancia', 'calma', 'equipo', 'ideas', 'escucha', 'detalle', 'riesgo', 'confianza', 'dudas', 'planes', 'humor', 'cuidado', 'ritmo'];
const EJES = ['Apertura', 'Responsabilidad', 'Extraversión', 'Amabilidad', 'Estabilidad'];
G.radar = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  // palabras que llegan al centro
  PALABRAS.forEach((w, i) => {
    const per = 3.2, ph = frac((tl - i * .17) / per);
    if (tl < i * .17) return;
    const ang = hash(i * 9.1) * Math.PI * 2;
    const d = R * (1.65 - ph * 1.5);
    const a = Math.sin(clamp(ph * 1.15) * Math.PI) * lerp(1, .38, eo3(prog(tl, 1.6, 1.2)));
    ctx.save(); ctx.globalAlpha = a * .85;
    ctx.font = `italic 400 ${(15 + 10 * (1 - ph)) * s}px ${F.serif}`; ctx.fillStyle = i % 3 ? C.lavanda : C.ambar;
    ctx.textAlign = 'center'; ctx.fillText(w, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * .8);
    ctx.restore();
  });
  // radar de cinco ejes
  const ax = eo3(prog(tl, 1.2, .8));
  const vals = [.86, .72, .52, .92, .66];
  const grow = eoBack(prog(tl, 1.9, 1.2));
  const pt = (i, r) => { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  ctx.save();
  ctx.globalAlpha = ax;
  for (let ring = 1; ring <= 3; ring++) {
    ctx.beginPath(); for (let i = 0; i <= 5; i++) { const [x, y] = pt(i % 5, R * .85 * ring / 3); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = rgba(C.hueso, .14); ctx.lineWidth = 1 * s; ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const [x, y] = pt(i, R * .85); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = rgba(C.hueso, .18); ctx.stroke();
    const [lx, ly] = pt(i, R * 1.05);
    CH.sansLabel(ctx, EJES[i], lx, ly, 15 * s, C.gris, lx < cx - 5 ? 'right' : lx > cx + 5 ? 'left' : 'center', ax);
  }
  if (grow > 0) {
    glow(ctx, cx, cy, R * .9, C.violeta, .25 * grow);
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) { const k = i % 5; const [x, y] = pt(k, R * .85 * vals[k] * grow * (1 + .035 * Math.sin(tl * 1.4 + k))); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.fillStyle = rgba(C.violeta, .28); ctx.fill(); ctx.strokeStyle = C.violeta; ctx.lineWidth = 2.4 * s; ctx.stroke();
    for (let k = 0; k < 5; k++) { const [x, y] = pt(k, R * .85 * vals[k] * grow * (1 + .035 * Math.sin(tl * 1.4 + k))); ctx.fillStyle = C.ambar; ctx.beginPath(); ctx.arc(x, y, 4.5 * s, 0, 6.283); ctx.fill(); }
  }
  ctx.restore();
  const n = Math.floor(800 * eo3(prog(tl, .1, 2.2)));
  label(ctx, `${String(n).padStart(3, '0')} / 800 palabras`, cx, cy + R * 1.28, 17 * s, C.ambar, 'center', eo3(prog(tl, .1, .4)));
};

/* E07 · bote: pedimos puntos cuando queríamos decir ganar; el diseño lo corrige */
function boatPos(t, cx, cy, R) {
  const lc = [cx - R * .38, cy + R * .12], lr = R * .26;
  const flag = [cx + R * .78, cy - R * .5];
  const loopEnd = 3.1, travel = 1.9;
  if (t < loopEnd) { const a = t * 2.4 + 1.2; return [lc[0] + Math.cos(a) * lr, lc[1] + Math.sin(a) * lr * .8, a + Math.PI / 2]; }
  const a0 = loopEnd * 2.4 + 1.2, p0 = [lc[0] + Math.cos(a0) * lr, lc[1] + Math.sin(a0) * lr * .8];
  const u = eio(clamp((t - loopEnd) / travel));
  const c1 = [p0[0] + Math.cos(a0 + Math.PI / 2) * R * .5, p0[1] + Math.sin(a0 + Math.PI / 2) * R * .4], c2 = [flag[0] - R * .5, flag[1] + R * .35];
  const B = (k) => Math.pow(1 - u, 3) * p0[k] + 3 * Math.pow(1 - u, 2) * u * c1[k] + 3 * (1 - u) * u * u * c2[k] + u * u * u * flag[k];
  const u2 = clamp(u + .01), B2 = (k) => Math.pow(1 - u2, 3) * p0[k] + 3 * Math.pow(1 - u2, 2) * u2 * c1[k] + 3 * (1 - u2) * u2 * u2 * c2[k] + u2 * u2 * u2 * flag[k];
  let x = B(0), y = B(1); const hd = Math.atan2(B2(1) - y, B2(0) - x);
  if (t > loopEnd + travel) { y += Math.sin(t * 2) * 2; x -= R * .07; }
  return [x, y, u >= 1 ? 0 : hd];
}
G.bote = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  // laguna
  const lg = ctx.createRadialGradient(cx, cy, R * .2, cx, cy, R * 1.25);
  lg.addColorStop(0, rgba('#2B2440', .9)); lg.addColorStop(1, rgba('#2B2440', 0));
  ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.3, R * 1.05, 0, 0, 6.283); ctx.fill();
  for (let k = 0; k < 5; k++) {
    const ph = frac(tl * .18 + k / 5);
    ctx.strokeStyle = rgba(C.lavanda, .12 * (1 - ph)); ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * (.3 + ph * 1.0), R * (.24 + ph * .8), 0, 0, 6.283); ctx.stroke();
  }
  // objetivos de "puntos" dentro del bucle
  const lc = [cx - R * .38, cy + R * .12];
  const fadeLoop = 1 - eo3(prog(tl, 3.1, 1.2));
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + .4, x = lc[0] + Math.cos(a) * R * .1, y = lc[1] + Math.sin(a) * R * .08;
    const bl = .5 + .5 * Math.sin(tl * 7 + k * 2);
    ctx.fillStyle = rgba(C.violeta, (.5 + .5 * bl) * fadeLoop); ctx.beginPath(); ctx.arc(x, y, 5 * s, 0, 6.283); ctx.fill();
  }
  if (fadeLoop > .05) label(ctx, '+puntos', lc[0], lc[1] - R * .42, 17 * s, C.violeta, 'center', fadeLoop * eo3(prog(tl, .4, .5)));
  // ruta pretendida
  const flag = [cx + R * .78, cy - R * .5];
  const routeA = eo3(prog(tl, .8, .8));
  ctx.save(); ctx.setLineDash([6 * s, 8 * s]); ctx.strokeStyle = rgba(C.ambar, .35 * routeA); ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.moveTo(cx - R * 1.05, cy + R * .55); ctx.quadraticCurveTo(cx, cy + R * .2, flag[0], flag[1]); ctx.stroke(); ctx.restore();
  // meta
  const fa = eoBack(prog(tl, .9, .6));
  ctx.save(); ctx.translate(flag[0], flag[1]); ctx.scale(fa, fa);
  ctx.strokeStyle = C.hueso; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * .3); ctx.stroke();
  ctx.fillStyle = C.ambar; ctx.beginPath(); ctx.moveTo(0, -R * .3); ctx.lineTo(R * .17, -R * .24 + Math.sin(tl * 4) * 2 * s); ctx.lineTo(0, -R * .18); ctx.fill();
  ctx.restore();
  label(ctx, 'meta', flag[0], flag[1] + R * .1, 16 * s, C.ambar, 'center', fa);
  // estela
  const tt = Math.max(0, tl);
  ctx.save(); ctx.lineCap = 'round';
  for (let k = 1; k < 46; k++) {
    const ta = tt - k * .035, tb = tt - (k - 1) * .035; if (ta < 0) break;
    const [xa, ya] = boatPos(ta, cx, cy, R), [xb, yb] = boatPos(tb, cx, cy, R);
    const inLoop = ta < 3.1;
    ctx.strokeStyle = rgba(inLoop ? C.violeta : C.ambar, (1 - k / 46) * .8 * (inLoop ? Math.max(fadeLoop, .25) : 1));
    ctx.lineWidth = (4 - k * .07) * s; ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
  }
  ctx.restore();
  // bote
  const [bx, by, hd] = boatPos(tt, cx, cy, R);
  const onWay = tl > 3.1;
  glow(ctx, bx, by, R * .25, onWay ? C.ambar : C.violeta, .45);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(hd);
  const L = R * .11;
  ctx.beginPath(); ctx.moveTo(L, 0); ctx.quadraticCurveTo(L * .2, -L * .5, -L * .7, -L * .38); ctx.lineTo(-L * .7, L * .38); ctx.quadraticCurveTo(L * .2, L * .5, L, 0);
  ctx.fillStyle = C.hueso; ctx.fill();
  ctx.restore();
  label(ctx, onWay ? 'mismo sistema, mejor diseño' : 'hace lo que pedimos', cx, cy + R * 1.12, 17 * s, onWay ? C.ambar : C.violeta, 'center', eo3(prog(tl, 1.2, .5)));
};

/* E08 · mente: conducta sin conciencia, rodeada de anillos de permisos */
const PERFIL = [[-.35, .95], [-.42, .62], [-.55, .38], [-.63, .06], [-.6, -.28], [-.5, -.58], [-.28, -.8], [.02, -.87], [.28, -.78], [.44, -.58], [.5, -.36], [.53, -.2], [.49, -.1], [.6, .04], [.63, .09], [.52, .16], [.54, .25], [.5, .3], [.53, .37], [.46, .43], [.48, .53], [.36, .61], [.21, .63], [.16, .8], [.13, .95]];
const PERFIL_PTS = (() => {
  const seg = []; let tot = 0;
  for (let i = 1; i < PERFIL.length; i++) { const d = Math.hypot(PERFIL[i][0] - PERFIL[i - 1][0], PERFIL[i][1] - PERFIL[i - 1][1]); seg.push(d); tot += d; }
  const out = [], N = 210;
  for (let k = 0; k < N; k++) {
    let d = k / (N - 1) * tot, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const u = d / seg[i], a = PERFIL[i], b = PERFIL[i + 1];
    out.push([lerp(a[0], b[0], u) + (hash(k) - .5) * .02, lerp(a[1], b[1], u) + (hash(k + 99) - .5) * .02]);
  }
  return out;
})();
const NEURO = Array.from({ length: 16 }, (_, i) => [-.42 + hash(i * 4.1) * .78, -.62 + hash(i * 6.3) * .85]);
G.mente = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const S = R * .82, hx = cx - R * .05;
  // anillos de permisos que se cierran
  for (let k = 0; k < 3; k++) {
    const rad = R * (1.0 + k * .11), segs = 10 + k * 4;
    const close = eo3(prog(tl, 2.0 + k * .35, 1.2));
    const rot = tl * (.08 + k * .04) * (k % 2 ? -1 : 1);
    ctx.save(); ctx.strokeStyle = rgba(C.ambar, .5 - k * .12); ctx.lineWidth = (2.4 - k * .5) * s; ctx.lineCap = 'round';
    for (let i = 0; i < segs; i++) {
      const a0 = rot + i / segs * 6.283, gap = lerp(.55, .14, close) * 6.283 / segs;
      const app = eo3(prog(tl, .4 + k * .2 + i * .02, .5)); if (app <= 0) continue;
      ctx.globalAlpha = app; ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a0 + 6.283 / segs - gap); ctx.stroke();
    }
    ctx.restore();
  }
  glow(ctx, hx, cy - R * .1, R * .9, C.violeta, .2 + v.pulse * .05);
  // red interna (la conducta)
  const net = eo3(prog(tl, 1.1, 1));
  ctx.save();
  for (let i = 0; i < NEURO.length; i++) for (let j = i + 1; j < NEURO.length; j++) {
    const a = NEURO[i], b = NEURO[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d > .36) continue;
    const pulse = .5 + .5 * Math.sin(tl * 3 - (i + j) * .7);
    ctx.strokeStyle = rgba(C.violeta, (.15 + .4 * pulse) * net); ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(hx + a[0] * S, cy + a[1] * S); ctx.lineTo(hx + b[0] * S, cy + b[1] * S); ctx.stroke();
  }
  NEURO.forEach((p, i) => { const on = .5 + .5 * Math.sin(tl * 2.2 + i * 1.3); ctx.fillStyle = rgba(i % 4 ? C.violeta : C.lavanda, net * (.5 + .5 * on)); ctx.beginPath(); ctx.arc(hx + p[0] * S, cy + p[1] * S, (2.5 + on * 1.8) * s, 0, 6.283); ctx.fill(); });
  ctx.restore();
  // perfil hecho de partículas
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  PERFIL_PTS.forEach((p, k) => {
    const e = eo3(prog(tl, hash(k * 3.3) * .9, 1.1));
    const ang = hash(k * 7.1) * 6.283, d = R * (1 + hash(k * 1.7));
    const x = lerp(cx + Math.cos(ang) * d, hx + p[0] * S, e), y = lerp(cy + Math.sin(ang) * d, cy + p[1] * S, e);
    const tw = .6 + .4 * Math.sin(tl * 3 + k);
    ctx.fillStyle = rgba(C.hueso, (.35 + .6 * tw) * e);
    ctx.beginPath(); ctx.arc(x, y, 1.9 * s, 0, 6.283); ctx.fill();
  });
  ctx.restore();
  label(ctx, 'permisos · supervisión · responsables', cx, cy + R * 1.34, 16 * s, C.ambar, 'center', eo3(prog(tl, 3, .6)));
};

/* E09 · ficha: antes de activar un agente */
const FILAS = ['Tarea concreta', 'Lo que puede hacer solo', 'Cuándo pide autorización', 'Quién responde', 'Cómo se detiene'];
G.ficha = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const w = R * 1.35, h = R * 1.6, enter = eo3(prog(tl, 0, .8));
  ctx.save();
  ctx.translate(cx, cy + (1 - enter) * R * .4); ctx.rotate(-.04 * enter); ctx.translate(-cx, -cy);
  ctx.globalAlpha = enter;
  glow(ctx, cx + R * .1, cy + R * .2, R * 1.2, '#000000', .55);
  rr(ctx, cx - w / 2, cy - h / 2, w, h, 16 * s); ctx.fillStyle = C.ink2; ctx.fill();
  ctx.strokeStyle = rgba(C.hueso, .16); ctx.lineWidth = 1.4 * s; ctx.stroke();
  const x0 = cx - w / 2 + w * .09;
  label(ctx, 'FICHA · ANTES DE ACTIVAR UN AGENTE', x0, cy - h / 2 + h * .09, 12 * s, C.ambar, 'left');
  ctx.fillStyle = rgba(C.hueso, .1); ctx.fillRect(x0, cy - h / 2 + h * .14, w * .82, 1.2 * s);
  FILAS.forEach((f, i) => {
    const ry = cy - h / 2 + h * (.24 + i * .13);
    const a = eo3(prog(tl, .35 + i * .42, .4));
    const ck = prog(tl, .7 + i * .42, .3);
    ctx.globalAlpha = enter * a;
    const bz = 22 * s;
    rr(ctx, x0, ry - bz / 2, bz, bz, 5 * s); ctx.strokeStyle = rgba(ck > 0 ? C.ambar : C.hueso, .8); ctx.lineWidth = 1.6 * s; ctx.stroke();
    if (ck > 0) {
      ctx.fillStyle = rgba(C.ambar, .2); ctx.fill();
      ctx.strokeStyle = C.ambar; ctx.lineWidth = 2.6 * s; ctx.lineCap = 'round'; ctx.beginPath();
      const p1 = clamp(ck * 2), p2 = clamp(ck * 2 - 1);
      ctx.moveTo(x0 + bz * .22, ry); ctx.lineTo(x0 + bz * (.22 + .2 * p1), ry + bz * .2 * p1);
      if (p2 > 0) ctx.lineTo(x0 + bz * (.42 + .38 * p2), ry + bz * (.2 - .48 * p2));
      ctx.stroke();
    }
    CH.sansLabel(ctx, f, x0 + bz * 1.6, ry, 19 * s, C.hueso, 'left', 1);
    ctx.fillStyle = rgba(C.hueso, .08); ctx.fillRect(x0 + bz * 1.6, ry + 18 * s, w * .62, 1 * s);
  });
  // interruptor: de "en pausa" a "activo" solo con todo respondido
  const sw = eo3(prog(tl, 3.0, .5)), on = eio(prog(tl, 3.4, .4));
  ctx.globalAlpha = enter * sw;
  const sy = cy + h / 2 - h * .1, swW = 58 * s, swH = 30 * s;
  rr(ctx, x0, sy - swH / 2, swW, swH, swH / 2); ctx.fillStyle = on > .5 ? rgba(C.ambar, .9) : rgba(C.hueso, .15); ctx.fill();
  ctx.fillStyle = on > .5 ? C.ink : C.hueso; ctx.beginPath(); ctx.arc(x0 + swH / 2 + on * (swW - swH), sy, swH * .38, 0, 6.283); ctx.fill();
  CH.sansLabel(ctx, on > .5 ? 'Agente activo, con una persona a cargo' : 'Agente en pausa', x0 + swW + 14 * s, sy, 17 * s, on > .5 ? C.ambar : C.gris, 'left', 1);
  ctx.restore();
  if (on > .5) glow(ctx, x0 + swW / 2, cy + h / 2 - h * .1, R * .3, C.ambar, .35 * (.7 + .3 * Math.sin(tl * 3)));
};

/* E10 · brote: un futuro que se construye en siete días */
const ARBOL = (() => {
  const br = [];
  function grow(x, y, ang, len, depth, t0, seed) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len, dur = .45 + depth * .03;
    br.push({ x, y, x2, y2, depth, t0, dur, seed });
    if (depth >= 6) return;
    const n = depth < 2 ? 2 : (hash(seed) < .35 ? 3 : 2);
    for (let i = 0; i < n; i++) {
      const sp = (.32 + hash(seed * 3 + i) * .32) * (i - (n - 1) / 2) * 1.6 + (hash(seed * 7 + i) - .5) * .25;
      grow(x2, y2, ang + sp, len * (.72 + hash(seed + i * 5) * .12), depth + 1, t0 + dur * .85, seed * 2.17 + i * 1.3 + 1);
    }
  }
  grow(0, 0, -Math.PI / 2, .34, 0, .5, 1.7);
  return br;
})();
G.brote = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const bx = cx, by = cy + R * .78, S = R;
  // línea de siete días
  const gx0 = cx - R * .95, gx1 = cx + R * .95;
  ctx.save();
  ctx.strokeStyle = rgba(C.hueso, .25); ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(gx0, by); ctx.lineTo(lerp(gx0, gx1, eo3(prog(tl, 0, .8))), by); ctx.stroke();
  for (let d = 0; d < 7; d++) {
    const x = lerp(gx0 + R * .1, gx1 - R * .1, d / 6), on = eo3(prog(tl, .3 + d * .33, .3));
    ctx.fillStyle = on > 0 ? mix(C.grisO, C.ambar, on) : C.grisO;
    ctx.beginPath(); ctx.arc(x, by, (4 + on * 2) * s, 0, 6.283); ctx.fill();
    label(ctx, `día ${d + 1}`, x, by + 22 * s, 12 * s, on > .5 ? C.ambar : C.gris, 'center', eo3(prog(tl, .1 + d * .05, .4)));
  }
  ctx.restore();
  // ramas
  ctx.save(); ctx.lineCap = 'round';
  const sway = t => Math.sin(tl * 1.1 + t) * .012;
  ARBOL.forEach(b => {
    const p = eo3(prog(tl, b.t0, b.dur)); if (p <= 0) return;
    const sw = sway(b.depth) * b.depth;
    const x1 = bx + (b.x + sw * b.y * -1) * S, y1 = by + b.y * S, x2 = bx + (b.x2 + sw * b.y2 * -1) * S, y2 = by + b.y2 * S;
    ctx.strokeStyle = mix(C.hueso, C.lavanda, b.depth / 6); ctx.globalAlpha = .9 - b.depth * .08;
    ctx.lineWidth = Math.max(1, (7 - b.depth * 1.05)) * s;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, p), lerp(y1, y2, p)); ctx.stroke();
    if (b.depth === 6 && p >= 1) {
      const bl = eoBack(prog(tl, b.t0 + b.dur, .5)), col = hash(b.seed) < .5 ? C.ambar : C.violeta;
      ctx.globalAlpha = 1;
      glow(ctx, x2, y2, 16 * s * bl, col, .5);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x2, y2, (3 + 2 * Math.sin(tl * 2 + b.seed)) * s * bl, 0, 6.283); ctx.fill();
    }
  });
  ctx.restore();
  glow(ctx, bx, by, R * .4, C.ambar, .3 * eo3(prog(tl, 0, .6)));
};

/* genérica · ondas: para episodios nuevos sin escena propia */
G.ondas = function (ctx, v) {
  const { cx, cy, R, tl, s } = v;
  const a = eo3(prog(tl, 0, 1));
  [[C.ambar, 0, .62], [C.violeta, 1, .9]].forEach(([col, who, rad]) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const th = i / 240 * 6.283;
      const env = CH.speechEnv(tl - (i / 240) * 1.4, who * 7.31) * CH.voiceGate(tl - (i / 240) * 1.4, who);
      const r = R * rad * a * (1 + .14 * env * Math.sin(th * 18 + tl * 6));
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(col, .9); ctx.lineWidth = 2.4 * s; ctx.stroke(); ctx.restore();
  });
  glow(ctx, cx, cy, R, C.violeta, .2);
};
})();
