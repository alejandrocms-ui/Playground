/* Música original, sintetizada en el navegador (Web Audio).
   100 BPM, re menor → fa mayor. Tres movimientos: construcción, respiro y clímax.
   La partitura sale de la línea de tiempo: si se suma un episodio, la música crece. */
(function () {
'use strict';
const CH = window.CH;
const { BAR, BEAT } = CH;
const M = CH.Music = {};

const CHORDS = [
  { pad: [50, 57, 60, 64, 65], bass: 38, arp: [62, 65, 69, 72, 74, 76] }, // Rem9
  { pad: [46, 57, 62, 65, 69], bass: 34, arp: [58, 62, 65, 69, 70, 74] }, // Sib maj7
  { pad: [53, 57, 60, 64, 67], bass: 41, arp: [60, 65, 69, 72, 76, 77] }, // Fa maj9
  { pad: [48, 55, 60, 62, 64], bass: 36, arp: [60, 64, 67, 72, 74, 76] }  // Do add9
];
const FINAL = { pad: [41, 53, 57, 60, 64, 67, 72], bass: 29 };
const LEAD = [ // frase de cuatro compases: [tiempo, nota, duración] en pulsos
  [[0, 69, 1.5], [1.5, 72, .5], [2, 74, 1], [3, 72, .5], [3.5, 69, .5]],
  [[0, 74, 1.5], [1.5, 77, .5], [2, 76, 1], [3, 74, 1]],
  [[0, 72, 1.5], [1.5, 69, .5], [2, 72, 1], [3, 74, .5], [3.5, 76, .5]],
  [[0, 76, 2], [2, 74, 1], [3, 72, 1]]
];
const ARP_PAT = [0, 2, 4, 1, 3, 5, 2, 4, 0, 3, 5, 2, 4, 1, 3, 5];
const HAT16 = [1, .35, .65, .35, 1, .35, .65, .45, 1, .35, .65, .35, 1, .4, .7, .5];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- partitura ---------- */
function barFeatures(tl, b) {
  const sec = tl.sections.find(s => b >= s.bar0 && b < s.bar0 + s.bars);
  const lb = b - sec.bar0, last = lb === sec.bars - 1, V = tl.kind === 'vertical';
  const f = { pad: 0, bass: 0, bassMode: 'groove', kick: null, snare: 0, hats: 0, arp: 0, bright: .7, lead: 0, call: 0, riser: 0, impact: 0, final: false };
  const T = sec.type;
  if (T === 'cold') { f.pad = .55; f.call = 1; f.bright = .3; if (last) f.riser = 1; }
  else if (T === 'title') {
    if (lb === 0) f.impact = 1;
    f.pad = .9; f.bass = .9; f.bassMode = lb === 0 ? 'long' : 'groove';
    f.kick = lb === 0 ? 'half' : (V || lb === 2 ? 'groove' : 'half');
    f.hats = (V ? lb >= 1 : lb === 2) ? 8 : 0; f.snare = (V ? lb >= 1 : lb === 2) ? .8 : 0;
    f.arp = lb >= 1 ? .5 : 0; f.bright = .55;
  } else if (T === 'ep') {
    const i = sec.i, n = tl.sections.filter(s => s.type === 'ep').length;
    const payoff = V ? Math.floor(n / 2) : tl.payoff;
    const breath = V ? [] : tl.breath;
    if (breath.includes(i)) {
      f.pad = .5; f.arp = .38; f.bright = .22; f.call = .8; f.kick = 'heart'; f.bass = .4; f.bassMode = 'long';
      if (i === breath[breath.length - 1] && last) f.riser = 1;
    } else if (i >= payoff) {
      f.kick = 'four'; f.snare = 1; f.hats = 16; f.bass = 1; f.bassMode = 'pump'; f.arp = 1; f.lead = 1; f.pad = .8; f.bright = 1;
      if (i === payoff && lb === 0) f.impact = 1;
    } else {
      f.kick = 'groove'; f.snare = .9; f.hats = i === 0 ? 8 : 16; f.bass = .9; f.arp = i === 0 ? .45 : .75; f.pad = .6; f.bright = .6 + i * .05;
    }
  } else if (T === 'montage') {
    f.kick = 'four'; f.snare = 1; f.hats = 16; f.bass = 1; f.bassMode = 'pump'; f.arp = 1; f.lead = 1; f.pad = .8; f.bright = 1;
  } else if (T === 'close') {
    const p3 = V ? 1 : 3;
    if (lb < (V ? 1 : 2)) { f.pad = .9; f.bass = .8; f.kick = 'half'; f.hats = 8; f.call = 1; f.arp = .5; f.bright = .6; }
    else if (lb < p3) { f.pad = 1; f.arp = .4; f.call = 1; f.bright = .4; if (lb === p3 - 1) f.riser = 1; }
    if (lb === p3) { f.impact = 1; f.final = true; }
    if (V && lb === 0) f.riser = 1;
  }
  return { f, sec, lb };
}

function buildScore(tl) {
  const ev = [];
  const push = (t, k, o) => ev.push(Object.assign({ t, k }, o));
  let leadBar = 0;
  for (let b = 0; b < tl.bars; b++) {
    const { f, sec } = barFeatures(tl, b);
    const t0 = b * BAR, ch = CHORDS[b % 4];
    if (f.impact) push(t0, 'impact', { v: 1 });
    if (f.final) {
      push(t0, 'pad', { notes: FINAL.pad, dur: BAR * 2.2, v: 1, bright: .65 });
      push(t0, 'bass', { m: FINAL.bass + 12, dur: BAR * 1.6, v: .9 });
      push(t0, 'piano', { m: 69, v: .8 }); push(t0 + BEAT * .5, 'piano', { m: 72, v: .7 }); push(t0 + BEAT, 'piano', { m: 77, v: .8 });
      push(t0 + BEAT * 2, 'bell', { m: 84, v: .6 }); push(t0 + BEAT * 3, 'bell', { m: 81, v: .5 });
      continue;
    }
    if (f.pad) push(t0, 'pad', { notes: ch.pad, dur: BAR * 1.02, v: f.pad, bright: f.bright });
    if (f.bass) {
      const r = ch.bass;
      if (f.bassMode === 'long') push(t0, 'bass', { m: r, dur: BAR * .95, v: f.bass * .85 });
      else if (f.bassMode === 'pump') { push(t0, 'bass', { m: r, dur: BEAT * .45, v: f.bass }); [.5, 1.5, 2.5, 3.5].forEach(x => push(t0 + x * BEAT, 'bass', { m: r + (x === 3.5 ? 12 : 0), dur: BEAT * .42, v: f.bass * .9 })); }
      else [[0, .45, 0], [1.5, .4, 0], [2.5, .4, 0], [3, .2, 12], [3.5, .4, 7]].forEach(([x, d, o]) => push(t0 + x * BEAT, 'bass', { m: r + o, dur: d * BEAT, v: f.bass }));
    }
    if (f.kick) {
      const pat = { groove: [0, 1.5, 2.5], four: [0, 1, 2, 3], half: [0, 2], heart: [0, .38] }[f.kick];
      pat.forEach((x, i) => push(t0 + x * BEAT, 'kick', { v: f.kick === 'heart' ? (i ? .3 : .5) : 1 }));
    }
    if (f.snare) [1, 3].forEach(x => push(t0 + x * BEAT, 'snare', { v: f.snare }));
    if (f.hats === 8) for (let i = 0; i < 8; i++) push(t0 + i * BEAT / 2, 'hat', { v: i % 2 ? 1 : .55, open: i === 7 });
    if (f.hats === 16) for (let i = 0; i < 16; i++) push(t0 + i * BEAT / 4, 'hat', { v: HAT16[i], open: i === 14 });
    if (f.arp) for (let i = 0; i < 16; i++) push(t0 + i * BEAT / 4, 'arp', { m: ch.arp[ARP_PAT[i]], v: f.arp * (i % 4 === 0 ? 1 : .72), bright: f.bright });
    if (f.lead) { LEAD[leadBar % 4].forEach(([x, m, d]) => push(t0 + x * BEAT, 'lead', { m, dur: d * BEAT, v: 1 })); leadBar++; }
    if (f.call) {
      [[0, 69], [.5, 72], [1, 74]].forEach(([x, m]) => push(t0 + x * BEAT, 'piano', { m, v: .75 * f.call }));
      [[2, 81], [2.5, 79], [3, 77]].forEach(([x, m]) => push(t0 + x * BEAT, 'bell', { m, v: .55 * f.call }));
    }
    if (f.riser) push(t0, 'riser', { dur: BAR, v: 1 });
  }
  // un barrido de aire en cada cambio de escena, sincronizado con la transición
  tl.sections.forEach((s, i) => {
    if (!i) return;
    const { f } = barFeatures(tl, s.bar0);
    if (f.impact) return;
    push(s.t0 - tl.TR * 1.2, 'whoosh', { dur: tl.TR * 1.2, v: 1 });
  });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}
M.buildScore = buildScore;

/* ambiente suave para el modo presentador: cuatro compases que se repiten */
function ambientLoop() {
  const ev = [];
  for (let b = 0; b < 4; b++) {
    const ch = CHORDS[b], t0 = b * BAR;
    ev.push({ t: t0, k: 'pad', notes: ch.pad, dur: BAR * 1.05, v: .55, bright: .25 });
    if (b % 2 === 1) ev.push({ t: t0 + BEAT * 2, k: 'bell', m: ch.arp[5] + 12, v: .25 });
    for (let i = 0; i < 4; i++) ev.push({ t: t0 + i * BEAT, k: 'arp', m: ch.arp[[0, 2, 4, 3][i]], v: .3, bright: .2 });
  }
  return ev;
}
M.ambientLoop = ambientLoop;

/* ---------- sonido ---------- */
function seeded(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function createGraph(ctx) {
  const sr = ctx.sampleRate;
  const rnd = seeded(20260804);
  const noise = ctx.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
  const irLen = Math.floor(sr * 2.8), ir = ctx.createBuffer(2, irLen, sr);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < irLen; i++) { lp = lp * .6 + (rnd() * 2 - 1) * .4; d[i] = lp * Math.pow(1 - i / irLen, 3.2); } }
  const out = ctx.createGain(); out.gain.value = .92;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = .004; comp.release.value = .18;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .08;
  comp.connect(lim); lim.connect(out); out.connect(ctx.destination);
  const dry = ctx.createGain(); dry.connect(comp);
  const duck = ctx.createGain(); duck.connect(dry);
  const verb = ctx.createConvolver(); verb.buffer = ir; verb.normalize = true;
  const verbIn = ctx.createGain(), verbOut = ctx.createGain(); verbOut.gain.value = .5;
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(comp);
  const dl = ctx.createDelay(2); dl.delayTime.value = BEAT * .75;
  const fb = ctx.createGain(); fb.gain.value = .32;
  const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 3200;
  const dlIn = ctx.createGain(), dlOut = ctx.createGain(); dlOut.gain.value = .45;
  dlIn.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(dlOut); dlOut.connect(comp); dlOut.connect(verbIn);
  return { ctx, noise, out, dry, duck, verbIn, dlIn };
}
M.createGraph = createGraph;

function env(g, t, a, peak, d, end) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function send(node, B, dry, verb, dly) {
  const out = [node];
  if (dry) { const g = B.ctx.createGain(); g.gain.value = dry; node.connect(g); g.connect(B.dry); out.push(g); }
  if (verb) { const g = B.ctx.createGain(); g.gain.value = verb; node.connect(g); g.connect(B.verbIn); out.push(g); }
  if (dly) { const g = B.ctx.createGain(); g.gain.value = dly; node.connect(g); g.connect(B.dlIn); out.push(g); }
  return out;
}
// al terminar la nota se desconecta su cadena: el grafo no crece con cada nota
function fin(src, nodes) { src.onended = () => { nodes.forEach(n => { try { n.disconnect(); } catch (e) { } }); }; }
function noiseSrc(B, t, dur) { const s = B.ctx.createBufferSource(); s.buffer = B.noise; s.loop = true; s.start(t, (t * 7.13) % 1.5); s.stop(t + dur + .05); return s; }

const INST = {
  kick(B, e, t) {
    const c = B.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(46, t + .13);
    env(g, t, .002, .95 * e.v, .42); o.connect(g); fin(o, send(g, B, 1, .04, 0)); o.start(t); o.stop(t + .5);
    const n = noiseSrc(B, t, .03), hp = c.createBiquadFilter(), ng = c.createGain(); hp.type = 'highpass'; hp.frequency.value = 2500;
    env(ng, t, .001, .18 * e.v, .02); n.connect(hp); hp.connect(ng); fin(n, send(ng, B, 1, 0, 0));
    B.duck.gain.cancelScheduledValues(t); B.duck.gain.setValueAtTime(.42, t); B.duck.gain.linearRampToValueAtTime(1, t + .24);
  },
  snare(B, e, t) {
    const c = B.ctx, n = noiseSrc(B, t, .35), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = .8;
    g.gain.setValueAtTime(.0001, t);
    [0, .011, .023].forEach((d, i) => { g.gain.linearRampToValueAtTime(.42 * e.v, t + d + .001); g.gain.exponentialRampToValueAtTime(.06 * e.v, t + d + .009); });
    g.gain.linearRampToValueAtTime(.3 * e.v, t + .026); g.gain.exponentialRampToValueAtTime(.0001, t + .26);
    n.connect(bp); bp.connect(g); fin(n, send(g, B, 1, .28, 0));
    const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + .08);
    env(og, t, .001, .16 * e.v, .09); o.connect(og); fin(o, send(og, B, 1, .1, 0)); o.start(t); o.stop(t + .15);
  },
  hat(B, e, t) {
    const c = B.ctx, d = e.open ? .24 : .045, n = noiseSrc(B, t, d + .05), hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7800; env(g, t, .001, .075 * e.v, d); n.connect(hp); hp.connect(g); fin(n, send(g, B, 1, .06, 0));
  },
  bass(B, e, t) {
    const c = B.ctx, f = mtof(e.m), o = c.createOscillator(), s = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; s.type = 'sine'; s.frequency.value = f;
    lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(240, t + .22);
    const sg = c.createGain(); sg.gain.value = .9; s.connect(sg); sg.connect(g);
    o.connect(lp); lp.connect(g);
    const v = .3 * e.v; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.setValueAtTime(v * .85, t + Math.max(.02, e.dur - .06)); g.gain.exponentialRampToValueAtTime(.0001, t + e.dur + .05);
    g.connect(B.duck); fin(o, [g]); o.start(t); s.start(t); o.stop(t + e.dur + .1); s.stop(t + e.dur + .1);
  },
  pad(B, e, t) {
    const c = B.ctx, lp = c.createBiquadFilter(), g = c.createGain();
    const base = 500 + 1500 * e.bright;
    lp.type = 'lowpass'; lp.Q.value = .5; lp.frequency.setValueAtTime(base * .7, t); lp.frequency.linearRampToValueAtTime(base * 1.25, t + e.dur * .55); lp.frequency.linearRampToValueAtTime(base * .9, t + e.dur);
    const v = .055 * e.v; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .35); g.gain.setValueAtTime(v, t + e.dur - .2); g.gain.exponentialRampToValueAtTime(.0001, t + e.dur + .9);
    let last = null;
    e.notes.forEach((m, i) => [-9, 8].forEach(dt => {
      const o = c.createOscillator(); o.type = i === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + e.dur + 1); last = o;
    }));
    lp.connect(g); g.connect(B.duck); fin(last, send(g, B, 0, .55, 0));
  },
  arp(B, e, t) {
    const c = B.ctx, f = mtof(e.m), o = c.createOscillator(), q = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f; q.type = 'square'; q.frequency.value = f * 2; q.detune.value = 5;
    const qg = c.createGain(); qg.gain.value = .18; q.connect(qg); qg.connect(lp); o.connect(lp);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900 + 3600 * e.bright, t); lp.frequency.exponentialRampToValueAtTime(420, t + .2);
    env(g, t, .003, .075 * e.v, .3); lp.connect(g); fin(o, send(g, B, .8, .22, .34));
    o.start(t); q.start(t); o.stop(t + .4); q.stop(t + .4);
  },
  lead(B, e, t) {
    const c = B.ctx, f = mtof(e.m), lp = c.createBiquadFilter(), g = c.createGain();
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.3; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + .35); lfo.connect(lg);
    [-7, 7, 1200].forEach(dt => { const o = c.createOscillator(); o.type = dt === 1200 ? 'sine' : 'sawtooth'; o.frequency.value = f; o.detune.value = dt; lg.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + e.dur + .5); });
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = .7;
    const v = .05; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .03); g.gain.setValueAtTime(v * .8, t + Math.max(.05, e.dur - .05)); g.gain.exponentialRampToValueAtTime(.0001, t + e.dur + .3);
    lp.connect(g); fin(lfo, send(g, B, .9, .35, .3)); lfo.start(t); lfo.stop(t + e.dur + .5);
  },
  piano(B, e, t) {
    const c = B.ctx, f = mtof(e.m), g = c.createGain(); g.gain.value = .11 * e.v;
    let first = null;
    [[1, 1, 1.8], [2, .42, 1.1], [3, .18, .7], [4.2, .07, .4]].forEach(([h, a, d]) => {
      const o = c.createOscillator(), og = c.createGain(); o.frequency.value = f * h; env(og, t, .004, a, d); o.connect(og); og.connect(g); o.start(t); o.stop(t + d + .1);
      if (!first) first = o;
    });
    fin(first, send(g, B, 1, .4, .12));
  },
  bell(B, e, t) {
    const c = B.ctx, f = mtof(e.m), car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.1);
    mod.connect(mg); mg.connect(car.frequency);
    env(g, t, .003, .06 * e.v, 1.9); car.connect(g); fin(car, send(g, B, .7, .5, .4));
    car.start(t); mod.start(t); car.stop(t + 2.1); mod.stop(t + 2.1);
  },
  riser(B, e, t) {
    const c = B.ctx, n = noiseSrc(B, t, e.dur), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7000, t + e.dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16 * e.v, t + e.dur - .02); g.gain.linearRampToValueAtTime(.0001, t + e.dur + .03);
    n.connect(bp); bp.connect(g); fin(n, send(g, B, 1, .35, 0));
  },
  whoosh(B, e, t) {
    const c = B.ctx, n = noiseSrc(B, t, e.dur + .3), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(3800, t + e.dur); bp.frequency.exponentialRampToValueAtTime(900, t + e.dur + .25);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09 * e.v, t + e.dur); g.gain.exponentialRampToValueAtTime(.0001, t + e.dur + .28);
    n.connect(bp); bp.connect(g); fin(n, send(g, B, 1, .3, 0));
  },
  impact(B, e, t) {
    const c = B.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(31, t + .7);
    env(g, t, .003, .85 * e.v, 1.5); o.connect(g); fin(o, send(g, B, 1, .15, 0)); o.start(t); o.stop(t + 1.7);
    const n = noiseSrc(B, t, 1.6), hp = c.createBiquadFilter(), ng = c.createGain(); hp.type = 'highpass'; hp.frequency.value = 2200;
    env(ng, t, .002, .16 * e.v, 1.4); n.connect(hp); hp.connect(ng); fin(n, send(ng, B, 1, .6, 0));
    B.duck.gain.cancelScheduledValues(t); B.duck.gain.setValueAtTime(.3, t); B.duck.gain.linearRampToValueAtTime(1, t + .6);
  }
};
M.play = (B, e, t) => { try { INST[e.k](B, e, t); } catch (err) { } };

/* ---------- exportación sin conexión (para el MP4) ---------- */
M.renderOffline = async function (tl, sr = 48000) {
  const len = Math.ceil((tl.dur + .05) * sr);
  const ctx = new OfflineAudioContext(2, len, sr);
  const B = createGraph(ctx);
  buildScore(tl).forEach(e => M.play(B, e, Math.max(0, e.t)));
  return ctx.startRendering();
};
M.toWav = function (buf) {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
  ws(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true); o += 2; }
  return ab;
};

/* ---------- reproducción en vivo ---------- */
class Player {
  constructor() { this.ctx = null; this.B = null; this.timer = null; }
  ensure() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; this.ctx = new AC({ latencyHint: 'playback' }); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  start(events, tStart, loopLen) {
    this.stop(); if (!this.ensure()) return;
    this.B = createGraph(this.ctx); this.ev = events; this.loopLen = loopLen || 0;
    this.c0 = this.ctx.currentTime + .06; this.t0 = tStart; this.cursor = 0; this.cycle = 0;
    if (!this.loopLen) {
      while (this.cursor < events.length && events[this.cursor].t < tStart - .01) {
        const e = events[this.cursor];
        if (e.k === 'pad' && e.t + e.dur > tStart + .3) M.play(this.B, Object.assign({}, e, { dur: e.t + e.dur - tStart }), this.c0);
        this.cursor++;
      }
    }
    const B = this.B;
    this.timer = setInterval(() => this.pump(B), 30); this.pump(B);
  }
  now() { return this.ctx ? this.t0 + (this.ctx.currentTime - this.c0) : 0; }
  pump(B) {
    if (B !== this.B) return;
    const horizon = this.now() + .3;
    if (this.loopLen) {
      for (let guard = 0; guard < 400; guard++) {
        const e = this.ev[this.cursor], et = e.t + this.cycle * this.loopLen;
        if (et >= horizon) break;
        if (et >= this.t0 - .01) M.play(B, e, this.c0 + (et - this.t0));
        this.cursor++; if (this.cursor >= this.ev.length) { this.cursor = 0; this.cycle++; }
      }
      return;
    }
    while (this.cursor < this.ev.length && this.ev[this.cursor].t < horizon) {
      const e = this.ev[this.cursor++]; const when = this.c0 + (e.t - this.t0);
      if (when >= this.ctx.currentTime - .02) M.play(B, e, Math.max(when, this.ctx.currentTime));
    }
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.B) { const B = this.B; const now = this.ctx.currentTime; B.out.gain.cancelScheduledValues(now); B.out.gain.setTargetAtTime(0, now, .04); setTimeout(() => { try { B.out.disconnect(); } catch (e) { } }, 400); }
    this.B = null;
  }
  get running() { return !!this.B; }
}
M.Player = Player;
})();
