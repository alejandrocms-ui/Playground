"""Static (per-placement) rule evaluation shared by solver, validator, slot finder and
diagnostics. 'Static' means a rule that can be judged for one occurrence in one slot
without looking at the rest of the timetable."""
from __future__ import annotations

from .model import Ctx, Occurrence, active_constraints, is_hard, slot_blocked, weight


def static_issues(ctx: Ctx, occ: Occurrence, day: str, start_period: int, room_id: str | None,
                  include_soft: bool = False) -> list:
    """Return a list of issues {rule_id, type, hard, weight} for placing occ there.
    An empty list of hard issues means the slot is statically allowed."""
    issues = []
    win = ctx.occ_window(occ, start_period)
    if win is None:
        return [{"rule_id": "H-BLOCK", "type": "block_window", "hard": True}]
    start, end, nums = win
    if room_id is not None and occ.room_ids and room_id not in occ.room_ids:
        issues.append({"rule_id": "H-ROOM", "type": "room_eligibility", "hard": True})
    for c in active_constraints(ctx.data):
        hard = is_hard(c)
        if not hard and not include_soft:
            continue
        t = c["type"]
        hit = False
        if t == "teacher_allowed_days" and c.get("teacher_id") in occ.teacher_ids:
            hit = day not in c.get("days", [])
        elif t == "teacher_unavailable" and c.get("teacher_id") in occ.teacher_ids:
            hit = slot_blocked(c.get("slots", []), day, start, end)
        elif t == "section_unavailable" and c.get("section_id") in occ.section_ids:
            hit = slot_blocked(c.get("slots", []), day, start, end)
        elif t == "preferred_periods" and applies_to(c, occ):
            outside = [n for n in nums if n not in c.get("periods", [])]
            if outside:
                issues.append({"rule_id": c["id"], "type": t, "hard": hard, "weight": weight(c),
                               "count": len(outside)})
            continue
        elif t == "avoid_slot" and applies_to(c, occ):
            hit = (c.get("day") in (None, "", day)) and int(c.get("period", 0)) in nums
        if hit:
            issues.append({"rule_id": c["id"], "type": t, "hard": hard, "weight": weight(c), "count": 1})
    return issues


def applies_to(c: dict, occ: Occurrence) -> bool:
    subs = c.get("subject_ids") or []
    secs = c.get("section_ids") or []
    return (not subs or occ.subject_id in subs) and (not secs or any(x in secs for x in occ.section_ids))


def candidates(ctx: Ctx, occ: Occurrence) -> list:
    """All statically valid (day, start_period, room_id, start_min, end_min) for occ."""
    out = []
    rooms = occ.room_ids or [None]
    n = len(ctx.periods(occ.bell_id))
    for day in ctx.days:
        for sp in range(1, n + 1):
            win = ctx.occ_window(occ, sp)
            if win is None:
                continue
            base = [i for i in static_issues(ctx, occ, day, sp, None) if i["hard"]]
            if base:
                continue
            for r in rooms:
                out.append((day, sp, r, win[0], win[1]))
    return out


def teacher_capacity_slots(ctx: Ctx, teacher_id: str) -> dict:
    """For each bell used by the teacher, count (day, period) slots where the teacher can
    teach a single period under hard rules. Used for arithmetic capacity diagnostics."""
    bells = {o.bell_id for o in ctx.occurrences.values() if teacher_id in o.teacher_ids}
    rules = [c for c in active_constraints(ctx.data) if c.get("teacher_id") == teacher_id and is_hard(c)]
    out = {}
    for b in bells:
        count = 0
        for day in ctx.days:
            for p in ctx.periods(b):
                ok = True
                for c in rules:
                    if c["type"] == "teacher_allowed_days" and day not in c.get("days", []):
                        ok = False
                    if c["type"] == "teacher_unavailable" and slot_blocked(c.get("slots", []), day, p["start"], p["end"]):
                        ok = False
                if ok:
                    count += 1
        out[b] = count
    return out
