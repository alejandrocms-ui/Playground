/* Escenas de la pieza, transiciones y render(t). */
(function () {
'use strict';
const CH = window.CH, D = window.CH_DATA;
const { C, F, clamp, lerp, prog, eo3, eo5, eio, eoBack, frac, hash, rgba, glow, rr, kinetic, charsLine, typed, wave, BAR, BEAT } = CH;

/* logo oficial, separado en <CÓDIGO> y HUMANO para animarlos por partes */
const LOGO = { img: null, w: 987, h: 291, split: 134 };
CH.setLogo = function (src) { const im = new Image(); im.src = src; LOGO.img = im; return im.decode ? im.decode().catch(() => { }) : Promise.resolve(); };
function drawLogo(ctx, cx, cy, width, t, start, o = {}) {
  if (!LOGO.img || !LOGO.img.complete) return;
  const sc = width / LOGO.w, w = width, h = LOGO.h * sc, x0 = cx - w / 2, y0 = cy - h / 2;
  const top = LOGO.split;
  // <CÓDIGO>: se abre desde el centro como un par de corchetes
  const a = o.instant ? 1 : eo5(prog(t, start, .9));
  if (a > 0) {
    ctx.save();
    const cw = w * a;
    ctx.beginPath(); ctx.rect(cx - cw / 2, y0 - 2, cw, top * sc + 4); ctx.clip();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.drawImage(LOGO.img, 0, 0, LOGO.w, top, x0, y0, w, top * sc);
    ctx.restore();
  }
  // HUMANO: sube desde abajo detrás de una onda
  const b = o.instant ? 1 : eo3(prog(t, start + .35, .8));
  if (b > 0) {
    ctx.save();
    const by0 = y0 + top * sc, bh = (LOGO.h - top) * sc;
    ctx.beginPath(); ctx.rect(x0 - 4, by0, w + 8, bh + 4); ctx.clip();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.drawImage(LOGO.img, 0, top, LOGO.w, LOGO.h - top, x0, by0 + (1 - b) * bh * 1.05, w, bh);
    ctx.restore();
  }
}
CH.drawLogo = drawLogo;

/* ---------- invitados (para el montaje) ---------- */
function guests() {
  const seen = new Map();
  D.episodios.forEach(ep => (ep.invitados || []).forEach(g => { if (!seen.has(g.nombre)) seen.set(g.nombre, Object.assign({ eps: [] }, g)); seen.get(g.nombre).eps.push(ep.id.slice(-3)); }));
  return [...seen.values()];
}
CH.guests = guests;
function guestLine(ep) {
  const gs = ep.invitados || [];
  if (!gs.length) return { name: 'Con Felipe y Alejandro', role: '' };
  if (gs.length === 1) return { name: 'Con ' + gs[0].nombre, role: gs[0].rol };
  const sameRole = gs.every(g => g.rol === gs[0].rol);
  const names = gs.map(g => g.nombre);
  const nm = 'Con ' + names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  return { name: nm, role: sameRole ? gs[0].rol.replace(/^Cofundador/, 'Cofundadores') : gs.map(g => g.rol).join(' · ') };
}
CH.guestLine = guestLine;

/* ---------- cámara ---------- */
function camera(g, t, tl, dur, presenter) {
  const s = g.s;
  const push = presenter && tl > dur ? 1 + .045 + .012 * Math.sin((tl - dur) * .7) : 1 + .045 * eio(clamp(tl / dur));
  return { x: Math.sin(t * .21) * 14 * s + Math.sin(t * .07) * 10 * s, y: Math.cos(t * .17) * 9 * s, z: push };
}

/* ---------- escena: apertura en frío ---------- */
function sceneCold(ctx, g, sec, tl, t) {
  const { W, H, s, portrait } = g;
  const co = D.aperturaEnFrio, v = sec.dur < BAR * 1.5;
  const k = v ? .55 : 1; // compresión para el corte vertical
  const lbl = portrait ? 26 * s : 22 * s;
  typed(ctx, co.etiqueta, W / 2, H * (portrait ? .3 : .27), lbl, C.ambar, tl, .05, { align: 'center', cps: 70 });
  const sz1 = portrait ? 58 * s : 54 * s;
  kinetic(ctx, co.linea1, { fam: 'serif', size: sz1, x: W / 2, y: H * (portrait ? .36 : .34), maxW: W * (portrait ? .84 : .7), align: 'center', t: tl, start: .25 * k, stagger: .16 * k, color: C.gris, maxLines: 2 });
  const sz2 = portrait ? 150 * s : 168 * s;
  charsLine(ctx, co.linea2, { fam: 'serif', size: sz2, x: W / 2, y: H * (portrait ? .56 : .62), t: tl, start: BAR * k * .98, stagger: .04 * k, maxW: W * .9 });
  // las dos voces: la humana pregunta, Miles responde
  const wy = H * (portrait ? .74 : .8), x0 = W * .12, x1 = W * .88;
  const grow = eo3(prog(tl, 0, .8));
  wave(ctx, x0, x1, wy, 60 * s * grow, t, 0, C.ambar, 2.4 * s, { history: 2 });
  wave(ctx, x0, x1, wy, 60 * s * grow, t, 1, C.violeta, 2 * s, { history: 2, alpha: .9 });
  CH.label(ctx, 'VOZ HUMANA', x0, wy + 70 * s, 13 * s, C.ambar, 'left', grow * .8);
  CH.label(ctx, 'MILES · VOZ DE IA', x1, wy + 70 * s, 13 * s, C.violeta, 'right', grow * .8);
}

/* ---------- escena: título ---------- */
function sceneTitle(ctx, g, sec, tl, t) {
  const { W, H, s, portrait } = g;
  const v = sec.dur < BAR * 2.5, k = v ? .7 : 1;
  // destello en el golpe
  const flash = Math.exp(-Math.max(0, tl) * 2.2) * clamp(tl * 20);
  glow(ctx, W / 2, H * .45, Math.max(W, H) * .7, C.violeta, .35 * flash);
  glow(ctx, W / 2, H * .45, Math.max(W, H) * .4, C.ambar, .25 * flash);
  // rayos de luz
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + t * .05, len = Math.max(W, H) * .8;
    ctx.globalAlpha = (.035 + .03 * Math.sin(t * .8 + i)) * eo3(prog(tl, -.7, 1));
    ctx.fillStyle = i % 2 ? C.violeta : C.ambar;
    ctx.beginPath(); ctx.moveTo(W / 2, H * .45); ctx.lineTo(W / 2 + Math.cos(a - .04) * len, H * .45 + Math.sin(a - .04) * len); ctx.lineTo(W / 2 + Math.cos(a + .04) * len, H * .45 + Math.sin(a + .04) * len); ctx.fill();
  }
  ctx.restore();
  const lw = portrait ? W * .78 : Math.min(W * .5, H * 1.0);
  const ly = H * (portrait ? .38 : .4);
  drawLogo(ctx, W / 2, ly, lw, tl, .05);
  const below = ly + lw * LOGO.h / LOGO.w / 2;
  charsLine(ctx, D.programa.temporada, { fam: 'serif', size: (portrait ? 74 : 70) * s, x: W / 2, y: below + 100 * s, t: tl, start: .9 * k, stagger: .035, color: C.ambar, emColor: C.ambar });
  const n = D.episodios.length, f0 = D.episodios[0].fecha, f1 = D.episodios[n - 1].fecha;
  const M = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const rng = `${n} EPISODIOS · ${M[+f0.slice(5, 7) - 1]} A ${M[+f1.slice(5, 7) - 1]} ${f1.slice(0, 4)}`;
  typed(ctx, rng, W / 2, below + 160 * s, (portrait ? 22 : 20) * s, C.gris, tl, 1.5 * k, { align: 'center', cps: 60 });
  if (!v) {
    kinetic(ctx, D.programa.subtitulo, { fam: 'sans', size: 30 * s, weight: 500, x: W / 2, y: below + 205 * s, maxW: W * .8, align: 'center', t: tl, start: 2.3, stagger: .06, color: C.hueso });
    kinetic(ctx, 'Con ' + D.programa.conductores.join(' y '), { fam: 'sans', size: 24 * s, weight: 400, x: W / 2, y: below + 256 * s, maxW: W * .8, align: 'center', t: tl, start: 3.1, stagger: .05, color: C.gris });
  }
}

/* ---------- escena: episodio ---------- */
function sceneEp(ctx, g, sec, tl, t, ctxInfo) {
  const { W, H, s, portrait } = g;
  const ep = sec.ep, compact = sec.compact;
  const cam = ctxInfo.cam;
  // número enorme de fondo, con paralaje
  const num = ep.id.slice(-2);
  ctx.save();
  ctx.font = `400 ${(portrait ? 560 : 640) * s}px ${F.serif}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = .042 * eo3(prog(tl, -.3, 1));
  ctx.fillStyle = C.lavanda;
  ctx.fillText(num, g.vis.cx + cam.x * 1.8 + (portrait ? 0 : W * .02), g.vis.cy + cam.y * 1.8 + (1 - eo3(prog(tl, -.3, 1.2))) * 60 * s);
  ctx.restore();
  // visual generativo con empuje de cámara
  const gen = CH.gens[ep.escena] || CH.gens.ondas;
  ctx.save();
  ctx.translate(g.vis.cx - cam.x * .6, g.vis.cy - cam.y * .6); ctx.scale(cam.z, cam.z); ctx.translate(-g.vis.cx, -g.vis.cy);
  gen(ctx, { cx: g.vis.cx, cy: g.vis.cy, R: g.vis.R, tl: compact ? tl * 1.7 + 1.1 : tl + .95, t, s, pulse: ctxInfo.pulse, portrait });
  ctx.restore();
  // columna de texto
  const tx = g.text.x, tw = g.text.w;
  let y = g.text.y;
  const lbl = `${ep.id} · ${CH.fechaLarga(ep.fecha).toUpperCase()}`;
  const ls = (portrait ? (compact ? 28 : 24) : 21) * s;
  typed(ctx, lbl, tx, y, ls, C.ambar, tl, compact ? 0 : .02, { cps: compact ? 90 : 55 });
  y += ls * 1.5;
  const ts = (portrait ? (compact ? 104 : 80) : 74) * s;
  const tr = kinetic(ctx, ep.titulo, { fam: 'serif', size: ts, x: tx, y, maxW: tw, t: tl, start: compact ? .05 : .12, stagger: compact ? .045 : .085, maxLines: portrait ? 4 : 3, minSize: ts * .7, lh: 1.04 });
  y += tr.h + 22 * s;
  const gl = guestLine(ep);
  const gs = (portrait ? (compact ? 38 : 32) : 28) * s;
  kinetic(ctx, gl.name, { fam: 'sans', size: gs, weight: 500, x: tx, y, maxW: tw, t: tl, start: compact ? .5 : 1.25, stagger: .05, color: C.hueso, maxLines: 2 });
  const gnl = CH.layoutText(ctx, gl.name, { fam: 'sans', size: gs, weight: 500, maxW: tw }).lines.length;
  y += gs * 1.1 * gnl + 4 * s;
  if (gl.role) {
    kinetic(ctx, gl.role, { fam: 'sans', size: gs * .86, weight: 400, x: tx, y, maxW: tw, t: tl, start: compact ? .65 : 1.5, stagger: .04, color: '#B8B3C2', maxLines: 2 });
    y += gs * 1.05;
  }
  if (compact) return;
  y += 34 * s;
  // idea clave
  const is = (portrait ? 40 : 36) * s;
  const qa = eo3(prog(tl, 2.1, .5));
  if (qa > 0) {
    ctx.save(); ctx.globalAlpha = qa; ctx.font = `400 ${is * 2.2}px ${F.serif}`; ctx.fillStyle = C.ambar;
    ctx.fillText('«', tx - is * .08, y + is * 1.45 + (1 - qa) * 10 * s); ctx.restore();
  }
  const ir = kinetic(ctx, ep.idea, { fam: 'serif', size: is, x: tx + is * 1.05, y, maxW: tw - is * 1.05, t: tl, start: 2.25, stagger: .06, color: C.lavanda, emColor: C.ambar, maxLines: 3, lh: 1.15 });
  y += ir.h + 30 * s;
  // código útil
  if (ep.codigoUtil) {
    const ca = eo3(prog(tl, 3.6, .5));
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha = ca;
      const cs = (portrait ? 21 : 18) * s;
      ctx.translate((1 - ca) * -20 * s, 0);
      ctx.font = `500 ${cs}px ${F.mono}`; try { ctx.letterSpacing = (cs * .08) + 'px'; } catch (e) { }
      ctx.fillStyle = C.ambar; ctx.fillText('</> CÓDIGO ÚTIL', tx, y + cs);
      const lw = ctx.measureText('</> CÓDIGO ÚTIL').width;
      try { ctx.letterSpacing = '0px'; } catch (e) { }
      ctx.font = `400 ${cs * 1.15}px ${F.sans}`; ctx.fillStyle = C.hueso;
      const room = tw - lw - cs * 1.2;
      let txt = ep.codigoUtil;
      if (ctx.measureText(txt).width > room) { ctx.fillText(txt, tx, y + cs * 2.7); }
      else ctx.fillText(txt, tx + lw + cs * 1.1, y + cs);
      ctx.restore();
    }
  }
}

/* ---------- escena: montaje de invitados ---------- */
function sceneMontage(ctx, g, sec, tl, t) {
  const { W, H, s, portrait } = g;
  const gs = guests(); const n = gs.length;
  typed(ctx, 'LAS VOCES DE LA TEMPORADA', W / 2, H * (portrait ? .1 : .14), (portrait ? 24 : 20) * s, C.ambar, tl, 0, { align: 'center', cps: 60 });
  charsLine(ctx, 'Personas que contaron su historia', { fam: 'serif', size: (portrait ? 60 : 56) * s, x: W / 2, y: H * (portrait ? .16 : .23), t: tl, start: .15, stagger: .02, maxW: W * .9 });
  const cols = portrait ? 2 : Math.min(3, n), rows = Math.ceil(n / cols);
  const cw = portrait ? W * .44 : Math.min(W * .27, 520 * s), chh = portrait ? H * .23 : H * .3;
  const gx0 = W / 2 - cw * cols / 2, gy0 = H * (portrait ? .24 : .32);
  const focusDur = (sec.dur - 1.2) / Math.max(1, n);
  gs.forEach((gu, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const lastRow = r === rows - 1, inRow = lastRow ? n - r * cols : cols;
    const cx = W / 2 + (c - (inRow - 1) / 2) * cw, cy = gy0 + r * chh + chh * .32;
    const a = eoBack(prog(tl, .05 + i * .1, .7));
    if (a <= 0) return;
    const focus = Math.max(0, Math.sin(clamp((tl - 1.0 - i * focusDur) / focusDur) * Math.PI));
    const ar = (portrait ? 70 : 64) * s * (1 + .08 * focus) * a;
    ctx.save(); ctx.globalAlpha = clamp(a);
    glow(ctx, cx, cy, ar * 2.4, i % 2 ? C.violeta : C.ambar, .12 + .3 * focus);
    // anillo de voz circular
    ctx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const th = k / 120 * 6.283, env = CH.speechEnv(t * 1.3 - k / 120 + i * 3, i * 2.1);
      const rad = ar * (1.18 + (.06 + .22 * focus) * env * Math.sin(th * 14 + t * 8));
      const x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(i % 2 ? C.violeta : C.ambar, .5 + .5 * focus); ctx.lineWidth = 2 * s; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, ar, 0, 6.283); ctx.fillStyle = C.ink2; ctx.fill();
    ctx.strokeStyle = rgba(C.hueso, .2); ctx.lineWidth = 1.2 * s; ctx.stroke();
    const ini = gu.nombre.split(' ').filter(w => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map(w => w[0]).join('');
    ctx.font = `400 ${ar * .9}px ${F.serif}`; ctx.fillStyle = C.hueso; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ini, cx, cy + ar * .05);
    ctx.restore();
    const ny = cy + ar * 1.25 + 34 * s;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.textAlign = 'center';
    ctx.font = `400 ${(portrait ? 34 : 32) * s}px ${F.serif}`; ctx.fillStyle = C.hueso; ctx.fillText(gu.nombre, cx, ny);
    ctx.font = `400 ${(portrait ? 21 : 19) * s}px ${F.sans}`; ctx.fillStyle = C.gris;
    const role = gu.rol; ctx.fillText(role, cx, ny + 30 * s, cw * .92);
    ctx.font = `500 ${15 * s}px ${F.mono}`; ctx.fillStyle = C.ambar; ctx.fillText(gu.eps.join(' · '), cx, ny + 58 * s);
    ctx.restore();
  });
}

/* ---------- escena: cierre ---------- */
function sceneClose(ctx, g, sec, tl, t, info) {
  const { W, H, s, portrait } = g;
  const v = sec.dur < BAR * 4;
  const P = D.programa;
  const p1End = v ? BAR * 1 : BAR * 2, p2End = v ? BAR * 1 : BAR * 3;
  // fase 1: la tesis, con las dos voces fundiéndose
  if (tl < p1End + .5) {
    const out = 1 - eo3(prog(tl, p1End - .2, .5));
    const sz = (portrait ? 108 : 120) * s;
    ctx.save(); ctx.globalAlpha = out;
    charsLine(ctx, P.tesis[0], { fam: 'serif', size: sz, x: W / 2, y: H * (portrait ? .38 : .4), t: tl, start: .05, stagger: .03, maxW: W * .9 });
    charsLine(ctx, P.tesis[1], { fam: 'serif', size: sz, x: W / 2, y: H * (portrait ? .38 : .4) + sz * 1.08, t: tl, start: v ? .55 : .95, stagger: .035, maxW: W * .9 });
    const amp = eio(prog(tl, .4, v ? 1.4 : 2.8));
    const wy = H * (portrait ? .7 : .78), x0 = W * .1, x1 = W * .9;
    // Miles como envolvente que amplifica la voz humana
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (let k = 0; k <= 200; k++) { const u = k / 200, x = lerp(x0, x1, u), e = (CH.speechEnv(t - (1 - u) * 1.4, 0) + .1) * Math.pow(Math.sin(u * Math.PI), .6); ctx.lineTo(x, wy - (30 + 70 * amp) * s * e); }
    for (let k = 200; k >= 0; k--) { const u = k / 200, x = lerp(x0, x1, u), e = (CH.speechEnv(t - (1 - u) * 1.4, 0) + .1) * Math.pow(Math.sin(u * Math.PI), .6); ctx.lineTo(x, wy + (30 + 70 * amp) * s * e); }
    ctx.fillStyle = rgba(C.violeta, .16 + .12 * amp); ctx.fill(); ctx.restore();
    wave(ctx, x0, x1, wy, (40 + 70 * amp) * s, t, 0, C.ambar, 2.6 * s, { gate: false, gain: .9 });
    ctx.restore();
  }
  // fase 2: lo complicado no tiene por qué ser complejo
  if (!v && tl > p1End - .3 && tl < p2End + .5) {
    const out = 1 - eo3(prog(tl, p2End - .2, .5));
    ctx.save(); ctx.globalAlpha = out;
    kinetic(ctx, P.tesis2, { fam: 'serif', size: (portrait ? 92 : 96) * s, x: W / 2, y: H * .36, maxW: W * (portrait ? .86 : .7), align: 'center', t: tl, start: p1End, stagger: .09, maxLines: 3, lh: 1.05 });
    ctx.restore();
  }
  // fase 3: marca y llamado
  const t3 = tl - p2End;
  if (t3 > -.2) {
    const fadeEnd = info.presenter ? 1 : 1 - eo3(prog(tl, sec.dur - .7, .65));
    ctx.save(); ctx.globalAlpha = fadeEnd;
    glow(ctx, W / 2, H * .42, Math.max(W, H) * .5, C.violeta, .22 * Math.exp(-Math.max(0, t3) * 1.5));
    const lw = portrait ? W * .74 : Math.min(W * .44, H * .9);
    const ly = H * (portrait ? .36 : .36);
    drawLogo(ctx, W / 2, ly, lw, t3, 0);
    const below = ly + lw * LOGO.h / LOGO.w / 2;
    kinetic(ctx, P.horario, { fam: 'serif', size: (portrait ? 58 : 56) * s, x: W / 2, y: below + 60 * s, maxW: W * .9, align: 'center', t: t3, start: .7, stagger: .07, color: C.hueso, maxLines: 2 });
    const hl = CH.layoutText(ctx, P.horario, { fam: 'serif', size: (portrait ? 58 : 56) * s, maxW: W * .9 }).lines.length;
    const y2 = below + 60 * s + hl * (portrait ? 62 : 60) * s + 28 * s;
    typed(ctx, P.canal.toUpperCase(), W / 2, y2 + 24 * s, (portrait ? 28 : 26) * s, C.ambar, t3, 1.4, { align: 'center', cps: 30 });
    kinetic(ctx, P.conductores.join(' · '), { fam: 'sans', size: (portrait ? 26 : 24) * s, weight: 400, x: W / 2, y: y2 + 62 * s, maxW: W * .9, align: 'center', t: t3, start: 2.0, stagger: .05, color: C.gris, maxLines: 2 });
    const wy = H * .9, wa = eo3(prog(t3, .3, 1));
    wave(ctx, W * .2, W * .8, wy, 26 * s * wa, t, 0, C.ambar, 2 * s, { alpha: .8 });
    wave(ctx, W * .2, W * .8, wy, 26 * s * wa, t, 1, C.violeta, 1.8 * s, { alpha: .8 });
    ctx.restore();
  }
}

const SCENES = { cold: sceneCold, title: sceneTitle, ep: sceneEp, montage: sceneMontage, close: sceneClose };

/* ---------- una escena completa (fondo + contenido) ---------- */
function drawScene(ctx, g0, sec, tl, t, tlObj, presenter) {
  const g = sec.compact ? CH.geom(g0.W, g0.H, true) : g0;
  const pulse = CH.beatPulse(tlObj, t);
  const cam = camera(g, t, tl, sec.dur, presenter);
  CH.background(ctx, g, t, cam, pulse, sec.type === 'cold' ? { warm: -.04, cool: -.05 } : {});
  ctx.save();
  // empuje general muy leve para todo el plano
  const z = 1 + (cam.z - 1) * .35;
  ctx.translate(g.W / 2, g.H / 2); ctx.scale(z, z); ctx.translate(-g.W / 2, -g.H / 2);
  SCENES[sec.type](ctx, g, sec, tl, t, { cam, pulse, presenter });
  ctx.restore();
}
CH.drawScene = drawScene;

/* ---------- transiciones: la onda, el corchete y el iris ---------- */
function transKind(next) {
  if (next.type === 'title') return 'iris';
  if (next.type === 'close') return 'wave';
  if (next.type === 'montage') return 'iris';
  return ['wave', 'bracket', 'wave', 'iris'][next.idx % 4];
}
function wipeEdge(g, kind, p, t, center) {
  const { W, H, s } = g;
  if (kind === 'wave') {
    const yb = lerp(H * 1.1, -H * .25, eio(p));
    const pts = [];
    for (let x = 0; x <= W + 1; x += W / 120) {
      const u = x / W;
      const env = CH.speechEnv(t * 1.5 - u * 1.2, 1) * .7 + .3;
      pts.push([x, yb + Math.sin(u * 14 + t * 9) * 46 * s * env + Math.sin(u * 5 - t * 4) * 34 * s]);
    }
    return { kind, pts };
  }
  if (kind === 'bracket') {
    const xc = lerp(-W * .45, W * 1.55, eio(p)), arm = Math.max(W * .28, H * .5);
    return { kind, pts: [[xc - arm, -10], [xc, H / 2], [xc - arm, H + 10]] };
  }
  const fx = center ? W / 2 : g.vis.cx, fy = center ? H * .45 : g.vis.cy;
  return { kind, cx: fx, cy: fy, r: Math.pow(eio(p), 1.15) * Math.hypot(W, H) * 1.05 };
}
function clipReveal(ctx, g, e) {
  const { W, H } = g;
  ctx.beginPath();
  if (e.kind === 'wave') { ctx.moveTo(0, H + 10); e.pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(W, H + 10); ctx.closePath(); }
  else if (e.kind === 'bracket') { ctx.moveTo(-10, -10); e.pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(-10, H + 10); ctx.closePath(); }
  else ctx.arc(e.cx, e.cy, Math.max(.1, e.r), 0, Math.PI * 2);
  ctx.clip();
}
function strokeEdge(ctx, g, e, p) {
  const { s } = g;
  const a = Math.sin(p * Math.PI);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = (off) => {
    ctx.beginPath();
    if (e.kind === 'circle' || e.kind === 'iris') ctx.arc(e.cx, e.cy, Math.max(.1, e.r + off), 0, Math.PI * 2);
    else e.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1] + off) : ctx.moveTo(pt[0], pt[1] + off));
  };
  [[C.ambar, 0, 3.2], [C.violeta, 9 * s, 2.4]].forEach(([col, off, w]) => {
    path(off);
    ctx.strokeStyle = rgba(col, .22 * a); ctx.lineWidth = w * 7 * s; ctx.stroke();
    ctx.strokeStyle = rgba(col, .95 * a); ctx.lineWidth = w * s; ctx.stroke();
  });
  ctx.restore();
}
CH.transKind = transKind;

/* ---------- capa fija: onda inferior e indicador de episodios ---------- */
function overlay(ctx, g, tlObj, t, sec, tl) {
  const { W, H, s, portrait } = g;
  const vis = (sec.type === 'ep' || sec.type === 'montage');
  if (!vis) return;
  const fin = eo3(prog(tl, -.3, .8));
  const nextT = sec.t0 + sec.dur;
  const fout = (sec.idx === tlObj.sections.length - 1) ? 1 : 1;
  const a = fin * fout;
  // onda de conversación al pie
  const wy = H - (portrait ? 70 : 54) * s;
  wave(ctx, W * .04, W * .96, wy, 16 * s, t, 0, C.ambar, 1.6 * s, { alpha: .55 * a, history: 2.4, k: 2.2 });
  wave(ctx, W * .04, W * .96, wy, 16 * s, t, 1, C.violeta, 1.4 * s, { alpha: .55 * a, history: 2.4, k: 2.2 });
  // indicador: un punto por episodio
  const n = D.episodios.length, cur = sec.type === 'ep' ? sec.i : n;
  const dx = 16 * s, x1 = portrait ? W / 2 + (n - 1) * dx / 2 : W - 64 * s, y = portrait ? 58 * s : 60 * s;
  ctx.save(); ctx.globalAlpha = a;
  for (let i = 0; i < n; i++) {
    const x = x1 - (n - 1 - i) * dx;
    ctx.beginPath(); ctx.arc(x, y, (i === cur ? 4.5 : 3) * s, 0, 6.283);
    ctx.fillStyle = i === cur ? C.ambar : i < cur ? rgba(C.hueso, .55) : rgba(C.hueso, .18); ctx.fill();
  }
  ctx.font = `500 ${14 * s}px ${F.mono}`; try { ctx.letterSpacing = (14 * s * .1) + 'px'; } catch (e) { }
  ctx.fillStyle = rgba(C.hueso, .6); ctx.textBaseline = 'middle';
  if (portrait) { ctx.textAlign = 'center'; ctx.fillText('CÓDIGO HUMANO · T1', W / 2, y + 26 * s); }
  else { ctx.textAlign = 'right'; ctx.fillText('CÓDIGO HUMANO · T1', x1 - (n - 1) * dx - 22 * s, y); }
  ctx.restore();
}

/* ---------- render de la línea de tiempo ---------- */
function render(ctx, W, H, tlObj, t, frame) {
  const g = CH.geom(W, H);
  t = clamp(t, 0, tlObj.dur - 1e-4);
  const sec = CH.sectionAt(tlObj, t);
  const next = tlObj.sections[sec.idx + 1];
  const TR = tlObj.TR;
  drawScene(ctx, g, sec, t - sec.t0, t, tlObj, false);
  if (next && t > next.t0 - TR) {
    const p = (t - (next.t0 - TR)) / TR;
    const gN = next.compact ? CH.geom(W, H, true) : g;
    const e = wipeEdge(gN, transKind(next), p, t, next.type !== 'ep');
    ctx.save(); clipReveal(ctx, g, e);
    drawScene(ctx, g, next, t - next.t0, t, tlObj, false);
    ctx.restore();
    strokeEdge(ctx, g, e, p);
  }
  const ovSec = (next && t > next.t0 - TR * .5) ? next : sec;
  overlay(ctx, (ovSec.compact ? CH.geom(W, H, true) : g), tlObj, t, ovSec, t - ovSec.t0);
  CH.finish(ctx, g, t, frame == null ? Math.floor(t * 30) : frame);
}
CH.render = render;

/* ---------- render del modo presentador ---------- */
function renderPresenter(ctx, W, H, tlObj, st, wall) {
  const g = CH.geom(W, H);
  const sec = tlObj.sections[st.idx];
  const TR = .7;
  const el = (wall - st.enter) / 1000;
  const tl = el - TR;
  const t = sec.t0 + Math.max(0, tl); // reloj global para el fondo
  if (st.from != null && el < TR) {
    const fs = tlObj.sections[st.from.idx];
    const ftl = st.from.tl + el;
    drawScene(ctx, g, fs, ftl, fs.t0 + ftl, tlObj, true);
    const p = el / TR;
    const e = wipeEdge(g, st.dir < 0 ? 'iris' : transKind(sec), p, t, sec.type !== 'ep');
    ctx.save(); clipReveal(ctx, g, e); drawScene(ctx, g, sec, tl, t, tlObj, true); ctx.restore();
    strokeEdge(ctx, g, e, p);
  } else {
    drawScene(ctx, g, sec, tl, t, tlObj, true);
  }
  overlay(ctx, g, tlObj, t, sec, tl);
  CH.finish(ctx, g, t, Math.floor(wall / 33));
  return tl;
}
CH.renderPresenter = renderPresenter;
})();
