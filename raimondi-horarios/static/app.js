/* Raimondi Horarios — single-page front-end (no build step). */
(() => {
  const S = {
    lang: localStorage.getItem("lang") || "es",
    view: localStorage.getItem("view") || "dashboard",
    data: null, validation: null, occ: {}, version: null, llm: false, ctypes: {},
    ttMode: "section", ttId: null, preview: null, proposal: null,
    dataTab: "teachers", ovMode: "teachers", filter: "",
    subsDate: new Date().toISOString().slice(0, 10),
    drag: null, slotMap: null, chat: [], pendingOp: null, busy: false,
  };
  const DAYS = () => S.data.days || ["MON", "TUE", "WED", "THU", "FRI"];
  const T = (k) => (I18N[S.lang] && I18N[S.lang][k]) || (I18N.es[k]) || k;
  const DN = (d) => DAYN[S.lang][d] || d;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const q = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const M = (msg) => (msg && (msg[S.lang] || msg.es)) || "";
  const byId = (kind) => Object.fromEntries((S.data[kind] || []).map((x) => [x.id, x]));

  async function api(path, opts = {}) {
    const o = { headers: { "Content-Type": "application/json" }, ...opts };
    if (o.body && typeof o.body !== "string") o.body = JSON.stringify(o.body);
    const r = await fetch(path, o);
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json() : await r.text();
    if (!r.ok && r.status !== 409) throw new Error((body && body.detail) || r.statusText);
    return { status: r.status, body };
  }
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast"; el.textContent = msg; document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  async function load() {
    const { body } = await api("/api/state");
    S.data = body.data; S.validation = body.validation; S.occ = body.occurrences;
    S.version = body.version; S.llm = body.llm; S.ctypes = body.constraint_types;
    if (!S.ttId || !findEntity(S.ttMode, S.ttId)) S.ttId = (S.data.sections[0] || {}).id;
    render();
  }
  function findEntity(mode, id) {
    const kind = { section: "sections", teacher: "teachers", room: "rooms" }[mode];
    return (S.data[kind] || []).find((x) => x.id === id);
  }

  // ---------------------------------------------------------------- naming helpers
  const subj = (id) => byId("subjects")[id] || { id, name_es: id, color: "#888" };
  const subjName = (id) => { const s = subj(id); return s["name_" + S.lang] || s.name_es || id; };
  const subjShort = (id) => subj(id).short || id;
  const teacherName = (id) => (byId("teachers")[id] || {}).name || id;
  const secName = (id) => (byId("sections")[id] || {}).name || id;
  const areaName = (id) => { const a = byId("areas")[id] || {}; return a["name_" + S.lang] || a.name_es || id; };
  const occSec = (o) => S.occ[o] && S.occ[o].section_id;

  // ---------------------------------------------------------------- shell
  const NAV = [["dashboard", "▦"], ["timetable", "▤"], ["overview", "▥"], ["data", "☰"], ["rules", "⚖"],
               ["subs", "⇄"], ["publish", "✉"], ["history", "↺"]];
  function render() {
    document.documentElement.lang = S.lang;
    document.getElementById("brand-sub").textContent = T("app_sub");
    document.getElementById("nav").innerHTML = NAV.map(([k, ico]) =>
      `<button class="${S.view === k ? "active" : ""}" onclick="App.go('${k}')"><span class="ico">${ico}</span>${T("nav_" + k)}</button>`).join("");
    const meta = S.data.meta || {};
    document.getElementById("foot").innerHTML =
      `${esc(meta.name || "")}<br>${meta.synthetic ? "⚠ " + T("synthetic") : ""}<br>${T("version")} ${S.version}`;
    document.getElementById("title").innerHTML = `${T("nav_" + S.view)}<small>${esc(meta.school || "")} · ${meta.academic_year || ""}</small>`;
    const sum = S.validation.summary;
    document.getElementById("status-chip").innerHTML = S.validation.valid
      ? `<span class="chip ok">✓ ${T("valid")} · ${sum.placed_occurrences}/${sum.occurrences}</span>`
      : `<span class="chip bad">✕ ${T("invalid")} · ${sum.hard_violations + sum.data_issues}</span>`;
    document.getElementById("btn-generate").textContent = S.busy ? T("generating") : "⚙ " + T("generate");
    document.getElementById("btn-generate").disabled = S.busy;
    document.getElementById("btn-assistant").textContent = "💬 " + T("assistant");
    document.querySelectorAll(".lang-switch button").forEach((b) => b.classList.toggle("active", b.dataset.lang === S.lang));
    renderAssistantShell();
    const c = document.getElementById("content");
    const views = { dashboard, timetable, overview, dataView, rules, subs, publish, history };
    const fn = views[S.view === "data" ? "dataView" : S.view] || dashboard;
    c.innerHTML = proposalBanner() + fn();
    if (S.view === "dashboard") loadReports();
    if (S.view === "subs") loadSubs();
    if (S.view === "publish") loadPublish();
    if (S.view === "history") loadHistory();
  }

  // ---------------------------------------------------------------- proposal banner (engine output)
  function proposalBanner() {
    const p = S.proposal;
    if (!p) return "";
    const st = p.status;
    const cls = st === "OPTIMAL" || st === "FEASIBLE" ? "ok" : st === "UNKNOWN" ? "warn" : "bad";
    let html = `<div class="banner ${cls}"><b>${T("proposal")}:</b> ${T("st_" + st)} · ${T("time")} ${p.wall_time}s`;
    if (p.placements) {
      const v = p.validation.summary, cur = p.current_validation || {};
      html += ` · ${T("moved")}: <b>${p.diff.length}</b> · ${T("kpi_hard")}: <b>${v.hard_violations}</b>`
        + ` · ${T("kpi_soft")}: ${cur.soft_violations ?? "—"} → <b>${v.soft_violations}</b>`
        + `<span style="flex:1"></span><button onclick="App.togglePreview()">${S.preview ? "✓ " : ""}${T("preview")}</button>`
        + `<button class="primary" onclick="App.acceptProposal()">${T("accept")}</button>`;
    }
    html += `<button class="ghost" onclick="App.discardProposal()">${T("discard")}</button></div>`;
    const fatal = (p.diagnostics && p.diagnostics.fatal) || [];
    if (fatal.length) html += `<div class="card" style="margin-bottom:14px"><h3>${T("diag")}</h3><ul class="list-issues">${fatal.map(issueLi).join("")}</ul></div>`;
    if (p.conflict_groups && p.conflict_groups.length)
      html += `<div class="card" style="margin-bottom:14px"><h3>${T("conflict_groups")}</h3>${p.conflict_groups.map((g) => `<span class="chip">${esc(g)}</span>`).join(" ")}</div>`;
    return html;
  }
  function issueLi(f) {
    const opts = (f.options || []).map((o) => o.kind === "relax_rule"
      ? `<span class="chip">↺ ${(o.rule_ids || []).map(esc).join(", ")}</span>`
      : `<span class="chip">+ ${T("teacher")} (${esc(subjName((byId("teachers")[o.teacher_id] || {}).subject_ids?.[0] || ""))})</span>`).join(" ");
    return `<li>${esc(M(f.message))} ${opts ? `<div class="small muted">${T("options")}: ${opts}</div>` : ""}</li>`;
  }

  // ---------------------------------------------------------------- dashboard
  function dashboard() {
    const v = S.validation, s = v.summary, d = S.data;
    const today = new Date().toISOString().slice(0, 10);
    const subsToday = (d.substitutions || []).filter((x) => x.date === today).length;
    const k = (val, label, sub = "", cls = "") => `<div class="card kpi"><div class="v ${cls}">${val}</div><div class="l">${label}</div>${sub ? `<div class="s muted">${sub}</div>` : ""}</div>`;
    const fl = (list) => list.length ? `<ul class="list-issues">${list.slice(0, 40).map((f) =>
      `<li>${f.occ_ids && f.occ_ids[0] ? `<a href="#" onclick="App.focusOcc(${q(f.occ_ids[0])});return false">${esc(M(f.message))}</a>` : esc(M(f.message))}</li>`).join("")}${list.length > 40 ? `<li class="muted">… +${list.length - 40}</li>` : ""}</ul>` : `<p class="muted">${T("none")}</p>`;
    const rulesSoft = Object.entries(s.soft_by_rule || {}).map(([r, x]) => `<span class="chip warn">${esc(r)}: ${x.count}</span>`).join(" ");
    return `
    <div class="banner info">${T("engine_help")}</div>
    <div class="grid-cards">
      ${k(d.sections.length, T("kpi_sections"))}
      ${k(d.teachers.length, T("kpi_teachers"))}
      ${k(s.teaching_periods, T("kpi_periods"), `${s.placed_periods} ${T("placed").toLowerCase()}`)}
      ${k(`${s.placed_occurrences}/${s.occurrences}`, T("kpi_placed"))}
      ${k(s.hard_violations + s.data_issues, T("kpi_hard"), "", s.hard_violations + s.data_issues ? "bad" : "")}
      ${k(s.soft_violations, T("kpi_soft"), rulesSoft)}
      ${k(subsToday, T("kpi_subs_today"))}
    </div>
    <div class="row">
      <div class="col card"><h3>${T("hard_list")}</h3>${fl([...v.data, ...v.hard])}</div>
      <div class="col card"><h3>${T("soft_list")}</h3>${fl(v.soft)}</div>
    </div>
    <div class="row" style="margin-top:14px">
      <div class="col card" style="flex-basis:620px"><h3>${T("teacher_load")}</h3><div id="rep-teachers" class="table-wrap"><span class="spinner"></span></div></div>
      <div class="col">
        <div class="card"><h3>${T("area_load")}</h3><p class="small muted">${T("explain_area")}</p><div id="rep-areas"></div></div>
        <div class="card" style="margin-top:14px"><h3>${T("section_load")}</h3><div id="rep-sections"></div></div>
      </div>
    </div>`;
  }
  async function loadReports() {
    const { body } = await api("/api/reports/loads");
    const teachers = byId("teachers");
    const rows = Object.entries(body.teachers).sort((a, b) => b[1].assigned - a[1].assigned).map(([id, l]) => {
      const t = teachers[id] || {}; const mx = t.max_week || 24;
      const pct = Math.min(100, Math.round(100 * l.assigned / mx));
      const days = Object.values(l.by_day); const dmax = Math.max(1, ...days);
      return `<tr><td><a href="#" onclick="App.openTT('teacher',${q(id)});return false"><b>${esc(id)}</b></a> ${esc(t.name || "")}<div class="small muted">${l.subjects.map(subjShort).join(", ")} · ${l.sections.join(", ")}</div></td>
        <td style="min-width:140px"><div class="bar ${l.assigned > mx ? "over" : ""}"><span style="width:${pct}%"></span></div><span class="small">${l.placed}/${l.assigned} · ${T("max")} ${mx}</span></td>
        <td><div class="minibars" title="${DAYS().map(DN).join(" · ")}">${days.map((x) => `<span style="height:${Math.round(22 * x / dmax)}px"></span>`).join("")}</div><span class="small muted">${days.join("·")}</span></td>
        <td>${l.gaps}</td><td>${days.filter((x) => x > 0).length}</td></tr>`;
    }).join("");
    const el = document.getElementById("rep-teachers");
    if (!el) return;
    el.innerHTML = `<table class="t"><thead><tr><th>${T("teacher")}</th><th>${T("assigned")}</th><th>${T("by_day")}</th><th>${T("gaps")}</th><th>${T("days_used")}</th></tr></thead><tbody>${rows}</tbody></table>`;
    const amax = Math.max(1, ...Object.values(body.areas).map((a) => a.periods));
    document.getElementById("rep-areas").innerHTML = Object.entries(body.areas).sort((a, b) => b[1].periods - a[1].periods).map(([id, a]) =>
      `<div style="margin-bottom:8px"><div class="small"><b>${esc(areaName(id))}</b> · ${a.periods} h · ${a.teachers.length} ${T("teachers").toLowerCase()} · ${a.subjects.map(subjShort).join(", ")}</div>
       <div class="bar"><span style="width:${Math.round(100 * a.periods / amax)}%;background:${(byId("areas")[id] || {}).color || "#2f6fd0"}"></span></div></div>`).join("");
    document.getElementById("rep-sections").innerHTML = `<table class="t"><thead><tr><th>${T("section")}</th><th>${T("fill")}</th></tr></thead><tbody>` +
      Object.entries(body.sections).map(([id, s]) => `<tr><td><a href="#" onclick="App.openTT('section',${q(id)});return false">${esc(id)}</a> <span class="small muted">${esc(secName(id))}</span></td>
       <td><div class="bar"><span style="width:${Math.round(100 * s.periods / s.slots)}%"></span></div><span class="small">${s.periods}/${s.slots}</span></td></tr>`).join("") + "</tbody></table>";
  }

  // ---------------------------------------------------------------- timetable grid
  function bellFor(mode, id) {
    if (mode === "section") return (byId("sections")[id] || {}).bell_id;
    const counts = {};
    for (const p of currentPlacements()) {
      const o = S.occ[p.occ_id]; if (!o) continue;
      if ((mode === "teacher" && o.teacher_ids.includes(id)) || (mode === "room" && p.room_id === id)) counts[o.bell_id] = (counts[o.bell_id] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : S.data.bells[S.data.bells.length - 1].id;
  }
  const currentPlacements = () => S.preview || S.data.placements;
  const bell = (id) => S.data.bells.find((b) => b.id === id);
  function occWindow(o, start) {
    const ps = bell(o.bell_id).periods; const i = start - 1;
    return ps[i] && ps[i + o.duration - 1] ? [ps[i].start, ps[i + o.duration - 1].end] : null;
  }
  function entityPlacements(mode, id) {
    return currentPlacements().filter((p) => {
      const o = S.occ[p.occ_id]; if (!o) return false;
      if (mode === "section") return o.section_id === id;
      if (mode === "teacher") return o.teacher_ids.includes(id);
      return p.room_id === id;
    });
  }

  function gridHTML(mode, id, opts = {}) {
    const b = bell(bellFor(mode, id)); if (!b) return "";
    const periods = b.periods, days = DAYS();
    const rows = []; // grid rows: {kind, n?, label}
    periods.forEach((p, i) => {
      if (i > 0) {
        const br = (b.breaks || []).find((x) => x.start >= periods[i - 1].end && x.end <= p.start);
        if (br) rows.push({ kind: "break", label: `${br.label || ""} ${hhmm(br.start)}–${hhmm(br.end)}` });
      }
      rows.push({ kind: "period", n: i + 1, p });
    });
    const rowOf = {}; rows.forEach((r, i) => { if (r.kind === "period") rowOf[r.n] = i + 2; });
    const hardOcc = new Set(S.validation.hard.flatMap((f) => f.occ_ids));
    const changed = new Set((S.preview && S.proposal ? S.proposal.diff : []).map((d) => d.occ_id));
    const subsByOcc = Object.fromEntries((S.data.substitutions || []).filter((x) => x.date === S.subsDate).map((x) => [x.occ_id, x]));
    let html = `<div class="tt" style="grid-template-columns:72px repeat(${days.length},minmax(110px,1fr));grid-template-rows:auto ${rows.map((r) => r.kind === "break" ? "18px" : "minmax(58px,auto)").join(" ")}">`;
    html += `<div class="h" style="grid-row:1;grid-column:1"></div>` + days.map((d, j) => `<div class="h" style="grid-row:1;grid-column:${j + 2}">${DN(d)}</div>`).join("");
    rows.forEach((r, i) => {
      if (r.kind === "break") { html += `<div class="brk" style="grid-row:${i + 2}">${esc(r.label)}</div>`; return; }
      html += `<div class="p" style="grid-row:${i + 2};grid-column:1"><b>${r.n}</b>${hhmm(r.p.start)}<br>${hhmm(r.p.end)}</div>`;
      days.forEach((d, j) => {
        html += `<div class="cell" data-day="${d}" data-period="${r.n}" style="grid-row:${i + 2};grid-column:${j + 2}"
          ondragover="App.dragOver(event)" ondrop="App.drop(event)"></div>`;
      });
    });
    // place lesson cards; group by (day, start row)
    const groups = {};
    for (const p of entityPlacements(mode, id)) {
      const o = S.occ[p.occ_id]; let r0, span;
      if (o.bell_id === b.id) { r0 = rowOf[p.period]; span = o.duration; }
      else { // foreign bell (teacher shared across levels): map by real minutes
        const w = occWindow(o, p.period); if (!w) continue;
        const hit = periods.map((x, k) => [k + 1, x]).filter(([, x]) => x.start < w[1] && w[0] < x.end);
        if (!hit.length) continue;
        r0 = rowOf[hit[0][0]]; span = hit.length;
      }
      if (!r0) continue;
      const key = `${p.day}|${r0}`;
      (groups[key] = groups[key] || { day: p.day, r0, span: 0, items: [] }).items.push({ p, o });
      groups[key].span = Math.max(groups[key].span, span);
    }
    for (const g of Object.values(groups)) {
      const col = days.indexOf(g.day) + 2;
      // a span crossing a break row must include it
      let end = g.r0; let left = g.span;
      while (left > 0) { if (rows[end - 2] && rows[end - 2].kind === "period") left--; end++; }
      html += `<div class="lesson-wrap" style="grid-row:${g.r0} / ${end};grid-column:${col};padding:2px;display:flex;gap:2px;z-index:2;pointer-events:none">`;
      for (const { p, o } of g.items) {
        const s = subj(o.subject_id);
        const foreign = o.bell_id !== b.id;
        const w = occWindow(o, p.period);
        const line2 = mode === "section" ? o.teacher_ids.join(", ") + (o.group_id ? ` · ${T("group")} ${o.group_id}` : "")
          : mode === "teacher" ? `${o.section_id}${o.group_id ? "/" + o.group_id : ""}` : `${o.section_id} · ${o.teacher_ids.join(", ")}`;
        const sub = subsByOcc[o.id];
        html += `<div class="lesson ${hardOcc.has(o.id) ? "conflict" : ""} ${changed.has(o.id) ? "changed" : ""} ${foreign ? "foreign" : ""} ${sub ? "sub" : ""}"
          style="background:${s.color || "#5b6b8c"};flex:1;pointer-events:auto" draggable="${!S.preview}" data-occ="${esc(o.id)}"
          ondragstart="App.dragStart(event,${q(o.id)})" ondragend="App.dragEnd()" onclick="App.lessonPanel(${q(o.id)})"
          title="${esc(subjName(o.subject_id))} · ${esc(o.id)} · ${w ? hhmm(w[0]) + "–" + hhmm(w[1]) : ""}">
          ${p.locked ? '<span class="lock">🔒</span>' : ""}
          <div class="s">${esc(subjShort(o.subject_id))}</div>
          <div class="m">${esc(line2)}</div>
          <div class="m">${esc(p.room_id || "")}${foreign && w ? ` · ${hhmm(w[0])}` : ""}${sub ? ` · ⇄ ${esc(sub.sub_teacher_id || "—")}` : ""}</div>
        </div>`;
      }
      html += `</div>`;
    }
    return html + "</div>";
  }

  function timetable() {
    const modes = [["section", T("section")], ["teacher", T("teacher")], ["room", T("room")]];
    const kind = { section: "sections", teacher: "teachers", room: "rooms" }[S.ttMode];
    const list = S.data[kind];
    if (!findEntity(S.ttMode, S.ttId)) S.ttId = (list[0] || {}).id;
    const ent = findEntity(S.ttMode, S.ttId) || {};
    const unplaced = Object.values(S.occ).filter((o) => !currentPlacements().some((p) => p.occ_id === o.id) &&
      (S.ttMode === "section" ? o.section_id === S.ttId : S.ttMode === "teacher" ? o.teacher_ids.includes(S.ttId) : o.room_ids.includes(S.ttId)));
    const load = (S.validation.teacher_load || {})[S.ttId];
    return `
    <div class="toolbar no-print">
      <span class="muted">${T("view_by")}</span>
      <span class="picker">${modes.map(([m, l]) => `<button class="${S.ttMode === m ? "active" : ""}" onclick="App.setTTMode('${m}')">${l}</button>`).join("")}</span>
      <select onchange="App.openTT(App.S.ttMode,this.value)">${list.map((x) => `<option value="${esc(x.id)}" ${x.id === S.ttId ? "selected" : ""}>${esc(x.id)} — ${esc(x.name || "")}</option>`).join("")}</select>
      <span class="spacer"></span>
      <button onclick="window.print()">🖨 ${T("print")}</button>
    </div>
    <h2 class="print-only">${esc(ent.name || S.ttId)}</h2>
    <p class="small muted no-print">${T("drag_hint")}</p>
    <div class="tt-layout">
      <div>${gridHTML(S.ttMode, S.ttId)}
        <div class="legend">${[...new Set(entityPlacements(S.ttMode, S.ttId).map((p) => S.occ[p.occ_id].subject_id))].map((s) => `<span><i style="background:${subj(s).color}"></i>${esc(subjName(s))}</span>`).join("")}</div>
      </div>
      <div class="tray no-print">
        <h4>${esc(ent.name || S.ttId)}</h4>
        ${S.ttMode === "teacher" && load ? `<p class="small">${T("assigned")}: <b>${load.assigned}</b> · ${T("placed")}: ${load.placed} · ${T("gaps")}: ${load.gaps}<br>${esc(ent.subject_ids.map(subjName).join(", "))}</p>` : ""}
        ${S.ttMode === "section" ? `<p class="small">${esc(ent.level || "")} ${esc(ent.track || "")} · ${T("bell")}: ${esc(ent.bell_id)}</p>` : ""}
        <h4>${T("unplaced")} (${unplaced.length})</h4>
        ${unplaced.map((o) => `<div class="lesson" draggable="true" style="background:${subj(o.subject_id).color}" ondragstart="App.dragStart(event,${q(o.id)})" ondragend="App.dragEnd()" onclick="App.lessonPanel(${q(o.id)})">
          <div class="s">${esc(subjShort(o.subject_id))} · ${o.duration}h</div><div class="m">${esc(o.section_id)} · ${esc(o.teacher_ids.join(", "))}</div></div>`).join("") || `<p class="small muted">—</p>`}
      </div>
    </div>`;
  }

  async function dragStart(ev, occId) {
    S.drag = occId;
    ev.dataTransfer.setData("text/plain", occId);
    document.body.classList.add("dragging");
    try {
      const { body } = await api(`/api/slots/${encodeURIComponent(occId)}`);
      S.slotMap = body;
      document.querySelectorAll(".tt .cell").forEach((c) => {
        const st = body[`${c.dataset.day}|${c.dataset.period}`];
        if (!st) return;
        c.classList.add(st.ok ? (st.soft_penalty ? "drop-soft" : "drop-ok") : "drop-bad");
        c.title = st.ok ? "" : st.codes.join(", ");
      });
    } catch (e) { /* the grid still accepts the drop; the server re-checks */ }
  }
  function dragEnd() {
    document.body.classList.remove("dragging");
    document.querySelectorAll(".tt .cell").forEach((c) => c.classList.remove("drop-ok", "drop-bad", "drop-soft"));
  }
  function dragOver(ev) { ev.preventDefault(); }
  async function drop(ev) {
    ev.preventDefault();
    const cell = ev.currentTarget; const occId = S.drag; dragEnd();
    if (!occId) return;
    await tryMove(occId, cell.dataset.day, +cell.dataset.period);
  }
  async function tryMove(occId, day, period) {
    const { status, body } = await api("/api/move", { method: "POST", body: { occ_id: occId, day, period } });
    if (status === 409) return showConflicts(occId, day, period, body.conflicts);
    toast(T("data_saved")); await load();
  }
  function showConflicts(occId, day, period, conflicts) {
    modal(T("move_conflicts"), `<p><b>${esc(occId)}</b> → ${DN(day)} · ${T("period")} ${period}</p>
      <ul class="list-issues">${conflicts.map((c) => `<li>${esc(M(c.message))}</li>`).join("")}</ul>`,
      [[T("cancel"), "closeModal()"], [T("propose_reorg"), `App.proposeMove(${q(occId)},${q(day)},${period})`, "primary"]]);
  }
  async function proposeMove(occId, day, period) {
    closeModal(); S.busy = true; render();
    try {
      const { body } = await api("/api/propose-move", { method: "POST", body: { occ_id: occId, day, period } });
      S.proposal = body; S.preview = body.placements || null;
    } finally { S.busy = false; render(); }
  }
  function lessonPanel(occId) {
    const o = S.occ[occId]; const p = S.data.placements.find((x) => x.occ_id === occId);
    const w = p ? occWindow(o, p.period) : null;
    const issues = [...S.validation.hard, ...S.validation.soft].filter((f) => f.occ_ids.includes(occId));
    modal(`${subjName(o.subject_id)} · ${o.section_id}`, `
      <div class="op-card"><dl>
        <dt>ID</dt><dd>${esc(o.id)}</dd>
        <dt>${T("section")}</dt><dd>${esc(secName(o.section_id))}${o.group_id ? ` · ${T("group")} ${esc(o.group_id)}` : ""}</dd>
        <dt>${T("teachers")}</dt><dd>${o.teacher_ids.map((t) => `${esc(t)} ${esc(teacherName(t))}`).join("<br>")}</dd>
        <dt>${T("periods")}</dt><dd>${o.duration}</dd>
        <dt>${T("day")}</dt><dd>${p ? `${DN(p.day)} · ${T("period")} ${p.period} · ${hhmm(w[0])}–${hhmm(w[1])}` : T("unplaced")}</dd>
        <dt>${T("room")}</dt><dd>${esc(p?.room_id || "—")} <span class="muted small">(${o.room_ids.join(", ")})</span></dd>
      </dl></div>
      ${issues.length ? `<ul class="list-issues">${issues.map((f) => `<li><span class="badge ${f.severity}">${f.severity === "hard" ? T("hard") : T("soft")}</span> ${esc(M(f.message))}</li>`).join("")}</ul>` : ""}`,
      [[T("close"), "closeModal()"],
       ...(p ? [[p.locked ? T("unlock") : "🔒 " + T("lock"), `App.lock(${q(occId)},${!p.locked})`],
                [T("unplace"), `App.unplace(${q(occId)})`, "danger"]] : [])]);
  }
  async function lock(occId, locked) { closeModal(); await api("/api/lock", { method: "POST", body: { occ_id: occId, locked } }); await load(); }
  async function unplace(occId) { closeModal(); await api("/api/unplace", { method: "POST", body: { occ_id: occId } }); await load(); }
  function focusOcc(occId) { S.ttMode = "section"; S.ttId = occSec(occId); go("timetable"); setTimeout(() => lessonPanel(occId), 50); }

  // ---------------------------------------------------------------- overview (all at once)
  function overview() {
    const ref = S.data.bells.reduce((a, b) => (b.periods.length > a.periods.length ? b : a));
    const days = DAYS();
    const kind = { teachers: "teachers", sections: "sections", rooms: "rooms" }[S.ovMode];
    const mode = { teachers: "teacher", sections: "section", rooms: "room" }[S.ovMode];
    const f = S.filter.toLowerCase();
    const list = S.data[kind].filter((x) => !f || `${x.id} ${x.name || ""}`.toLowerCase().includes(f));
    const hardOcc = new Set(S.validation.hard.flatMap((x) => x.occ_ids));
    let html = `<div class="toolbar"><span class="picker">${["teachers", "sections", "rooms"].map((m) =>
      `<button class="${S.ovMode === m ? "active" : ""}" onclick="App.setOv('${m}')">${T(m)}</button>`).join("")}</span>
      <input placeholder="${T("filter")}" value="${esc(S.filter)}" oninput="App.setFilter(this.value)">
      <span class="spacer"></span><button onclick="window.print()">🖨 ${T("print")}</button></div>
      <div class="table-wrap" style="max-height:78vh"><table class="ov"><thead><tr><th rowspan="2" style="left:0;z-index:3">${T(S.ovMode)}</th>
      ${days.map((d) => `<th colspan="${ref.periods.length}" class="dsep">${DN(d)}</th>`).join("")}</tr><tr>
      ${days.map(() => ref.periods.map((p, i) => `<th class="${i === ref.periods.length - 1 ? "dsep" : ""}" title="${hhmm(p.start)}">${i + 1}</th>`).join("")).join("")}</tr></thead><tbody>`;
    const index = {};
    for (const p of currentPlacements()) {
      const o = S.occ[p.occ_id]; if (!o) continue;
      const w = occWindow(o, p.period); if (!w) continue;
      const keys = mode === "teacher" ? o.teacher_ids : mode === "section" ? [o.section_id] : [p.room_id];
      for (const k of keys) (index[k] = index[k] || []).push({ p, o, w });
    }
    for (const e of list) {
      html += `<tr><td class="name" onclick="App.openTT('${mode}',${q(e.id)})"><b>${esc(e.id)}</b> <span class="muted">${esc((e.name || "").slice(0, 26))}</span></td>`;
      for (const d of days) {
        ref.periods.forEach((rp, i) => {
          const hits = (index[e.id] || []).filter((x) => x.p.day === d && x.w[0] < rp.end && rp.start < x.w[1]);
          const cls = i === ref.periods.length - 1 ? "c dsep" : "c";
          if (!hits.length) { html += `<td class="${cls}"></td>`; return; }
          const x = hits[0];
          // red only for a real clash (overlapping minutes) or a validator finding, not for two short periods in one column
          const clash = hits.some((a, i) => hits.some((b2, j) => j > i && a.w[0] < b2.w[1] && b2.w[0] < a.w[1] && !(mode === "section" && a.o.group_id && b2.o.group_id && a.o.group_id !== b2.o.group_id)));
          const bad = clash || hits.some((h) => hardOcc.has(h.o.id));
          const label = mode === "teacher" ? x.o.section_id : subjShort(x.o.subject_id);
          html += `<td class="${cls}" title="${esc(hits.map((h) => `${subjName(h.o.subject_id)} · ${h.o.section_id} · ${h.o.teacher_ids.join(",")} · ${hhmm(h.w[0])}`).join("\n"))}">
            <div style="background:${bad ? "#d23c3c" : subj(x.o.subject_id).color}">${esc(label)}${hits.length > 1 ? "+" : ""}</div></td>`;
        });
      }
      html += "</tr>";
    }
    return html + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- data & load
  const FIELDS = {
    teachers: [["id", "text"], ["name", "text"], ["short", "text"], ["email", "text"], ["subject_ids", "multi:subjects"],
               ["max_day", "number"], ["max_week", "number"], ["cover_eligible", "bool"], ["contract_note", "text"]],
    sections: [["id", "text"], ["name", "text"], ["level", "text"], ["track", "text"], ["bell_id", "select:bells"],
               ["home_room", "select:rooms"], ["groups", "groups"]],
    subjects: [["id", "text"], ["name_es", "text"], ["name_it", "text"], ["short", "text"], ["area_id", "select:areas"],
               ["color", "color"], ["core", "bool"]],
    areas: [["id", "text"], ["name_es", "text"], ["name_it", "text"], ["color", "color"]],
    rooms: [["id", "text"], ["name", "text"], ["kind", "text"]],
    lessons: [["id", "text"], ["section_id", "select:sections"], ["subject_id", "select:subjects"], ["teacher_ids", "multi:teachers"],
              ["periods_per_week", "number"], ["blocks", "blocks"], ["room_ids", "multi:rooms"], ["group_id", "text"]],
    bells: [["id", "text"], ["name", "text"], ["periods", "json"], ["breaks", "json"]],
  };
  const LABEL = { id: "ID", name: "name", short: "short", email: "Email", subject_ids: "subjects", max_day: "max_day", max_week: "max_week",
    cover_eligible: "cover_eligible", contract_note: "contract", level: "level", track: "track", bell_id: "bell", home_room: "home_room",
    groups: "groups", name_es: "Nombre (ES)", name_it: "Nome (IT)", area_id: "area", color: "color", core: "core", kind: "kind",
    section_id: "section", subject_id: "subject", teacher_ids: "teachers", periods_per_week: "periods_week", blocks: "blocks",
    room_ids: "rooms", group_id: "group", periods: "periods", breaks: "Breaks / Recreos" };

  function dataView() {
    const tabs = ["teachers", "sections", "lessons", "subjects", "areas", "rooms", "bells"];
    const kind = S.dataTab; const f = S.filter.toLowerCase();
    const items = (S.data[kind] || []).filter((x) => !f || JSON.stringify(x).toLowerCase().includes(f));
    const cols = FIELDS[kind].filter(([k, t]) => t !== "json").slice(0, 8);
    const cell = (x, k, t) => {
      const v = x[k];
      if (t.startsWith("multi")) return (v || []).map(esc).join(", ");
      if (t === "bool") return v ? "✓" : "";
      if (t === "color") return `<span class="chip" style="background:${esc(v)};color:#fff">${esc(v)}</span>`;
      if (t === "groups") return (v || []).map((g) => g.id).join(", ");
      if (t === "blocks") return (v || []).join("+");
      return esc(v);
    };
    let extra = "";
    if (kind === "bells") extra = S.data.bells.map((b) => `<div class="card" style="margin-top:10px"><b>${esc(b.id)}</b> ${esc(b.name)}: ${b.periods.map((p, i) => `<span class="chip">${i + 1} · ${hhmm(p.start)}–${hhmm(p.end)}</span>`).join(" ")}
      ${(b.breaks || []).map((br) => `<span class="chip warn">${esc(br.label || "")} ${hhmm(br.start)}–${hhmm(br.end)}</span>`).join(" ")}</div>`).join("");
    return `<div class="tabs">${tabs.map((t) => `<button class="${t === kind ? "active" : ""}" onclick="App.setDataTab('${t}')">${T(t)} (${(S.data[t] || []).length})</button>`).join("")}</div>
      <div class="toolbar"><input placeholder="${T("filter")}" value="${esc(S.filter)}" oninput="App.setFilter(this.value)">
      <span class="spacer"></span>
      <button onclick="App.exportFile('json')">${T("export_json")}</button><button onclick="App.exportFile('csv')">${T("export_csv")}</button>
      <button onclick="document.getElementById('imp').click()">${T("import_json")}</button><input type="file" id="imp" accept=".json" style="display:none" onchange="App.importJson(this.files[0])">
      <button class="primary" onclick="App.editEntity('${kind}',null)">+ ${T("add")}</button></div>
      <div class="table-wrap"><table class="t"><thead><tr>${cols.map(([k]) => `<th>${esc(T(LABEL[k] || k))}</th>`).join("")}${kind === "teachers" ? `<th>${T("periods_week")}</th>` : ""}<th></th></tr></thead><tbody>
      ${items.map((x) => `<tr>${cols.map(([k, t]) => `<td>${cell(x, k, t)}</td>`).join("")}
        ${kind === "teachers" ? `<td>${(S.validation.teacher_load[x.id] || {}).assigned ?? 0}</td>` : ""}
        <td style="white-space:nowrap">${kind === "teachers" ? `<button class="small" onclick="App.availability(${q(x.id)})">${T("availability")}</button> ` : ""}
        ${["teachers", "sections", "rooms"].includes(kind) ? `<button class="small" onclick="App.openTT('${kind.slice(0, -1)}',${q(x.id)})">▤</button> ` : ""}
        <button class="small" onclick="App.editEntity('${kind}',${q(x.id)})">${T("edit")}</button>
        <button class="small danger" onclick="App.deleteEntity('${kind}',${q(x.id)})">✕</button></td></tr>`).join("")}
      </tbody></table></div>${extra}`;
  }

  function fieldInput(k, t, v) {
    const id = `f_${k}`;
    if (t === "bool") return `<label><input type="checkbox" id="${id}" ${v ? "checked" : ""}> ${esc(T(LABEL[k] || k))}</label>`;
    let inp;
    if (t.startsWith("select:")) {
      const src = S.data[t.split(":")[1]] || [];
      inp = `<select id="${id}"><option value=""></option>${src.map((x) => `<option value="${esc(x.id)}" ${x.id === v ? "selected" : ""}>${esc(x.id)} ${esc(x.name || x.name_es || "")}</option>`).join("")}</select>`;
    } else if (t.startsWith("multi:")) {
      const src = S.data[t.split(":")[1]] || []; const set = new Set(v || []);
      inp = `<div class="checks" id="${id}">${src.map((x) => `<label><input type="checkbox" value="${esc(x.id)}" ${set.has(x.id) ? "checked" : ""}>${esc(x.id)}</label>`).join("")}</div>`;
    } else if (t === "json") inp = `<textarea id="${id}">${esc(JSON.stringify(v || [], null, 1))}</textarea>`;
    else if (t === "groups") inp = `<input id="${id}" value="${esc((v || []).map((g) => g.id).join(","))}" placeholder="A,B">`;
    else if (t === "blocks") inp = `<input id="${id}" value="${esc((v || []).join(","))}">`;
    else inp = `<input id="${id}" type="${t === "number" ? "number" : t === "color" ? "color" : "text"}" value="${esc(v ?? "")}">`;
    return `<div class="${t.startsWith("multi") || t === "json" ? "wide" : ""}"><label>${esc(T(LABEL[k] || k))}</label>${inp}</div>`;
  }
  function readField(k, t) {
    const el = document.getElementById(`f_${k}`);
    if (t === "bool") return el.checked;
    if (t.startsWith("multi:")) return [...el.querySelectorAll("input:checked")].map((x) => x.value);
    if (t === "number") return el.value === "" ? null : +el.value;
    if (t === "json") return JSON.parse(el.value || "[]");
    if (t === "groups") return el.value.split(",").map((s) => s.trim()).filter(Boolean).map((g) => ({ id: g, name: `${T("group")} ${g}` }));
    if (t === "blocks") return el.value.split(/[,+ ]+/).map((s) => +s).filter((n) => n > 0);
    return el.value || null;
  }
  function editEntity(kind, id) {
    const item = id ? JSON.parse(JSON.stringify((S.data[kind] || []).find((x) => x.id === id))) : {};
    modal(`${T(kind)} · ${id || T("add")}`, `<div class="form-grid">${FIELDS[kind].map(([k, t]) => fieldInput(k, t, item[k])).join("")}</div>`,
      [[T("cancel"), "closeModal()"], [T("save"), `App.saveEntity('${kind}',${id ? q(id) : "null"})`, "primary"]]);
    App._editing = item;
  }
  async function saveEntity(kind, oldId) {
    const item = App._editing || {};
    try { for (const [k, t] of FIELDS[kind]) item[k] = readField(k, t); } catch (e) { return toast(T("error") + ": " + e.message); }
    if (kind === "lessons" && item.blocks && item.blocks.length) item.periods_per_week = item.blocks.reduce((a, b) => a + b, 0);
    if (kind === "lessons" && !item.group_id) delete item.group_id;
    if (!item.id) return toast("ID");
    await api(`/api/entities/${kind}/${encodeURIComponent(item.id)}`, { method: "PUT", body: item });
    if (oldId && oldId !== item.id) await api(`/api/entities/${kind}/${encodeURIComponent(oldId)}`, { method: "DELETE" });
    closeModal(); toast(T("data_saved")); await load();
  }
  async function deleteEntity(kind, id) {
    if (!confirm(`${T("delete")} ${id}?`)) return;
    await api(`/api/entities/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }); await load();
  }

  // teacher availability grid: unavailable (hard rule) / cover duty / free
  function teacherBell(tid) { return bell(bellFor("teacher", tid)); }
  function availability(tid) {
    const t = byId("teachers")[tid]; const b = teacherBell(tid);
    const rid = `R-${tid}-UNAV-GRID`;
    const rule = (S.data.constraints || []).find((c) => c.id === rid);
    const unav = (rule && rule.slots) || []; const duty = t.cover_duty || [];
    const st = (d, p) => unav.some((s) => s.day === d && s.start < p.end && p.start < s.end) ? "u" : duty.some((s) => s.day === d && s.start < p.end && p.start < s.end) ? "d" : "";
    App._avail = { tid, bell: b, cells: {} };
    const rows = b.periods.map((p, i) => `<tr><th>${i + 1}<br><span class="muted">${hhmm(p.start)}</span></th>${DAYS().map((d) => {
      const s = st(d, p); App._avail.cells[`${d}|${i}`] = s;
      return `<td class="${s}" data-k="${d}|${i}" onclick="App.cycleAvail(this)">${s === "u" ? T("unav") : s === "d" ? T("duty") : ""}</td>`; }).join("")}</tr>`).join("");
    modal(`${T("availability")} · ${tid} ${t.name}`, `<p class="small muted">${T("avail_help")}</p>
      <table class="avail"><tr><th></th>${DAYS().map((d) => `<th>${DN(d).slice(0, 3)}</th>`).join("")}</tr>${rows}</table>
      <p class="small muted">${T("bell")}: ${esc(b.id)}. ${(S.data.constraints || []).filter((c) => c.teacher_id === tid && c.id !== rid).map((c) => `<span class="chip">${esc(c.id)}</span>`).join(" ")}</p>`,
      [[T("cancel"), "closeModal()"], [T("save"), "App.saveAvail()", "primary"]]);
  }
  function cycleAvail(td) {
    const next = { "": "u", u: "d", d: "" }[App._avail.cells[td.dataset.k]];
    App._avail.cells[td.dataset.k] = next; td.className = next;
    td.textContent = next === "u" ? T("unav") : next === "d" ? T("duty") : "";
  }
  async function saveAvail() {
    const { tid, bell: b, cells } = App._avail; const t = JSON.parse(JSON.stringify(byId("teachers")[tid]));
    const slots = [], duty = [];
    for (const [k, v] of Object.entries(cells)) {
      const [d, i] = k.split("|"); const p = b.periods[+i];
      if (v === "u") slots.push({ day: d, start: p.start, end: p.end });
      if (v === "d") duty.push({ day: d, start: p.start, end: p.end });
    }
    const rid = `R-${tid}-UNAV-GRID`;
    if (slots.length) await api(`/api/entities/constraints/${rid}`, { method: "PUT", body: { type: "teacher_unavailable", teacher_id: tid, slots, hard: true, note: "Grilla de disponibilidad" } });
    else if ((S.data.constraints || []).some((c) => c.id === rid)) await api(`/api/entities/constraints/${rid}`, { method: "DELETE" });
    t.cover_duty = duty;
    await api(`/api/entities/teachers/${encodeURIComponent(tid)}`, { method: "PUT", body: t });
    closeModal(); toast(T("data_saved")); await load();
  }

  // ---------------------------------------------------------------- rules
  function ruleScope(c) {
    const p = [];
    if (c.teacher_id) p.push(`${T("teacher")}: ${c.teacher_id}`);
    if (c.section_id) p.push(`${T("section")}: ${c.section_id}`);
    if (c.teacher_ids) p.push(c.teacher_ids.length ? c.teacher_ids.join(", ") : T("all"));
    if (c.subject_ids && c.subject_ids.length) p.push(c.subject_ids.map(subjShort).join(", "));
    if (c.section_ids && c.section_ids.length) p.push(c.section_ids.join(", "));
    if (c.days) p.push(c.days.map(DN).join(", "));
    if (c.periods) p.push(`${T("periods")} ${c.periods.join(",")}`);
    if (c.day || c.period) p.push(`${c.day ? DN(c.day) : ""} ${T("period")} ${c.period}`);
    if (c.max) p.push(`${T("max")} ${c.max}`);
    if (c.slots) p.push(`${c.slots.length} franjas`);
    return p.join(" · ");
  }
  function rules() {
    const list = S.data.constraints || [];
    const spread = (S.data.settings || {}).spread_lessons !== false;
    return `<div class="banner info">${T("engine_help")}</div>
      <div class="toolbar"><label style="margin:0"><input type="checkbox" ${spread ? "checked" : ""} onchange="App.setSetting('spread_lessons',this.checked)"> ${T("spread")}</label>
      <span class="spacer"></span><button onclick="App.diagnose()">${T("run_diag")}</button><button class="primary" onclick="App.editRule(null)">+ ${T("new_rule")}</button></div>
      <div id="diag"></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>${T("rule")}</th><th>${T("type")}</th><th>${T("scope")}</th><th></th><th>${T("priority")}</th><th>${T("enabled")}</th><th>${T("note")}</th><th></th></tr></thead><tbody>
      ${list.map((c) => { const hard = c.hard ?? (S.ctypes[c.type] || {}).default_hard; return `<tr>
        <td><b>${esc(c.id)}</b></td><td>${T("ct_" + c.type)}</td><td class="small">${esc(ruleScope(c))}</td>
        <td><span class="badge ${hard ? "hard" : "soft"}">${hard ? T("hard") : T("soft")}</span></td><td>${hard ? "—" : c.priority ?? 2}</td>
        <td><input type="checkbox" ${c.enabled !== false ? "checked" : ""} onchange="App.toggleRule(${q(c.id)},this.checked)"></td>
        <td class="small muted">${esc(c.note || "")}</td>
        <td style="white-space:nowrap"><button class="small" onclick="App.editRule(${q(c.id)})">${T("edit")}</button> <button class="small danger" onclick="App.deleteEntity('constraints',${q(c.id)})">✕</button></td></tr>`; }).join("")}
      </tbody></table></div>`;
  }
  async function diagnose() {
    const { body } = await api("/api/diagnose");
    document.getElementById("diag").innerHTML = `<div class="card" style="margin-bottom:12px"><h3>${T("diag")}</h3>${body.fatal.length ? `<ul class="list-issues">${body.fatal.map(issueLi).join("")}</ul>` : `<p class="muted">✓ ${T("no_issues")}</p>`}</div>`;
  }
  async function toggleRule(id, on) {
    const c = JSON.parse(JSON.stringify(S.data.constraints.find((x) => x.id === id))); c.enabled = on;
    await api(`/api/entities/constraints/${encodeURIComponent(id)}`, { method: "PUT", body: c }); await load();
  }
  async function setSetting(k, v) { await api("/api/settings", { method: "PUT", body: { [k]: v } }); await load(); }
  function editRule(id) {
    const c = id ? JSON.parse(JSON.stringify(S.data.constraints.find((x) => x.id === id))) : { type: "teacher_allowed_days", hard: true };
    App._rule = c; renderRuleForm();
  }
  function renderRuleForm() {
    const c = App._rule; const types = Object.keys(S.ctypes);
    const hard = c.hard ?? S.ctypes[c.type].default_hard;
    const sel = (id, src, v, empty = true) => `<select id="${id}">${empty ? "<option value=''></option>" : ""}${src.map((x) => `<option value="${esc(x.id)}" ${x.id === v ? "selected" : ""}>${esc(x.id)} ${esc(x.name || x.name_es || "")}</option>`).join("")}</select>`;
    const multi = (id, src, vals) => `<div class="checks" id="${id}">${src.map((x) => `<label><input type="checkbox" value="${esc(x.id)}" ${(vals || []).includes(x.id) ? "checked" : ""}>${esc(x.label || x.id)}</label>`).join("")}</div>`;
    const dayList = DAYS().map((d) => ({ id: d, label: DN(d) }));
    const maxP = Math.max(...S.data.bells.map((b) => b.periods.length));
    const pList = Array.from({ length: maxP }, (_, i) => ({ id: i + 1, label: String(i + 1) }));
    const pChecks = (id, vals) => `<div class="checks" id="${id}">${pList.map((x) => `<label><input type="checkbox" value="${x.id}" ${(vals || []).includes(x.id) ? "checked" : ""}>${x.label}</label>`).join("")}</div>`;
    let f = "";
    const t = c.type;
    if (["teacher_unavailable", "teacher_allowed_days", "teacher_max_days"].includes(t)) f += `<div><label>${T("teacher")}</label>${sel("r_teacher", S.data.teachers, c.teacher_id)}</div>`;
    if (t === "section_unavailable") f += `<div><label>${T("section")}</label>${sel("r_section", S.data.sections, c.section_id)}</div>`;
    if (t === "teacher_allowed_days") f += `<div class="wide"><label>${T("days")}</label>${multi("r_days", dayList, c.days)}</div>`;
    if (t === "teacher_unavailable" || t === "section_unavailable") {
      const days = [...new Set((c.slots || []).map((s) => s.day))];
      f += `<div class="wide"><label>${T("days")}</label>${multi("r_days", dayList, days)}</div><div class="wide"><label>${T("periods")} (${T("all_day")} = ∅)</label>${pChecks("r_periods", c._periods || [])}</div>`;
    }
    if (t === "teacher_max_days") f += `<div><label>${T("max")}</label><input id="r_max" type="number" value="${c.max ?? 4}"></div>`;
    if (t === "preferred_periods") f += `<div class="wide"><label>${T("subjects")}</label>${multi("r_subjects", S.data.subjects, c.subject_ids)}</div><div class="wide"><label>${T("periods")}</label>${pChecks("r_periods", c.periods || [])}</div><div class="wide"><label>${T("sections")} (∅ = ${T("all")})</label>${multi("r_sections", S.data.sections, c.section_ids)}</div>`;
    if (t === "avoid_slot") f += `<div><label>${T("day")}</label><select id="r_day"><option value="">${T("all")}</option>${DAYS().map((d) => `<option value="${d}" ${c.day === d ? "selected" : ""}>${DN(d)}</option>`).join("")}</select></div><div><label>${T("period")}</label><input id="r_period" type="number" value="${c.period ?? maxP}"></div><div class="wide"><label>${T("subjects")} (∅ = ${T("all")})</label>${multi("r_subjects", S.data.subjects, c.subject_ids)}</div>`;
    if (t === "teacher_compact_days" || t === "teacher_gaps") f += `<div class="wide"><label>${T("teachers")} (∅ = ${T("all")})</label>${multi("r_teachers", S.data.teachers, c.teacher_ids)}</div>`;
    modal(`${T("rule")} · ${c.id || T("new_rule")}`, `<div class="form-grid">
      <div><label>ID</label><input id="r_id" value="${esc(c.id || "")}" placeholder="R-..."></div>
      <div><label>${T("type")}</label><select id="r_type" onchange="App._rule.type=this.value;delete App._rule.hard;App.renderRuleForm()">${types.map((x) => `<option value="${x}" ${x === t ? "selected" : ""}>${T("ct_" + x)}</option>`).join("")}</select></div>
      <div><label>&nbsp;</label><label><input type="checkbox" id="r_hard" ${hard ? "checked" : ""}> ${T("hard")}</label></div>
      <div><label>${T("priority")} (1 alta · 3 baja)</label><select id="r_priority">${[1, 2, 3].map((p) => `<option ${(c.priority ?? 2) === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      ${f}
      <div class="wide"><label>${T("note")}</label><input id="r_note" value="${esc(c.note || "")}"></div></div>`,
      [[T("cancel"), "closeModal()"], [T("save"), "App.saveRule()", "primary"]]);
  }
  async function saveRule() {
    const c = App._rule; const g = (id) => document.getElementById(id);
    const checks = (id) => g(id) ? [...g(id).querySelectorAll("input:checked")].map((x) => isNaN(+x.value) ? x.value : +x.value) : [];
    const old = c.id; c.id = g("r_id").value || `R-${Date.now().toString(36)}`; c.type = g("r_type").value;
    c.hard = g("r_hard").checked; c.priority = +g("r_priority").value; c.note = g("r_note").value;
    if (g("r_teacher")) c.teacher_id = g("r_teacher").value;
    if (g("r_section")) c.section_id = g("r_section").value;
    if (c.type === "teacher_allowed_days") c.days = checks("r_days");
    if (c.type === "teacher_unavailable" || c.type === "section_unavailable") {
      const days = checks("r_days"); const ps = checks("r_periods");
      const b = c.type === "teacher_unavailable" ? teacherBell(c.teacher_id) : bell((byId("sections")[c.section_id] || {}).bell_id) || S.data.bells[0];
      c.slots = days.flatMap((d) => ps.length ? b.periods.filter((p, i) => ps.includes(i + 1)).map((p) => ({ day: d, start: p.start, end: p.end })) : [{ day: d, start: 0, end: 1440 }]);
    }
    if (c.type === "teacher_max_days") c.max = +g("r_max").value;
    if (c.type === "preferred_periods") { c.subject_ids = checks("r_subjects"); c.periods = checks("r_periods"); c.section_ids = checks("r_sections"); }
    if (c.type === "avoid_slot") { c.day = g("r_day").value || null; c.period = +g("r_period").value; c.subject_ids = checks("r_subjects"); }
    if (c.type === "teacher_compact_days" || c.type === "teacher_gaps") c.teacher_ids = checks("r_teachers");
    await api(`/api/entities/constraints/${encodeURIComponent(c.id)}`, { method: "PUT", body: c });
    if (old && old !== c.id) await api(`/api/entities/constraints/${encodeURIComponent(old)}`, { method: "DELETE" });
    closeModal(); toast(T("data_saved")); await load();
  }

  // ---------------------------------------------------------------- substitutions
  function subs() {
    return `<div class="toolbar no-print"><label style="margin:0">${T("date")}</label><input type="date" value="${S.subsDate}" onchange="App.setSubsDate(this.value)">
      <span class="spacer"></span><button onclick="App.autoAssign()">${T("auto_assign")}</button><button onclick="window.print()">🖨 ${T("print_sheet")}</button></div>
      <div class="row">
        <div class="col card no-print" style="flex:0 1 330px"><h3>${T("add_absence")}</h3>
          <label>${T("teacher")}</label><select id="ab_t">${S.data.teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.id)} ${esc(t.name)}</option>`).join("")}</select>
          <label>${T("category")}</label><select id="ab_c">${["enfermedad", "permiso", "capacitacion", "otro"].map((c) => `<option value="${c}">${T("cat_" + c)}</option>`).join("")}</select>
          <p class="small muted">${T("all_day")}</p>
          <button class="primary" onclick="App.addAbsence()">${T("add_absence")}</button>
          <h3 style="margin-top:16px">${T("absences")}</h3><div id="ab_list"><span class="spinner"></span></div></div>
        <div class="col card" style="flex-basis:560px"><h2 class="print-only">${T("affected")} · ${S.subsDate}</h2><h3 class="no-print">${T("affected")}</h3><div id="aff"><span class="spinner"></span></div></div>
      </div>`;
  }
  async function loadSubs() {
    const { body } = await api(`/api/substitutions?date=${S.subsDate}`);
    const al = document.getElementById("ab_list"); if (!al) return;
    al.innerHTML = body.absences.length ? body.absences.map((a) => `<div class="chip" style="margin:2px">${esc(a.teacher_id)} · ${T("cat_" + a.category) || esc(a.category)} <a href="#" onclick="App.delAbsence(${q(a.id)});return false">✕</a></div>`).join("") : `<p class="muted small">${T("none")}</p>`;
    document.getElementById("aff").innerHTML = body.affected.length ? `<table class="t"><thead><tr><th>${T("time")}</th><th>${T("section")}</th><th>${T("subject")}</th><th>${T("teacher")}</th><th>${T("covered_by")}</th><th class="no-print"></th></tr></thead><tbody>
      ${body.affected.map((r) => `<tr><td>${r.time}<div class="small muted">${T("period")} ${r.periods.join(",")}</div></td><td>${esc(r.section_id)}</td><td>${esc(subjName(r.subject_id))}</td>
        <td>${r.absent_teacher_ids.map(esc).join(", ")}</td>
        <td>${r.substitution ? (r.substitution.sub_teacher_id ? `<b>${esc(r.substitution.sub_teacher_id)}</b> ${esc(teacherName(r.substitution.sub_teacher_id))}` : `<span class="chip warn">${T("no_cover")}</span>`) : `<span class="chip bad">${T("uncovered")}</span>`}</td>
        <td class="no-print"><button class="small" onclick="App.candidates(${q(r.occ_id)})">${T("candidates")}</button></td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">${T("none")}</p>`;
  }
  async function addAbsence() {
    await api("/api/absences", { method: "POST", body: { date: S.subsDate, teacher_id: document.getElementById("ab_t").value, category: document.getElementById("ab_c").value } });
    await load();
  }
  async function delAbsence(id) { await api(`/api/absences/${id}`, { method: "DELETE" }); await load(); }
  async function autoAssign() { const { body } = await api("/api/substitutions/auto", { method: "POST", body: { date: S.subsDate } }); toast(`${T("applied")}: ${body.assigned.length}`); await load(); }
  async function candidates(occId) {
    const { body } = await api(`/api/substitutions/candidates?date=${S.subsDate}&occ_id=${encodeURIComponent(occId)}`);
    const ex = Object.entries(body.excluded).map(([k, n]) => `${n} ${T("ex_" + k)}`).join(" · ");
    modal(`${T("candidates")} · ${occId} · ${body.time}`, `
      <table class="t"><thead><tr><th>${T("teacher")}</th><th></th><th>${T("reasons")}</th><th>${T("covers_30d")}</th><th>${T("load_today")}</th><th></th></tr></thead><tbody>
      ${body.candidates.map((c) => `<tr><td><b>${esc(c.teacher_id)}</b> ${esc(c.name)}</td><td><span class="badge ${c.tier}">${T("tier_" + c.tier)}</span></td>
        <td class="small">${c.reasons.map((r) => T("r_" + r)).join(", ")}</td><td>${c.covers_30d}</td><td>${c.load_today}</td>
        <td><button class="small primary" onclick="App.assignSub(${q(occId)},${q(c.teacher_id)})">${T("assign")}</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">${T("none")}</td></tr>`}
      </tbody></table><p class="small muted">${T("excluded")}: ${ex || "—"}</p>`,
      [[T("close"), "closeModal()"], [T("no_cover"), `App.assignSub(${q(occId)},null)`]]);
  }
  async function assignSub(occId, tid) {
    closeModal();
    await api("/api/substitutions", { method: "POST", body: { date: S.subsDate, occ_id: occId, sub_teacher_id: tid, kind: tid ? "cover" : "study" } });
    await load();
  }

  // ---------------------------------------------------------------- publishing
  function publish() { return `<div class="banner info">${T("publish_intro")}</div><div id="pub"><span class="spinner"></span></div>`; }
  async function loadPublish() {
    const { body } = await api("/api/publish");
    const el = document.getElementById("pub"); if (!el) return;
    el.innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>${T("teacher")}</th><th>${T("periods_week")}</th><th></th></tr></thead><tbody>
      ${body.map((x) => { const url = location.origin + x.link + `?lang=${S.lang}`; const mail = `mailto:${encodeURIComponent(x.email || "")}?subject=${encodeURIComponent(T("teacher_page"))}&body=${encodeURIComponent(url)}`;
        return `<tr><td><b>${esc(x.teacher_id)}</b> ${esc(x.name)}</td><td>${(S.validation.teacher_load[x.teacher_id] || {}).placed ?? 0}</td>
        <td style="white-space:nowrap"><a href="${esc(x.link)}?lang=${S.lang}" target="_blank"><button class="small">${T("open")}</button></a>
        <button class="small" onclick="navigator.clipboard.writeText(${q(url)});App.toast(App.T('copied'))">${T("copy")}</button>
        <a href="/api/teacher/${esc(x.link.split("/").slice(2).join("/"))}/ics?lang=${S.lang}"><button class="small">${T("ics")}</button></a>
        <a href="${mail}"><button class="small">${T("email")}</button></a></td></tr>`; }).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- history
  function history() {
    return `<div class="banner info">${T("history_intro")}</div>
      <div class="toolbar"><span class="spacer"></span><select id="seed">${["school", "fixture", "multibell"].map((s) => `<option value="${s}">${T("seed_" + s)}</option>`).join("")}</select>
      <button onclick="App.resetDemo()">${T("reset_demo")}</button></div><div id="hist"><span class="spinner"></span></div>`;
  }
  async function loadHistory() {
    const { body } = await api("/api/versions");
    const el = document.getElementById("hist"); if (!el) return;
    el.innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>${T("date")}</th><th>${T("author")}</th><th>${T("message")}</th><th></th></tr></thead><tbody>
      ${body.map((v) => `<tr><td>${v.n}</td><td class="small">${new Date(v.created * 1000).toLocaleString(S.lang)}</td><td>${esc(v.author)}</td><td>${esc(v.message)}</td>
        <td style="white-space:nowrap">${v.n !== S.version ? `<button class="small" onclick="App.versionDiff(${v.n})">${T("diff")}</button> <button class="small" onclick="App.restore(${v.n})">${T("restore")}</button>` : `<span class="chip ok">${T("current")}</span>`}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  async function versionDiff(n) {
    const { body } = await api(`/api/versions/${n}/diff`);
    const fmt = (p) => p ? `${DN(p.day)} ${p.period} ${p.room_id || ""}` : "—";
    modal(`v${n} → v${S.version}`, `
      ${["rules_added", "rules_removed", "rules_changed"].map((k) => body[k].length ? `<p><b>${k.replace("rules_", "± ")}</b>: ${body[k].map((r) => `<span class="chip">${esc(r)}</span>`).join(" ")}</p>` : "").join("")}
      <table class="t"><thead><tr><th>ID</th><th>${T("before")}</th><th>${T("after")}</th></tr></thead><tbody>
      ${body.placements.map((d) => `<tr><td>${esc(d.occ_id)}</td><td>${fmt(d.before)}</td><td>${fmt(d.after)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">${T("none")}</td></tr>`}</tbody></table>`,
      [[T("close"), "closeModal()"], [T("restore"), `App.restore(${n})`, "primary"]]);
  }
  async function restore(n) { closeModal(); await api(`/api/versions/${n}/restore`, { method: "POST" }); S.proposal = null; S.preview = null; await load(); toast(T("data_saved")); }
  async function resetDemo() {
    const seed = document.getElementById("seed").value;
    if (!confirm(T("reset_demo") + "?")) return;
    await api("/api/reset", { method: "POST", body: { seed } }); S.proposal = null; S.preview = null; S.ttId = null; await load();
  }
  function exportFile(kind) { location.href = `/api/export/${kind}`; }
  async function importJson(file) {
    if (!file) return;
    const data = JSON.parse(await file.text());
    const { body } = await api("/api/import/json", { method: "POST", body: data });
    toast(`v${body.version} · ${T("kpi_hard")}: ${body.validation.hard_violations}`); await load();
  }

  // ---------------------------------------------------------------- engine
  async function generate() {
    if (S.busy) return;
    S.busy = true; render();
    try {
      const { body } = await api("/api/solve", { method: "POST", body: { time_limit: 30, keep_current: true } });
      S.proposal = body; S.preview = null;
    } catch (e) { toast(T("error") + ": " + e.message); }
    S.busy = false; render();
  }
  function togglePreview() { S.preview = S.preview ? null : S.proposal.placements; if (S.view !== "timetable" && S.view !== "overview") S.view = "timetable"; render(); }
  async function acceptProposal() {
    try { await api(`/api/proposals/${S.proposal.proposal_id}/accept`, { method: "POST" }); toast(T("data_saved")); }
    catch (e) { toast(T("error") + ": " + e.message); }
    S.proposal = null; S.preview = null; await load();
  }
  function discardProposal() { S.proposal = null; S.preview = null; render(); }

  // ---------------------------------------------------------------- assistant
  function renderAssistantShell() {
    document.getElementById("as-title").textContent = T("assistant");
    document.getElementById("as-mode").innerHTML = S.llm ? `<span class="badge ai">${T("mode_claude")}</span>` : `<span class="badge mock">${T("mode_rules")}</span>`;
    document.getElementById("as-input").placeholder = T("ask_placeholder");
    const ex = ["ex1", "ex2", "ex3", "ex4", "ex5", "ex6"].map((k) => `<button onclick="App.ask(${q(T(k))})">${esc(T(k))}</button>`).join("");
    document.getElementById("as-body").innerHTML = `<p class="small muted">${T("assistant_intro")}</p><div class="examples">${ex}</div>` +
      S.chat.map((m) => `<div class="msg ${m.role}">${m.html}</div>`).join("");
    const b = document.getElementById("as-body"); b.scrollTop = b.scrollHeight;
  }
  function toggleAssistant() { document.getElementById("assistant").classList.toggle("open"); }
  function describeArgs(a) {
    const rows = [];
    if (a.teacher_id) rows.push([T("teacher"), `${a.teacher_id} ${teacherName(a.teacher_id)}`]);
    if (a.section_id) rows.push([T("section"), a.section_id]);
    if (a.subject_id) rows.push([T("subject"), subjName(a.subject_id)]);
    if (a.subject_ids) rows.push([T("subjects"), a.subject_ids.map(subjName).join(", ")]);
    if (a.from_day) rows.push(["←", DN(a.from_day)]);
    if (a.days && a.days.length) rows.push([T("days"), a.days.map(DN).join(", ")]);
    if (a.day) rows.push([T("day"), DN(a.day)]);
    if (a.periods && a.periods.length) rows.push([T("periods"), a.periods.join(", ")]);
    if (a.period) rows.push([T("period"), a.period]);
    if (a.date) rows.push([T("date"), a.date]);
    if (a.hard !== undefined) rows.push([T("type"), a.hard ? `<span class="badge hard">${T("hard")}</span>` : `<span class="badge soft">${T("soft")}</span>`]);
    return rows.map(([k, v]) => `<dt>${k}</dt><dd>${typeof v === "string" && !v.startsWith("<") ? esc(v) : v}</dd>`).join("");
  }
  async function ask(text) {
    const inp = document.getElementById("as-input");
    text = text || inp.value.trim(); if (!text) return; inp.value = "";
    document.getElementById("assistant").classList.add("open");
    S.chat.push({ role: "user", html: esc(text) }); renderAssistantShell();
    const { body } = await api("/api/assistant", { method: "POST", body: { text } });
    const mode = body.mode.startsWith("claude") ? `<span class="badge ai">${T("mode_claude")}</span>` : `<span class="badge mock">${T("mode_rules")}</span>`;
    let html = `${mode} <b>${T("interpreted")}:</b> ${T("intent_" + body.intent)}<div class="op-card"><dl>${describeArgs(body.args || {})}</dl>`;
    if (body.problems.length || body.intent === "unknown") {
      html += `<p class="small">${T("needs_clarification")} ${esc(body.clarification || body.problems.join(", "))}</p></div>`;
    } else if (body.intent === "show_teacher" || body.intent === "show_section") {
      openTT(body.intent === "show_teacher" ? "teacher" : "section", body.args.teacher_id || body.args.section_id);
      html += "</div>";
    } else {
      const k = S.chat.length;
      App._ops = App._ops || {}; App._ops[k] = { ...body, text };
      html += `<button class="primary small" onclick="App.applyOp(${k})">${T("confirm")}</button> <button class="small" onclick="this.parentNode.remove()">${T("cancel")}</button></div>`;
    }
    S.chat.push({ role: "bot", html }); renderAssistantShell();
  }
  async function applyOp(k) {
    const op = App._ops[k];
    const { status, body } = await api("/api/assistant/apply", { method: "POST", body: { intent: op.intent, args: op.args, text: op.text } });
    let html;
    if (op.intent === "generate") { S.proposal = body; html = `${T("proposal")}: ${T("st_" + body.status)}`; }
    else if (op.intent === "explain") {
      const s = body.validation; const fatal = body.diagnostics.fatal;
      html = `${T("kpi_hard")}: <b>${s.hard_violations}</b> · ${T("kpi_soft")}: ${s.soft_violations}` + (fatal.length ? `<ul>${fatal.map((f) => `<li>${esc(M(f.message))}</li>`).join("")}</ul>` : "");
    } else if (status === 409) html = `<b>${T("move_conflicts")}</b><ul>${(body.conflicts || []).map((c) => `<li>${esc(M(c.message))}</li>`).join("")}</ul>`;
    else html = `✓ ${T("applied")} (v${body.version ?? ""})`;
    if (op.intent === "absence") { S.subsDate = op.args.date; S.view = "subs"; }
    S.chat.push({ role: "bot", html }); await load();
  }

  // ---------------------------------------------------------------- modal
  function modal(title, body, buttons) {
    document.getElementById("modal-root").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">
      <header><h3>${esc(title)}</h3><button class="ghost" onclick="closeModal()">✕</button></header><div class="body">${body}</div>
      <footer>${buttons.map(([l, fn, cls]) => `<button class="${cls || ""}" onclick="${fn}">${l}</button>`).join("")}</footer></div></div>`;
  }
  window.closeModal = () => { document.getElementById("modal-root").innerHTML = ""; };

  // ---------------------------------------------------------------- navigation
  function go(v) { S.view = v; S.filter = ""; localStorage.setItem("view", v); render(); window.scrollTo(0, 0); }
  function openTT(mode, id) { S.ttMode = mode; S.ttId = id; go("timetable"); }

  window.App = {
    S, T, toast, go, openTT, generate, toggleAssistant, ask, applyOp,
    setLang: (l) => { S.lang = l; localStorage.setItem("lang", l); render(); },
    setTTMode: (m) => { S.ttMode = m; S.ttId = null; render(); },
    setOv: (m) => { S.ovMode = m; render(); }, setFilter: (f) => { S.filter = f; const pos = document.activeElement.selectionStart; render(); const i = document.querySelector(".toolbar input"); if (i) { i.focus(); i.setSelectionRange(pos, pos); } },
    setDataTab: (t) => { S.dataTab = t; S.filter = ""; render(); },
    setSubsDate: (d) => { S.subsDate = d; render(); },
    dragStart, dragEnd, dragOver, drop, proposeMove, lessonPanel, lock, unplace, focusOcc,
    editEntity, saveEntity, deleteEntity, availability, cycleAvail, saveAvail,
    editRule, renderRuleForm, saveRule, toggleRule, setSetting, diagnose,
    addAbsence, delAbsence, autoAssign, candidates, assignSub,
    versionDiff, restore, resetDemo, exportFile, importJson,
    togglePreview, acceptProposal, discardProposal,
  };
  load().catch((e) => { document.getElementById("content").innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; });
})();
