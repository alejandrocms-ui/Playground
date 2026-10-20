"""Independent validator. Recomputes every rule from the placements alone; it never
trusts the solver status or any text produced by the assistant."""
from __future__ import annotations

import math
from collections import defaultdict

from .i18n import msg
from .model import Ctx, active_constraints, build_ctx, is_hard, minutes_to_hhmm, weight
from .rules import static_issues


def finding(rid: str, severity: str, code: str, occ_ids=None, entities=None, penalty=0, **params) -> dict:
    return {
        "rule_id": rid, "severity": severity, "code": code,
        "occ_ids": occ_ids or [], "entities": entities or [],
        "penalty": penalty, "message": msg(code, **params),
    }


def placed_items(ctx: Ctx, data: dict):
    """Yield (placement, occ, start_min, end_min, period_numbers) for valid placements."""
    for p in data.get("placements", []):
        occ = ctx.occurrences.get(p["occ_id"])
        if occ is None:
            continue
        win = ctx.occ_window(occ, int(p["period"]))
        if win is None:
            continue
        yield p, occ, win[0], win[1], win[2]


def overlaps(ctx: Ctx, items: list) -> list:
    """items: [(occ, room, day, start, end)] -> list of (resource_key, day, start, end, [occ ids])"""
    by_res = defaultdict(list)
    for occ, room, day, s, e in items:
        for key in ctx.resources(occ, room):
            by_res[(key, day)].append((s, e, occ.id))
    out = []
    seen = set()
    for (key, day), lst in by_res.items():
        lst.sort()
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                if lst[j][0] >= lst[i][1]:
                    break
                pair = tuple(sorted((lst[i][2], lst[j][2])))
                k2 = (key[0], key[1], day, pair)
                if k2 in seen:
                    continue
                seen.add(k2)
                out.append((key, day, max(lst[i][0], lst[j][0]), min(lst[i][1], lst[j][1]), list(pair)))
    return out


def validate(data: dict, ctx: Ctx | None = None) -> dict:
    ctx = ctx or build_ctx(data)
    hard, soft, data_issues = [], [], []
    for e in ctx.errors:
        data_issues.append(finding("DATA", "data", e["code"], entities=[e.get("entity")], **e))

    counts = defaultdict(int)
    for p in data.get("placements", []):
        counts[p["occ_id"]] += 1
        if p["occ_id"] not in ctx.occurrences:
            hard.append(finding("H-COVERAGE", "hard", "unknown_occ", [p["occ_id"]], occ=p["occ_id"]))
    for occ_id in ctx.occurrences:
        if counts[occ_id] == 0:
            hard.append(finding("H-COVERAGE", "hard", "unplaced", [occ_id], occ=occ_id))
        elif counts[occ_id] > 1:
            hard.append(finding("H-COVERAGE", "hard", "duplicate", [occ_id], occ=occ_id))

    items = []
    teacher_day_load = defaultdict(int)
    teacher_days = defaultdict(set)
    lesson_days = defaultdict(list)
    for p in data.get("placements", []):
        occ = ctx.occurrences.get(p["occ_id"])
        if occ is None:
            continue
        day, sp, room = p["day"], int(p["period"]), p.get("room_id")
        win = ctx.occ_window(occ, sp)
        if win is None:
            hard.append(finding("H-BLOCK", "hard", "block_window", [occ.id], occ=occ.id, day=day, period=sp))
            continue
        items.append((occ, room, day, win[0], win[1]))
        for iss in static_issues(ctx, occ, day, sp, room, include_soft=True):
            rule = next((c for c in data.get("constraints", []) if c.get("id") == iss["rule_id"]), {})
            teacher = rule.get("teacher_id") or next(iter(occ.teacher_ids), "")
            params = dict(occ=occ.id, day=day, room=room, teacher=teacher, rule=iss["rule_id"],
                          days=rule.get("days", []), count=iss.get("count", 1))
            sev = "hard" if iss["hard"] else "soft"
            f = finding(iss["rule_id"], sev, iss["type"], [occ.id],
                        penalty=0 if iss["hard"] else iss.get("weight", 1) * iss.get("count", 1), **params)
            (hard if iss["hard"] else soft).append(f)
        for t in occ.teacher_ids:
            teacher_day_load[(t, day)] += occ.duration
            teacher_days[t].add(day)
        lesson_days[occ.lesson_id].append(day)

    for key, day, s, e, occs in overlaps(ctx, items):
        kind = key[0]
        res = key[1] if kind != "section" or key[2] == "*" else f"{key[1]}/{key[2]}"
        hard.append(finding("H-NO-OVERLAP", "hard", f"overlap_{kind}", occs, entities=[key[1]],
                            res=res, day=day, time=f"{minutes_to_hhmm(s)}–{minutes_to_hhmm(e)}",
                            occs=" / ".join(occs)))

    settings = data.get("settings", {})
    if settings.get("spread_lessons", True):
        for lesson_id, days in lesson_days.items():
            n_occ = sum(1 for o in ctx.occurrences.values() if o.lesson_id == lesson_id)
            if n_occ > len(ctx.days):
                continue
            for d in set(days):
                if days.count(d) > 1:
                    hard.append(finding("H-SPREAD", "hard", "spread", entities=[lesson_id], lesson=lesson_id, day=d))

    load = teacher_loads(ctx, data)
    for t_id, t in ctx.teachers.items():
        mx = t.get("max_day")
        if mx:
            for d in ctx.days:
                if teacher_day_load[(t_id, d)] > mx:
                    hard.append(finding("H-MAX-DAY", "hard", "teacher_max_day", entities=[t_id], teacher=t_id,
                                        day=d, actual=teacher_day_load[(t_id, d)], max=mx))
        mw = t.get("max_week")
        if mw and load[t_id]["assigned"] > mw:
            hard.append(finding("H-MAX-WEEK", "hard", "teacher_max_week", entities=[t_id], teacher=t_id,
                                actual=load[t_id]["assigned"], max=mw))

    for c in active_constraints(data):
        if c["type"] == "teacher_max_days":
            t_id = c.get("teacher_id")
            actual = len(teacher_days.get(t_id, ()))
            if actual > int(c.get("max", 5)):
                sev = "hard" if is_hard(c) else "soft"
                f = finding(c["id"], sev, "teacher_max_days", entities=[t_id], teacher=t_id, actual=actual,
                            max=c.get("max"), rule=c["id"],
                            penalty=0 if sev == "hard" else weight(c) * (actual - int(c.get("max", 5))))
                (hard if sev == "hard" else soft).append(f)
        elif c["type"] == "teacher_compact_days":
            targets = c.get("teacher_ids") or list(ctx.teachers)
            for t_id in targets:
                t = ctx.teachers.get(t_id)
                if not t or not load[t_id]["assigned"]:
                    continue
                min_days = math.ceil(load[t_id]["assigned"] / (t.get("max_day") or 8))
                actual = len(teacher_days.get(t_id, ()))
                if actual > min_days:
                    soft.append(finding(c["id"], "soft", "teacher_compact_days", entities=[t_id], teacher=t_id,
                                        actual=actual, min=min_days, rule=c["id"],
                                        penalty=weight(c) * (actual - min_days)))

    gap_rules = [c for c in active_constraints(data) if c["type"] == "teacher_gaps"]
    if gap_rules:
        holes = teacher_holes(ctx, data)
        for c in gap_rules:
            for t_id in c.get("teacher_ids") or list(ctx.teachers):
                for d, n in holes.get(t_id, {}).items():
                    if n:
                        soft.append(finding(c["id"], "soft", "teacher_gaps", entities=[t_id], teacher=t_id, day=d,
                                            count=n, rule=c["id"], penalty=weight(c) * n))

    soft_by_rule = defaultdict(lambda: {"count": 0, "penalty": 0})
    for f in soft:
        soft_by_rule[f["rule_id"]]["count"] += 1
        soft_by_rule[f["rule_id"]]["penalty"] += f["penalty"]

    total_periods = sum(o.duration for o in ctx.occurrences.values())
    placed_periods = sum(ctx.occurrences[p["occ_id"]].duration for p in data.get("placements", [])
                         if p["occ_id"] in ctx.occurrences)
    return {
        "valid": not hard and not data_issues,
        "hard": hard, "soft": soft, "data": data_issues,
        "summary": {
            "hard_violations": len(hard), "soft_violations": len(soft), "data_issues": len(data_issues),
            "soft_penalty": sum(f["penalty"] for f in soft),
            "soft_by_rule": dict(soft_by_rule),
            "occurrences": len(ctx.occurrences), "teaching_periods": total_periods,
            "placed_occurrences": sum(1 for o in ctx.occurrences if counts[o] >= 1),
            "placed_periods": placed_periods,
        },
        "teacher_load": load,
    }


def teacher_loads(ctx: Ctx, data: dict) -> dict:
    load = {t: {"assigned": 0, "placed": 0, "by_day": {d: 0 for d in ctx.days}, "gaps": 0,
                "sections": set(), "subjects": set()} for t in ctx.teachers}
    for occ in ctx.occurrences.values():
        for t in occ.teacher_ids:
            load[t]["assigned"] += occ.duration
            load[t]["sections"].update(occ.section_ids)
            load[t]["subjects"].add(occ.subject_id)
    for p, occ, s, e, _ in placed_items(ctx, data):
        for t in occ.teacher_ids:
            load[t]["placed"] += occ.duration
            load[t]["by_day"][p["day"]] = load[t]["by_day"].get(p["day"], 0) + occ.duration
    for t, by_day in teacher_holes(ctx, data).items():
        load[t]["gaps"] = sum(by_day.values())
    for t in load:
        load[t]["sections"] = sorted(load[t]["sections"])
        load[t]["subjects"] = sorted(load[t]["subjects"])
    return load


def teacher_holes(ctx: Ctx, data: dict) -> dict:
    """Empty periods between a teacher's first and last lesson of the day, measured on the
    teacher's reference bell (breaks are not periods, so they never count)."""
    busy = defaultdict(set)
    for p, occ, s, e, _ in placed_items(ctx, data):
        for t in occ.teacher_ids:
            b = ctx.teacher_bell(t)
            busy[(t, p["day"])].update(ctx.periods_covered(b, s, e))
    out = defaultdict(dict)
    for (t, d), ks in busy.items():
        if ks:
            out[t][d] = (max(ks) - min(ks) + 1) - len(ks)
    return out
