"""CP-SAT timetable engine.

Model: one boolean per (occurrence, day, start period, room) that passes the static hard
rules. Hard rules become constraints; preferences become a weighted objective with
priority tiers. Overlap is checked in real minutes, so teachers shared between bells
(primaria / media / liceo) are handled correctly even if period numbers differ.
"""
from __future__ import annotations

import copy
import time
from collections import defaultdict

from ortools.sat.python import cp_model

from .diagnostics import precheck
from .model import Ctx, active_constraints, build_ctx, is_hard, weight
from .rules import static_issues
from .validator import validate

STATUS = {
    cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE", cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID", cp_model.UNKNOWN: "UNKNOWN",
}


def build_model(ctx: Ctx, data: dict, cand: dict, skip: set = frozenset(), objective: bool = True,
                stability_weight: int = 0):
    m = cp_model.CpModel()
    x = {}
    current = {p["occ_id"]: p for p in data.get("placements", [])}
    locked = {o for o, p in current.items() if p.get("locked") and "locks" not in skip and f"lock:{o}" not in skip}
    terms = []  # (coef, var)

    for o, lst in cand.items():
        occ = ctx.occurrences[o]
        if o in locked:
            p = current[o]
            lst = [c for c in lst if c[0] == p["day"] and c[1] == int(p["period"]) and
                   (p.get("room_id") is None or c[2] == p.get("room_id"))]
        vs = []
        for (day, sp, room, s, e) in lst:
            v = m.NewBoolVar(f"x|{o}|{day}|{sp}|{room}")
            x[(o, day, sp, room)] = (v, s, e)
            vs.append(v)
            if objective:
                pen = sum(i["weight"] * i.get("count", 1)
                          for i in static_issues(ctx, occ, day, sp, room, include_soft=True) if not i["hard"])
                if pen:
                    terms.append((pen, v))
                cur = current.get(o)
                if stability_weight and cur and not (cur["day"] == day and int(cur["period"]) == sp):
                    terms.append((stability_weight, v))
        m.AddExactlyOne(vs) if vs else m.AddBoolOr([])  # empty => infeasible, caught by precheck

    # resource no-overlap in real minutes: at each candidate start time, at most one active
    by_res_day = defaultdict(list)
    for (o, day, sp, room), (v, s, e) in x.items():
        for key in ctx.resources(ctx.occurrences[o], room):
            by_res_day[(key, day)].append((s, e, v))
    for _, lst in by_res_day.items():
        if len(lst) < 2:
            continue
        for t in sorted({s for s, _, _ in lst}):
            active = [v for s, e, v in lst if s <= t < e]
            if len(active) > 1:
                m.AddAtMostOne(active)

    # teacher daily / weekly caps and day usage
    t_day = defaultdict(list)
    for (o, day, sp, room), (v, s, e) in x.items():
        occ = ctx.occurrences[o]
        for t in occ.teacher_ids:
            t_day[(t, day)].append((occ.duration, v))
    day_used = {}

    def used(t, day):
        if (t, day) not in day_used:
            u = m.NewBoolVar(f"used|{t}|{day}")
            for _, v in t_day.get((t, day), []):
                m.AddImplication(v, u)
            day_used[(t, day)] = u
        return day_used[(t, day)]

    for (t, day), lst in t_day.items():
        mx = ctx.teachers[t].get("max_day")
        if mx and f"maxday:{t}" not in skip:
            m.Add(sum(d * v for d, v in lst) <= mx)

    # distinct days for the blocks of one lesson
    if data.get("settings", {}).get("spread_lessons", True) and "spread" not in skip:
        by_lesson_day = defaultdict(list)
        n_occ = defaultdict(int)
        for o, occ in ctx.occurrences.items():
            n_occ[occ.lesson_id] += 1
        for (o, day, sp, room), (v, s, e) in x.items():
            by_lesson_day[(ctx.occurrences[o].lesson_id, day)].append(v)
        for (lesson, day), vs in by_lesson_day.items():
            if n_occ[lesson] <= len(ctx.days) and len(vs) > 1:
                m.AddAtMostOne(vs)

    for c in active_constraints(data):
        if c["id"] in skip:
            continue
        if c["type"] == "teacher_max_days":
            t = c.get("teacher_id")
            if t not in ctx.teachers:
                continue
            us = [used(t, d) for d in ctx.days if (t, d) in t_day]
            if is_hard(c):
                m.Add(sum(us) <= int(c.get("max", 5)))
            elif objective:
                excess = m.NewIntVar(0, len(ctx.days), f"excess|{c['id']}")
                m.Add(excess >= sum(us) - int(c.get("max", 5)))
                terms.append((weight(c), excess))
        elif c["type"] == "teacher_gaps" and objective:
            for t in c.get("teacher_ids") or list(ctx.teachers):
                b = ctx.teacher_bell(t)
                if not b:
                    continue
                n = len(ctx.periods(b))
                for d in ctx.days:
                    cover = defaultdict(list)
                    for (o, day, sp, room), (v, s0, e0) in x.items():
                        if day == d and t in ctx.occurrences[o].teacher_ids:
                            for k in ctx.periods_covered(b, s0, e0):
                                cover[k].append(v)
                    if len(cover) < 2:
                        continue
                    busy = []
                    for k in range(n):
                        if cover.get(k):
                            bk = m.NewBoolVar("")
                            m.AddMaxEquality(bk, cover[k])
                            busy.append(bk)
                        else:
                            busy.append(None)
                    for k in range(1, n - 1):
                        left = [v for v in busy[:k] if v is not None]
                        right = [v for v in busy[k + 1:] if v is not None]
                        if not left or not right:
                            continue
                        before, after = m.NewBoolVar(""), m.NewBoolVar("")
                        m.AddMaxEquality(before, left)
                        m.AddMaxEquality(after, right)
                        hole = m.NewBoolVar(f"hole|{t}|{d}|{k}")
                        if busy[k] is None:
                            m.Add(hole >= before + after - 1)
                        else:
                            m.Add(hole >= before + after - busy[k] - 1)
                        terms.append((weight(c), hole))
        elif c["type"] == "teacher_compact_days" and objective:
            for t in c.get("teacher_ids") or list(ctx.teachers):
                for d in ctx.days:
                    if (t, d) in t_day:
                        terms.append((weight(c), used(t, d)))

    if objective and terms:
        m.Minimize(sum(coef * v for coef, v in terms))
    return m, x


def solve(data: dict, time_limit: float = 20.0, stability_weight: int = 0, workers: int = 8,
          explain: bool = True, seed: int = 7) -> dict:
    t0 = time.time()
    ctx = build_ctx(data)
    pre = precheck(data, ctx)
    base = {"diagnostics": {"fatal": pre["fatal"], "warnings": pre["warnings"]}}
    if not pre["ok"]:
        return {**base, "status": "INFEASIBLE_PRECHECK", "placements": None, "wall_time": time.time() - t0,
                "explanation_kind": "arithmetic"}

    m, x = build_model(ctx, data, pre["candidates"], stability_weight=stability_weight)
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = float(time_limit)
    s.parameters.num_search_workers = workers
    s.parameters.random_seed = seed
    st = s.Solve(m)
    status = STATUS.get(st, "UNKNOWN")
    out = {**base, "status": status, "wall_time": round(time.time() - t0, 2),
           "objective": s.ObjectiveValue() if status in ("OPTIMAL", "FEASIBLE") else None,
           "variables": len(x)}
    if status in ("OPTIMAL", "FEASIBLE"):
        current = {p["occ_id"]: p for p in data.get("placements", [])}
        placements = []
        for (o, day, sp, room), (v, _s, _e) in x.items():
            if s.Value(v):
                placements.append({"occ_id": o, "day": day, "period": sp, "room_id": room,
                                   "locked": bool(current.get(o, {}).get("locked"))})
        placements.sort(key=lambda p: p["occ_id"])
        candidate = copy.deepcopy(data)
        candidate["placements"] = placements
        out["placements"] = placements
        out["validation"] = validate(candidate)  # independent re-check
        out["validation"].pop("teacher_load", None)
    else:
        out["placements"] = None
        if status == "INFEASIBLE" and explain:
            out["conflict_groups"] = explain_infeasibility(ctx, data, pre["candidates"])
            out["explanation_kind"] = "relaxation"
    return out


def relaxable_groups(ctx: Ctx, data: dict) -> list:
    groups = [c["id"] for c in active_constraints(data) if is_hard(c)]
    groups += [f"maxday:{t}" for t, v in ctx.teachers.items() if v.get("max_day")]
    groups += [f"lock:{p['occ_id']}" for p in data.get("placements", []) if p.get("locked")]
    groups.append("spread")
    return groups


def explain_infeasibility(ctx: Ctx, data: dict, cand: dict, per_try: float = 3.0, max_tries: int = 30) -> list:
    """Deletion test: which single rule, if removed, makes the model feasible? This is a
    sufficient explanation, not a proven minimal conflict set."""
    found = []
    for g in relaxable_groups(ctx, data)[:max_tries]:
        m, _ = build_model(ctx, data, cand, skip={g}, objective=False)
        s = cp_model.CpSolver()
        s.parameters.max_time_in_seconds = per_try
        s.parameters.num_search_workers = 8
        if s.Solve(m) in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            found.append(g)
    return found


def diff_placements(before: list, after: list) -> list:
    b = {p["occ_id"]: p for p in before or []}
    a = {p["occ_id"]: p for p in after or []}
    changes = []
    for o in sorted(set(a) | set(b)):
        pb, pa = b.get(o), a.get(o)
        key = lambda p: (p["day"], int(p["period"]), p.get("room_id")) if p else None
        if key(pb) != key(pa):
            changes.append({"occ_id": o, "before": pb and {k: pb[k] for k in ("day", "period", "room_id")},
                            "after": pa and {k: pa[k] for k in ("day", "period", "room_id")}})
    return changes
