/* Interfaz: reproducción automática, modo presentador, índice, progreso, teclado. */
(function () {
'use strict';
const CH = window.CH, D = window.CH_DATA;
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture');

const canvas = $('#ch-canvas'), ctx = canvas.getContext('2d', { alpha: false });
const stage = $('#ch-stage');
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TL = { full: CH.buildTimeline('full'), vertical: CH.buildTimeline('vertical') };
const SCORE = { full: CH.Music.buildScore(TL.full), vertical: CH.Music.buildScore(TL.vertical) };
const AMBIENT = CH.Music.ambientLoop();

const st = {
  timeline: location.hash === '#vertical' ? 'vertical' : 'full',
  mode: 'auto', playing: false, t: 0, sound: true,
  clock0: 0, t0: 0, pres: null, started: false
};
const player = new CH.Music.Player();

/* ---------- tamaño del lienzo ---------- */
let W = 0, H = 0, DPR = 1;
function resize() {
  if (CAPTURE) {
    W = CAPTURE === 'vertical' ? 1080 : 1920; H = CAPTURE === 'vertical' ? 1920 : 1080; DPR = 1;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  } else {
    const r = stage.getBoundingClientRect();
    let cw = r.width, chh = r.height;
    if (st.timeline === 'vertical') { const k = Math.min(cw / 9, chh / 16); cw = k * 9; chh = k * 16; }
    W = Math.round(cw); H = Math.round(chh);
    DPR = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4200000 / Math.max(1, W * H)));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  draw();
}

/* ---------- reloj ---------- */
const tl = () => TL[st.timeline];
function nowT() {
  if (!st.playing) return st.t;
  if (player.running && st.sound && st.mode === 'auto') return player.now();
  return st.t0 + (performance.now() - st.clock0) / 1000;
}
function play(from) {
  if (from != null) st.t = from;
  st.playing = true; st.t0 = st.t; st.clock0 = performance.now();
  if (st.sound && st.mode === 'auto') player.start(SCORE[st.timeline], st.t);
  syncUI();
}
function pause() { st.t = nowT(); st.playing = false; if (st.mode === 'auto') player.stop(); syncUI(); }
function seek(t) { const was = st.playing; st.t = Math.max(0, Math.min(t, tl().dur - .01)); if (was) play(st.t); else { draw(); syncUI(); } }

/* ---------- presentador ---------- */
function curSectionIdx() { return CH.sectionAt(tl(), st.mode === 'auto' ? nowT() : 0).idx; }
function enterPresenter(idx, dir = 1) {
  const S = tl().sections; idx = Math.max(0, Math.min(S.length - 1, idx));
  let from = null;
  if (st.mode === 'presenter' && st.pres) from = { idx: st.pres.idx, tl: presTl() };
  else if (st.mode === 'auto') { const t = nowT(), sec = CH.sectionAt(tl(), t); from = { idx: sec.idx, tl: t - sec.t0 }; }
  if (st.mode === 'auto') { player.stop(); }
  const wasPres = st.mode === 'presenter';
  st.mode = 'presenter'; st.playing = true;
  st.pres = { idx, enter: performance.now(), from, dir };
  if (st.sound && !wasPres) player.start(AMBIENT, 0, CH.BAR * 4);
  showHint();
  syncUI();
}
function presToggle() {
  if (st.playing) { st.playing = false; st.pres.pausedAt = performance.now(); }
  else { if (st.pres.pausedAt) st.pres.enter += performance.now() - st.pres.pausedAt; st.pres.pausedAt = 0; st.playing = true; }
  syncUI();
}
function presTl() { return st.pres ? (performance.now() - st.pres.enter) / 1000 - .7 : 0; }
function backToTimeline() {
  if (st.mode !== 'presenter') return;
  const sec = tl().sections[st.pres.idx];
  st.mode = 'auto'; st.pres = null; player.stop();
  play(sec.t0); syncUI();
}
function next(d) {
  const S = tl().sections;
  if (st.mode !== 'presenter') { const t = nowT(); const sec = CH.sectionAt(tl(), t); enterPresenter(sec.idx + (d > 0 ? 1 : (t - sec.t0 > 1.2 ? 0 : -1)), d); return; }
  const n = st.pres.idx + d; if (n < 0 || n >= S.length) return;
  enterPresenter(n, d);
}

/* ---------- dibujo ---------- */
let lastT = -1;
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (st.mode === 'presenter' && st.pres) {
    CH.renderPresenter(ctx, W, H, tl(), st.pres, performance.now());
  } else {
    CH.render(ctx, W, H, tl(), nowT());
  }
}
function loop() {
  if (st.playing && st.mode === 'auto') {
    let t = nowT();
    if (t >= tl().dur) { play(0); t = 0; } // bucle
    st.t = t;
  }
  if (st.playing) draw();
  updateProgress();
  requestAnimationFrame(loop);
}

/* ---------- interfaz ---------- */
const ui = {
  bar: $('#ch-bar'), btnPlay: $('#ch-play'), time: $('#ch-time'), track: $('#ch-track'), fill: $('#ch-fill'),
  marks: $('#ch-marks'), btnPres: $('#ch-pres'), btnFmt: $('#ch-fmt'), btnSnd: $('#ch-snd'), btnFs: $('#ch-fs'),
  btnIdx: $('#ch-idx'), drawer: $('#ch-drawer'), list: $('#ch-list'), cover: $('#ch-cover'), hint: $('#ch-hint'), tip: $('#ch-tip')
};
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
function secName(s) {
  if (s.type === 'ep') return s.ep.id.slice(-3);
  return { cold: 'Apertura', title: 'Título', montage: 'Invitados', close: 'Cierre' }[s.type];
}
function buildMarks() {
  ui.marks.innerHTML = '';
  const T = tl();
  T.sections.forEach(s => {
    const m = document.createElement('button');
    m.className = 'ch-mark' + (s.type === 'ep' ? ' is-ep' : '');
    m.style.left = (s.t0 / T.dur * 100) + '%';
    m.setAttribute('aria-label', 'Ir a ' + (s.type === 'ep' ? s.ep.id + ': ' + s.ep.titulo.replace(/\*/g, '') : secName(s)));
    m.dataset.label = secName(s);
    m.addEventListener('click', ev => { ev.stopPropagation(); jumpTo(s.idx); });
    m.addEventListener('mouseenter', () => { ui.tip.textContent = s.type === 'ep' ? `${s.ep.id.slice(-3)} · ${s.ep.titulo.replace(/\*/g, '')}` : secName(s); ui.tip.style.left = m.style.left; ui.tip.hidden = false; });
    m.addEventListener('mouseleave', () => { ui.tip.hidden = true; });
    ui.marks.appendChild(m);
  });
  ui.list.innerHTML = '';
  T.sections.forEach(s => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'ch-item';
    const tag = s.type === 'ep' ? s.ep.id.slice(-3) : '·';
    const title = s.type === 'ep' ? s.ep.titulo.replace(/\*/g, '') : { cold: 'Apertura en frío', title: 'Código Humano · ' + D.programa.temporada, montage: 'Las voces de la temporada', close: 'Cierre' }[s.type];
    const sub = s.type === 'ep' ? CH.fechaCorta(s.ep.fecha) + (s.ep.invitados.length ? ' · ' + s.ep.invitados.map(g => g.nombre).join(', ') : '') : fmt(s.t0);
    b.innerHTML = `<span class="ch-item-tag">${tag}</span><span class="ch-item-txt"><span class="ch-item-title"></span><span class="ch-item-sub"></span></span>`;
    b.querySelector('.ch-item-title').textContent = title; b.querySelector('.ch-item-sub').textContent = sub;
    b.dataset.idx = s.idx;
    b.addEventListener('click', () => { jumpTo(s.idx); toggleDrawer(false); });
    li.appendChild(b); ui.list.appendChild(li);
  });
}
function jumpTo(idx) {
  if (!st.started) start(false);
  if (st.mode === 'presenter') enterPresenter(idx, idx >= st.pres.idx ? 1 : -1);
  else { const s = tl().sections[idx]; play(s.t0); }
}
function updateProgress() {
  const T = tl();
  let t, idx;
  if (st.mode === 'presenter' && st.pres) { const s = T.sections[st.pres.idx]; t = s.t0; idx = s.idx; }
  else { t = nowT(); idx = CH.sectionAt(T, t).idx; }
  ui.fill.style.width = (t / T.dur * 100) + '%';
  ui.time.textContent = st.mode === 'presenter' ? `${secName(T.sections[idx])} · ${idx + 1}/${T.sections.length}` : `${fmt(t)} / ${fmt(T.dur)}`;
  if (idx !== updateProgress.last) {
    updateProgress.last = idx;
    ui.list.querySelectorAll('.ch-item').forEach(b => b.classList.toggle('is-on', +b.dataset.idx === idx));
    ui.marks.querySelectorAll('.ch-mark').forEach((m, i) => m.classList.toggle('is-on', i === idx));
  }
}
function syncUI() {
  ui.btnPlay.setAttribute('aria-label', st.playing ? 'Pausar' : 'Reproducir');
  ui.btnPlay.classList.toggle('is-playing', st.playing);
  ui.btnPres.setAttribute('aria-pressed', st.mode === 'presenter');
  ui.btnPres.textContent = st.mode === 'presenter' ? 'Volver a la línea de tiempo' : 'Modo presentador';
  ui.btnFmt.textContent = st.timeline === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9';
  ui.btnSnd.setAttribute('aria-pressed', st.sound); ui.btnSnd.textContent = st.sound ? 'Sonido' : 'Silencio';
  document.body.classList.toggle('is-presenter', st.mode === 'presenter');
}
function setTimeline(k) {
  if (k === st.timeline) return;
  const wasPlaying = st.playing && st.mode === 'auto';
  player.stop(); st.mode = 'auto'; st.pres = null;
  st.timeline = k; st.t = 0; updateProgress.last = -1;
  buildMarks(); resize();
  if (wasPlaying) play(0); else { st.playing = false; draw(); }
  syncUI();
}
function toggleSound() {
  st.sound = !st.sound;
  if (!st.sound) player.stop();
  else if (st.playing) { if (st.mode === 'auto') player.start(SCORE[st.timeline], nowT()); else player.start(AMBIENT, 0, CH.BAR * 4); }
  if (st.mode === 'auto' && st.playing) { st.t = nowT(); st.t0 = st.t; st.clock0 = performance.now(); }
  syncUI();
}
function toggleFs() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => { });
    else document.exitFullscreen().catch(() => { });
  } catch (e) { }
}
function toggleDrawer(force) {
  const open = force == null ? ui.drawer.hidden : force;
  ui.drawer.hidden = !open; ui.btnIdx.setAttribute('aria-expanded', open);
}
let hintTimer = null;
function showHint() { ui.hint.hidden = false; ui.hint.classList.add('is-on'); clearTimeout(hintTimer); hintTimer = setTimeout(() => ui.hint.classList.remove('is-on'), 3800); }
function start(presenter) {
  st.started = true; ui.cover.hidden = true; document.body.classList.remove('is-cover');
  player.ensure();
  if (presenter) enterPresenter(0); else play(0);
}

/* barra que se oculta sola mientras reproduce */
let idle = null;
function wake() {
  document.body.classList.remove('is-idle'); clearTimeout(idle);
  idle = setTimeout(() => { if (st.playing && ui.drawer.hidden) document.body.classList.add('is-idle'); }, 2600);
}

/* ---------- eventos ---------- */
function bind() {
  $('#ch-start').addEventListener('click', () => start(false));
  $('#ch-start-pres').addEventListener('click', () => start(true));
  $('#ch-start-vert').addEventListener('click', () => { setTimeline('vertical'); start(false); });
  ui.btnPlay.addEventListener('click', () => { if (!st.started) return start(false); st.mode === 'presenter' ? presToggle() : (st.playing ? pause() : play()); });
  ui.btnPres.addEventListener('click', () => { if (!st.started) return start(true); st.mode === 'presenter' ? backToTimeline() : enterPresenter(curSectionIdx()); });
  ui.btnFmt.addEventListener('click', () => setTimeline(st.timeline === 'full' ? 'vertical' : 'full'));
  ui.btnSnd.addEventListener('click', toggleSound);
  ui.btnFs.addEventListener('click', toggleFs);
  ui.btnIdx.addEventListener('click', () => toggleDrawer());
  $('#ch-close-drawer').addEventListener('click', () => toggleDrawer(false));
  ui.track.addEventListener('click', e => {
    if (!st.started) start(false);
    const r = ui.track.getBoundingClientRect(), u = (e.clientX - r.left) / r.width;
    if (st.mode === 'presenter') { const s = CH.sectionAt(tl(), u * tl().dur); enterPresenter(s.idx); }
    else seek(u * tl().dur);
  });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); if (!st.started) return start(false); if (st.mode === 'presenter') presToggle(); else st.playing ? pause() : play(); }
    else if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); if (!st.started) return start(true); next(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); if (!st.started) return start(true); next(-1); }
    else if (k === 't' || k === 'T') backToTimeline();
    else if (k === 'p' || k === 'P') { if (!st.started) return start(true); st.mode === 'presenter' ? backToTimeline() : enterPresenter(curSectionIdx()); }
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'm' || k === 'M') toggleSound();
    else if (k === 'i' || k === 'I') toggleDrawer();
    else if (k === 'v' || k === 'V') setTimeline(st.timeline === 'full' ? 'vertical' : 'full');
    else if (k === 'Escape') toggleDrawer(false);
    else if (k === 'Home') { if (st.mode === 'presenter') enterPresenter(0, -1); else seek(0); }
    else if (/^[0-9]$/.test(k)) { const n = k === '0' ? 10 : +k; const s = tl().sections.find(x => x.type === 'ep' && x.i === n - 1); if (s) jumpTo(s.idx); }
    wake();
  });
  // toque en el lienzo: en presentador, izquierda/derecha navegan
  canvas.addEventListener('click', e => {
    if (!st.started) return;
    const r = canvas.getBoundingClientRect(), u = (e.clientX - r.left) / r.width;
    if (st.mode === 'presenter') { if (u > .62) next(1); else if (u < .38) next(-1); else wake(); }
    else { st.playing ? pause() : play(); }
  });
  let sx = null;
  canvas.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  canvas.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { if (!st.started) start(true); next(dx < 0 ? 1 : -1); } }, { passive: true });
  ['mousemove', 'touchstart'].forEach(ev => window.addEventListener(ev, wake, { passive: true }));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.playing && st.mode === 'auto') pause(); });
}

/* ---------- exportación cuadro a cuadro (Playwright) ---------- */
function exposeCapture() {
  CH.capture = {
    duration: tl().dur, fps: 30,
    frame(i) { ctx.setTransform(1, 0, 0, 1, 0, 0); CH.render(ctx, W, H, tl(), i / 30, i); return true; },
    async audioWav() {
      const buf = await CH.Music.renderOffline(tl());
      const ab = CH.Music.toWav(buf); const u8 = new Uint8Array(ab); let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    sections: tl().sections.map(s => ({ type: s.type, t0: s.t0, dur: s.dur, id: s.ep ? s.ep.id : null }))
  };
}

/* ---------- arranque ---------- */
async function boot() {
  await CH.fontsReady;
  await CH.setLogo(window.CH_LOGO);
  if (CAPTURE) {
    document.body.classList.add('is-capture');
    st.timeline = CAPTURE === 'vertical' ? 'vertical' : 'full';
    resize(); exposeCapture(); CH.captureReady = true; return;
  }
  document.body.classList.add('is-cover');
  buildMarks(); bind(); syncUI(); resize();
  // portada: un cuadro del título, completo y en reposo
  const T = tl(), ts = T.sections.find(s => s.type === 'title');
  st.t = ts.t0 + ts.dur * .72; draw(); st.t = 0;
  requestAnimationFrame(loop);
}
CH.fontsReady = (async () => {
  const faces = [['400 40px "DM Serif Display"'], ['italic 400 40px "DM Serif Display"'], ['500 40px "Space Grotesk"'], ['400 40px "Space Grotesk"'], ['500 40px "JetBrains Mono"']];
  try { await Promise.all(faces.map(f => document.fonts.load(f[0], 'ÁÉÍÓÚáéíóúñÑ¿¡«»'))); await document.fonts.ready; } catch (e) { }
})();
boot();
})();
