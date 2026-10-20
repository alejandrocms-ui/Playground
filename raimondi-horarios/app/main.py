"""HTTP API + static front-end. Run: uvicorn app.main:app --reload"""
from __future__ import annotations

import copy
import hashlib
import hmac
import json
import os
import uuid
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from . import assistant, exports, moves, substitutions
from .diagnostics import precheck
from .model import CONSTRAINT_TYPES, ENTITY_KINDS, build_ctx
from .solver import diff_placements, solve
from .store import Store
from .validator import validate

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("RAIMONDI_DATA", ROOT / "data"))
SEEDS = {"school": DATA_DIR / "seed_school.json", "fixture": DATA_DIR / "seed_fixture.json",
         "multibell": DATA_DIR / "seed_multibell.json",
         # real school data lives outside git (data/private/ is ignored); see AGENTS.md
         "raimondi": Path(os.environ.get("RAIMONDI_PRIVATE_SEED", DATA_DIR / "private" / "seed_raimondi.json"))}
SECRET = os.environ.get("RAIMONDI_SECRET", "cambia-esta-clave-en-produccion").encode()

app = FastAPI(title="Raimondi Horarios MVP", version="0.1.0")
store = Store(os.environ.get("RAIMONDI_DB", DATA_DIR / "raimondi.db"))
PROPOSALS: dict = {}


def load_seed(name: str) -> dict:
    if name not in SEEDS or not SEEDS[name].exists():
        raise HTTPException(404, f"seed {name} not found")
    return json.loads(SEEDS[name].read_text())


def current() -> tuple[int, dict]:
    n, data = store.current()
    if data is None:
        seed = next(k for k in ("raimondi", "school", "fixture") if SEEDS[k].exists())
        data = load_seed(seed)
        n = store.commit(data, f"Carga inicial ({seed})", "sistema")
    return n, data


def commit(data: dict, message: str) -> dict:
    n = store.commit(data, message)
    return {"version": n}


def teacher_token(teacher_id: str) -> str:
    return hmac.new(SECRET, teacher_id.encode(), hashlib.sha256).hexdigest()[:16]


# ---------------------------------------------------------------- state
@app.get("/api/state")
def get_state():
    n, data = current()
    v = validate(data)
    return {"version": n, "data": data, "validation": v,
            "occurrences": {o: occ.__dict__ for o, occ in build_ctx(data).occurrences.items()},
            "constraint_types": CONSTRAINT_TYPES, "llm": assistant.claude_available(),
            "seeds": [k for k, p in SEEDS.items() if p.exists()]}


@app.post("/api/reset")
def reset(seed: str = Body("school", embed=True)):
    data = load_seed(seed)
    store.reset()
    PROPOSALS.clear()
    return commit(data, f"Reinicio con datos de ejemplo ({seed})")


# ---------------------------------------------------------------- entities (generic CRUD)
@app.put("/api/entities/{kind}/{item_id}")
def upsert(kind: str, item_id: str, item: dict = Body(...)):
    if kind not in ENTITY_KINDS:
        raise HTTPException(400, "unknown kind")
    _, data = current()
    item["id"] = item_id
    lst = data.setdefault(kind, [])
    idx = next((i for i, x in enumerate(lst) if x["id"] == item_id), None)
    if idx is None:
        lst.append(item)
        action = "Alta"
    else:
        lst[idx] = item
        action = "Cambio"
    if kind == "lessons":  # occurrences may have changed: drop placements that no longer exist
        occs = set(build_ctx(data).occurrences)
        data["placements"] = [p for p in data["placements"] if p["occ_id"] in occs]
    return commit(data, f"{action} {kind[:-1]} {item_id}")


@app.delete("/api/entities/{kind}/{item_id}")
def delete(kind: str, item_id: str):
    if kind not in ENTITY_KINDS:
        raise HTTPException(400, "unknown kind")
    _, data = current()
    data[kind] = [x for x in data.get(kind, []) if x["id"] != item_id]
    occs = set(build_ctx(data).occurrences)
    data["placements"] = [p for p in data["placements"] if p["occ_id"] in occs]
    return commit(data, f"Baja {kind[:-1]} {item_id}")


@app.put("/api/settings")
def settings(patch: dict = Body(...)):
    _, data = current()
    data.setdefault("settings", {}).update(patch)
    return commit(data, "Cambio de configuración")


# ---------------------------------------------------------------- timetable editing
@app.get("/api/slots/{occ_id}")
def slots(occ_id: str):
    _, data = current()
    if occ_id not in build_ctx(data).occurrences:
        raise HTTPException(404)
    return moves.slot_map(data, occ_id)


@app.post("/api/move")
def move(occ_id: str = Body(...), day: str = Body(...), period: int = Body(...), room_id: str | None = Body(None),
         dry_run: bool = Body(False)):
    _, data = current()
    r = moves.apply_move(data, occ_id, day, period, room_id)
    if not r["ok"] or dry_run:
        return JSONResponse(r, status_code=200 if r["ok"] else 409)
    return {**r, **commit(data, f"Mover {occ_id} a {day} hora {period}")}


@app.post("/api/unplace")
def unplace(occ_id: str = Body(..., embed=True)):
    _, data = current()
    data["placements"] = [p for p in data["placements"] if p["occ_id"] != occ_id]
    return commit(data, f"Retirar {occ_id} del horario")


@app.post("/api/lock")
def lock(occ_id: str = Body(...), locked: bool = Body(True)):
    _, data = current()
    for p in data["placements"]:
        if p["occ_id"] == occ_id:
            p["locked"] = locked
    return commit(data, f"{'Fijar' if locked else 'Liberar'} {occ_id}")


# ---------------------------------------------------------------- solver & proposals
@app.get("/api/diagnose")
def diagnose():
    _, data = current()
    pre = precheck(data)
    pre.pop("candidates")
    return pre


@app.post("/api/solve")
def run_solver(time_limit: float = Body(20, embed=True), keep_current: bool = Body(True, embed=True),
               stability_weight: int = Body(3, embed=True)):
    n, data = current()
    res = solve(data, time_limit=min(time_limit, 300), stability_weight=stability_weight if keep_current else 0)
    if res["placements"] is not None:
        pid = uuid.uuid4().hex[:8]
        PROPOSALS[pid] = {"base_version": n, "placements": res["placements"]}
        res["proposal_id"] = pid
        res["diff"] = diff_placements(data["placements"], res["placements"])
        res["current_validation"] = validate(data)["summary"]
    return res


@app.post("/api/propose-move")
def propose_move(occ_id: str = Body(...), day: str = Body(...), period: int = Body(...), time_limit: float = Body(15)):
    """A direct move that collides becomes a multi-move proposal: pin the requested block at
    the target and let the engine re-arrange as little as possible around it."""
    n, data = current()
    trial = copy.deepcopy(data)
    p = next((p for p in trial["placements"] if p["occ_id"] == occ_id), None)
    was_locked = bool(p and p.get("locked"))
    occ = build_ctx(trial).occurrences[occ_id]
    room = (p or {}).get("room_id") if (p or {}).get("room_id") in occ.room_ids else (occ.room_ids or [None])[0]
    trial["placements"] = [x for x in trial["placements"] if x["occ_id"] != occ_id]
    trial["placements"].append({"occ_id": occ_id, "day": day, "period": period, "room_id": room, "locked": True})
    res = solve(trial, time_limit=time_limit, stability_weight=20)
    if res["placements"] is not None:
        for x in res["placements"]:
            if x["occ_id"] == occ_id:
                x["locked"] = was_locked
        pid = uuid.uuid4().hex[:8]
        PROPOSALS[pid] = {"base_version": n, "placements": res["placements"]}
        res["proposal_id"] = pid
        res["diff"] = diff_placements(data["placements"], res["placements"])
        res["current_validation"] = validate(data)["summary"]
    return res


@app.post("/api/proposals/{pid}/accept")
def accept(pid: str):
    prop = PROPOSALS.pop(pid, None)
    if not prop:
        raise HTTPException(404, "proposal expired")
    n, data = current()
    if n != prop["base_version"]:
        raise HTTPException(409, "el horario cambió desde que se generó la propuesta")
    data["placements"] = prop["placements"]
    v = validate(data)
    if v["summary"]["hard_violations"]:
        raise HTTPException(409, "la propuesta no supera la validación independiente")
    return commit(data, "Aceptar propuesta del motor")


# ---------------------------------------------------------------- validation & reports
@app.get("/api/validate")
def get_validation():
    _, data = current()
    return validate(data)


@app.get("/api/reports/loads")
def loads():
    _, data = current()
    ctx = build_ctx(data)
    v = validate(data, ctx)
    by_area, by_subject, by_section = {}, {}, {}
    for occ in ctx.occurrences.values():
        subj = ctx.subjects.get(occ.subject_id, {})
        a = subj.get("area_id", "—")
        by_area.setdefault(a, {"periods": 0, "teachers": set(), "subjects": set()})
        by_area[a]["periods"] += occ.duration
        by_area[a]["teachers"].update(occ.teacher_ids)
        by_area[a]["subjects"].add(occ.subject_id)
        by_subject.setdefault(occ.subject_id, {"periods": 0, "teachers": set(), "sections": set()})
        by_subject[occ.subject_id]["periods"] += occ.duration
        by_subject[occ.subject_id]["teachers"].update(occ.teacher_ids)
        by_subject[occ.subject_id]["sections"].add(occ.section_id)
        sec = by_section.setdefault(occ.section_id, {"periods": 0, "slots": 0, "by_area": {}})
        sec["periods"] += occ.duration if not occ.group_id else 0
        sec["by_area"][a] = sec["by_area"].get(a, 0) + occ.duration
    for s_id, s in by_section.items():
        s["slots"] = len(ctx.periods(ctx.sections[s_id]["bell_id"])) * len(ctx.days)
    fix = lambda d: {k: {kk: sorted(vv) if isinstance(vv, set) else vv for kk, vv in v_.items()} for k, v_ in d.items()}
    return {"teachers": v["teacher_load"], "areas": fix(by_area), "subjects": fix(by_subject), "sections": by_section}


# ---------------------------------------------------------------- versions
@app.get("/api/versions")
def versions():
    return store.history()


@app.get("/api/versions/{n}/diff")
def version_diff(n: int, against: int | None = None):
    cur_n, cur = current()
    other = store.get(n)
    base = store.get(against) if against else cur
    if other is None or base is None:
        raise HTTPException(404)
    rules_b = {c["id"]: c for c in other.get("constraints", [])}
    rules_a = {c["id"]: c for c in base.get("constraints", [])}
    return {"placements": diff_placements(other["placements"], base["placements"]),
            "rules_added": [r for r in rules_a if r not in rules_b],
            "rules_removed": [r for r in rules_b if r not in rules_a],
            "rules_changed": [r for r in rules_a if r in rules_b and rules_a[r] != rules_b[r]]}


@app.post("/api/versions/{n}/restore")
def restore(n: int):
    data = store.get(n)
    if data is None:
        raise HTTPException(404)
    return commit(data, f"Restaurar versión {n}")


# ---------------------------------------------------------------- substitutions
@app.get("/api/substitutions")
def subs_day(date: str):
    _, data = current()
    return {"date": date, "day": substitutions.weekday(date),
            "absences": [a for a in data.get("absences", []) if a["date"] == date],
            "affected": substitutions.affected(data, date)}


@app.post("/api/absences")
def add_absence(date: str = Body(...), teacher_id: str = Body(...), start: int | None = Body(None),
                end: int | None = Body(None), category: str = Body("otro")):
    _, data = current()
    if teacher_id not in build_ctx(data).teachers:
        raise HTTPException(404, "teacher")
    data.setdefault("absences", []).append({"id": uuid.uuid4().hex[:8], "date": date, "teacher_id": teacher_id,
                                            "start": start, "end": end, "category": category})
    return commit(data, f"Ausencia {teacher_id} {date}")


@app.delete("/api/absences/{aid}")
def del_absence(aid: str):
    _, data = current()
    a = next((a for a in data.get("absences", []) if a["id"] == aid), None)
    data["absences"] = [x for x in data.get("absences", []) if x["id"] != aid]
    if a:
        aff = {r["occ_id"] for r in substitutions.affected(data, a["date"])}
        data["substitutions"] = [s for s in data.get("substitutions", [])
                                 if s["date"] != a["date"] or s["occ_id"] in aff]
    return commit(data, f"Eliminar ausencia {aid}")


@app.get("/api/substitutions/candidates")
def sub_candidates(date: str, occ_id: str):
    _, data = current()
    return substitutions.candidates_for(data, date, occ_id)


@app.post("/api/substitutions")
def sub_assign(date: str = Body(...), occ_id: str = Body(...), sub_teacher_id: str | None = Body(None),
               kind: str = Body("cover"), note: str = Body("")):
    _, data = current()
    try:
        rec = substitutions.assign(data, date, occ_id, sub_teacher_id, kind, note)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"substitution": rec, **commit(data, f"Reemplazo {occ_id} {date} → {sub_teacher_id or kind}")}


@app.post("/api/substitutions/auto")
def sub_auto(date: str = Body(..., embed=True)):
    _, data = current()
    done = substitutions.auto_assign(data, date)
    return {"assigned": done, **commit(data, f"Asignación automática de reemplazos {date}")}


# ---------------------------------------------------------------- exports / imports / publishing
@app.get("/api/export/json")
def export_json():
    n, data = current()
    return Response(json.dumps(data, ensure_ascii=False, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="raimondi_v{n}.json"'})


@app.get("/api/export/csv")
def export_csv():
    n, data = current()
    return Response(exports.placements_csv(data), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="horario_v{n}.csv"'})


@app.post("/api/import/json")
def import_json(data: dict = Body(...), dry_run: bool = Query(False)):
    for k in ("teachers", "sections", "subjects", "lessons", "bells"):
        if k not in data:
            raise HTTPException(400, f"missing {k}")
    data.setdefault("placements", [])
    v = validate(data)
    if dry_run:
        return {"validation": v["summary"]}
    return {"validation": v["summary"], **commit(data, "Importación JSON")}


@app.post("/api/import/csv")
def import_csv(text: str = Body(..., embed=True), dry_run: bool = Query(False)):
    _, data = current()
    data = copy.deepcopy(data)
    data["placements"] = exports.parse_placements_csv(text)
    v = validate(data)
    if dry_run or v["summary"]["hard_violations"]:
        return {"applied": False, "validation": v["summary"], "hard": v["hard"][:20]}
    return {"applied": True, "validation": v["summary"], **commit(data, "Importación CSV de colocaciones")}


@app.get("/api/publish")
def publish():
    _, data = current()
    return [{"teacher_id": t["id"], "name": t.get("name"), "email": t.get("email"),
             "link": f"/t/{t['id']}/{teacher_token(t['id'])}"} for t in data["teachers"]]


@app.get("/api/teacher/{teacher_id}/{token}")
def teacher_data(teacher_id: str, token: str):
    if not hmac.compare_digest(token, teacher_token(teacher_id)):
        raise HTTPException(403)
    n, data = current()
    ctx = build_ctx(data)
    if teacher_id not in ctx.teachers:
        raise HTTPException(404)
    mine = [p for p in data["placements"] if p["occ_id"] in ctx.occurrences
            and teacher_id in ctx.occurrences[p["occ_id"]].teacher_ids]
    occ_ids = {p["occ_id"] for p in mine}
    covers = [s for s in data.get("substitutions", []) if s.get("sub_teacher_id") == teacher_id]
    for s in covers:
        occ_ids.add(s["occ_id"])
    occs = {o: ctx.occurrences[o].__dict__ for o in occ_ids if o in ctx.occurrences}
    return {"version": n, "teacher": ctx.teachers[teacher_id], "placements": mine, "occurrences": occs,
            "covers": covers, "cover_placements": [p for p in data["placements"] if p["occ_id"] in {c["occ_id"] for c in covers}],
            "bells": data["bells"], "sections": data["sections"], "subjects": data["subjects"],
            "rooms": data["rooms"], "days": data.get("days"), "meta": data.get("meta", {})}


@app.get("/api/teacher/{teacher_id}/{token}/ics")
def teacher_ics(teacher_id: str, token: str, lang: str = "es"):
    if not hmac.compare_digest(token, teacher_token(teacher_id)):
        raise HTTPException(403)
    _, data = current()
    return PlainTextResponse(exports.teacher_ics(data, teacher_id, lang), media_type="text/calendar",
                             headers={"Content-Disposition": f'attachment; filename="horario_{teacher_id}.ics"'})


@app.get("/t/{teacher_id}/{token}")
def teacher_page(teacher_id: str, token: str):
    return FileResponse(ROOT / "static" / "teacher.html")


# ---------------------------------------------------------------- assistant
@app.post("/api/assistant")
def ask(text: str = Body(..., embed=True)):
    _, data = current()
    return assistant.interpret(text, data)


def resolve_occ(data: dict, section_id: str, subject_id: str, day: str | None):
    ctx = build_ctx(data)
    occs = [o for o in ctx.occurrences.values() if o.section_id == section_id and o.subject_id == subject_id]
    if not occs:
        return None
    if day:
        placed = {p["occ_id"]: p for p in data["placements"]}
        on_day = [o for o in occs if placed.get(o.id, {}).get("day") == day]
        if on_day:
            return on_day[0].id
    return occs[0].id


@app.post("/api/assistant/apply")
def apply_op(op: dict = Body(...)):
    """Apply a confirmed operation. Each branch maps to the same endpoints the UI uses."""
    intent, a = op["intent"], op.get("args", {})
    _, data = current()
    if intent == "teacher_allowed_days":
        rid = f"R-{a['teacher_id']}-DAYS"
        rule = {"id": rid, "type": "teacher_allowed_days", "teacher_id": a["teacher_id"], "days": a["days"],
                "hard": a.get("hard", True), "note": f"Asistente: {op.get('text', '')}"}
        return upsert("constraints", rid, rule)
    if intent == "teacher_unavailable":
        ctx = build_ctx(data)
        bell = next((ctx.sections[o.section_id]["bell_id"] for o in ctx.occurrences.values()
                     if a["teacher_id"] in o.teacher_ids), next(iter(ctx.bells)))
        periods = ctx.periods(bell)
        sel = a.get("periods") or [p["n"] for p in periods]
        slots = [{"day": d, "start": p["start"], "end": p["end"]} for d in (a.get("days") or ctx.days)
                 for p in periods if p["n"] in sel]
        rid = f"R-{a['teacher_id']}-UNAV-{uuid.uuid4().hex[:4]}"
        return upsert("constraints", rid, {"id": rid, "type": "teacher_unavailable", "teacher_id": a["teacher_id"],
                                           "slots": slots, "hard": a.get("hard", True),
                                           "note": f"Asistente: {op.get('text', '')}"})
    if intent == "preferred_periods":
        rid = "S-CORE-" + "-".join(a["subject_ids"])[:24]
        return upsert("constraints", rid, {"id": rid, "type": "preferred_periods", "subject_ids": a["subject_ids"],
                                           "periods": a.get("periods") or [2, 3, 4, 5], "hard": False, "priority": 2,
                                           "note": f"Asistente: {op.get('text', '')}"})
    if intent == "avoid_slot":
        rid = f"S-AVOID-{a['day']}-{a['period']}"
        return upsert("constraints", rid, {"id": rid, "type": "avoid_slot", "day": a["day"], "period": a["period"],
                                           "hard": False, "priority": 3})
    if intent == "move":
        occ_id = resolve_occ(data, a["section_id"], a["subject_id"], a.get("from_day"))
        if not occ_id:
            raise HTTPException(404, "lesson")
        return move(occ_id=occ_id, day=a["day"], period=int(a["period"]), room_id=None, dry_run=False)
    if intent == "lock":
        occ_id = resolve_occ(data, a["section_id"], a["subject_id"], a.get("day"))
        return lock(occ_id=occ_id, locked=True)
    if intent == "absence":
        return add_absence(date=a["date"], teacher_id=a["teacher_id"], start=None, end=None, category="otro")
    if intent == "generate":
        return run_solver(time_limit=20, keep_current=True, stability_weight=3)
    if intent == "explain":
        return {"validation": validate(data)["summary"], "diagnostics": diagnose()}
    raise HTTPException(400, "intent not applicable")


# ---------------------------------------------------------------- static
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")
