"""Pre-solve diagnostics: cheap arithmetic checks that explain impossibility in words a
coordinator can act on, before (and independently of) the solver."""
from __future__ import annotations

from collections import defaultdict

from .i18n import msg
from .model import Ctx, active_constraints, build_ctx, is_hard
from .rules import candidates, static_issues
from .validator import overlaps


def issue(code: str, entities: list, options: list | None = None, **params) -> dict:
    return {"code": code, "entities": entities, "message": msg(code, **params), "options": options or []}


def precheck(data: dict, ctx: Ctx | None = None) -> dict:
    ctx = ctx or build_ctx(data)
    fatal, warnings = [], []
    for e in ctx.errors:
        fatal.append(issue(e["code"], [e.get("entity")], **e))

    cand = {o: candidates(ctx, occ) for o, occ in ctx.occurrences.items()}
    for o, lst in cand.items():
        if not lst:
            occ = ctx.occurrences[o]
            fatal.append(issue("no_candidates", [o, *occ.teacher_ids], occ=o, subject=occ.subject_id,
                               section=occ.section_id))

    # teacher arithmetic: demand vs slots allowed by hard rules, weekly and daily caps
    demand = defaultdict(int)
    for occ in ctx.occurrences.values():
        for t in occ.teacher_ids:
            demand[t] += occ.duration
    for t_id, need in demand.items():
        t = ctx.teachers[t_id]
        slot_sets = defaultdict(set)
        for o, lst in cand.items():
            occ = ctx.occurrences[o]
            if t_id not in occ.teacher_ids:
                continue
            for day, sp, _r, _s, _e in lst:
                for k in range(occ.duration):
                    slot_sets[occ.bell_id].add((day, sp + k))
        capacity = max((len(s) for s in slot_sets.values()), default=0)
        if need > capacity:
            rules = [c["id"] for c in active_constraints(data) if c.get("teacher_id") == t_id and is_hard(c)]
            fatal.append(issue("teacher_capacity", [t_id, *rules], teacher=t_id, demand=need, capacity=capacity,
                               options=[{"kind": "relax_rule", "rule_ids": rules},
                                        {"kind": "add_teacher", "teacher_id": t_id}]))
        if t.get("max_week") and need > t["max_week"]:
            fatal.append(issue("teacher_week_cap", [t_id], teacher=t_id, demand=need, max=t["max_week"]))
        days_ok = {d for s in slot_sets.values() for d, _ in s}
        if t.get("max_day") and need > t["max_day"] * max(len(days_ok), 0) and need <= capacity:
            fatal.append(issue("teacher_day_cap", [t_id], teacher=t_id, demand=need, days=len(days_ok),
                               max=t["max_day"]))

    # section arithmetic (whole-section cohorts only; groups may run in parallel)
    sec_demand = defaultdict(int)
    for occ in ctx.occurrences.values():
        if not occ.group_id:
            sec_demand[occ.section_id] += occ.duration
    for s_id, need in sec_demand.items():
        cap = len(ctx.periods(ctx.sections[s_id]["bell_id"])) * len(ctx.days)
        if need > cap:
            fatal.append(issue("section_capacity", [s_id], section=s_id, demand=need, capacity=cap))

    # rooms that are the only option for some lessons
    room_demand = defaultdict(int)
    room_bells = defaultdict(set)
    for occ in ctx.occurrences.values():
        if len(occ.room_ids) == 1:
            room_demand[occ.room_ids[0]] += occ.duration
            room_bells[occ.room_ids[0]].add(occ.bell_id)
    for r, need in room_demand.items():
        cap = max(len(ctx.periods(b)) for b in room_bells[r]) * len(ctx.days)
        if need > cap:
            fatal.append(issue("room_capacity", [r], room=r, demand=need, capacity=cap))

    # blocks of a lesson must go on distinct days
    if data.get("settings", {}).get("spread_lessons", True):
        by_lesson = defaultdict(list)
        for o, occ in ctx.occurrences.items():
            by_lesson[occ.lesson_id].append(o)
        for lesson_id, occs in by_lesson.items():
            if len(occs) > len(ctx.days):
                continue
            days = {d for o in occs for d, *_ in cand[o]}
            if cand[occs[0]] and len(days) < len(occs):
                fatal.append(issue("spread_capacity", [lesson_id], lesson=lesson_id, n=len(occs), days=len(days)))

    # locked placements: must be valid and must not collide with each other
    locked = [p for p in data.get("placements", []) if p.get("locked") and p["occ_id"] in ctx.occurrences]
    items = []
    for p in locked:
        occ = ctx.occurrences[p["occ_id"]]
        hard = [i for i in static_issues(ctx, occ, p["day"], int(p["period"]), p.get("room_id")) if i["hard"]]
        if hard:
            fatal.append(issue("lock_invalid", [occ.id], occ=occ.id))
            continue
        win = ctx.occ_window(occ, int(p["period"]))
        items.append((occ, p.get("room_id"), p["day"], win[0], win[1]))
    for key, day, _s, _e, occs in overlaps(ctx, items):
        fatal.append(issue("lock_conflict", occs, occs=" / ".join(occs), res=key[1], day=day))

    return {"ok": not fatal, "fatal": fatal, "warnings": warnings, "candidates": cand}
