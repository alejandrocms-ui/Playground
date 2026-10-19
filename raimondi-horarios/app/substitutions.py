"""Daily substitutions (reemplazos / supplenze).

Eligibility is explicit: a free slot alone never makes someone a substitute. Tier A are
teachers on cover duty (guardia) at that time; tier B are teachers flagged as
cover-eligible who are free, shown as 'needs confirmation'."""
from __future__ import annotations

import datetime as dt
import uuid
from collections import defaultdict

from .model import DAYS, build_ctx, minutes_to_hhmm, slot_blocked, teacher_rules, is_hard
from .validator import placed_items


def weekday(date: str) -> str:
    return DAYS[dt.date.fromisoformat(date).weekday()] if dt.date.fromisoformat(date).weekday() < 5 else "SAT"


def absent_on(data: dict, date: str) -> dict:
    out = {}
    for a in data.get("absences", []):
        if a["date"] == date:
            out[a["teacher_id"]] = a
    return out


def covers_count(data: dict, teacher_id: str, date: str, window_days: int = 30) -> int:
    d0 = dt.date.fromisoformat(date)
    n = 0
    for s in data.get("substitutions", []):
        if s.get("sub_teacher_id") == teacher_id:
            dd = dt.date.fromisoformat(s["date"])
            if 0 <= (d0 - dd).days <= window_days:
                n += 1
    return n


def affected(data: dict, date: str) -> list:
    """Lessons left without their teacher on a date, with their current cover status."""
    ctx = build_ctx(data)
    day = weekday(date)
    absents = absent_on(data, date)
    subs = {s["occ_id"]: s for s in data.get("substitutions", []) if s["date"] == date}
    out = []
    for p, occ, s, e, nums in placed_items(ctx, data):
        if p["day"] != day:
            continue
        missing = []
        for t in occ.teacher_ids:
            a = absents.get(t)
            if not a:
                continue
            if a.get("start") is not None and not (s < a["end"] and a["start"] < e):
                continue
            missing.append(t)
        if missing:
            out.append({"occ_id": occ.id, "section_id": occ.section_id, "subject_id": occ.subject_id,
                        "absent_teacher_ids": missing, "start": s, "end": e,
                        "time": f"{minutes_to_hhmm(s)}–{minutes_to_hhmm(e)}", "periods": nums,
                        "room_id": p.get("room_id"), "substitution": subs.get(occ.id)})
    out.sort(key=lambda r: (r["start"], r["section_id"]))
    return out


def busy_intervals(data: dict, date: str) -> dict:
    ctx = build_ctx(data)
    day = weekday(date)
    busy = defaultdict(list)
    for p, occ, s, e, _ in placed_items(ctx, data):
        if p["day"] == day:
            for t in occ.teacher_ids:
                busy[t].append((s, e, occ.duration))
    for sub in data.get("substitutions", []):
        if sub["date"] == date and sub.get("sub_teacher_id") and sub["occ_id"] in ctx.occurrences:
            occ = ctx.occurrences[sub["occ_id"]]
            p = next((p for p in data["placements"] if p["occ_id"] == occ.id), None)
            if p:
                win = ctx.occ_window(occ, int(p["period"]))
                if win:
                    busy[sub["sub_teacher_id"]].append((win[0], win[1], occ.duration))
    return busy


def candidates_for(data: dict, date: str, occ_id: str) -> dict:
    ctx = build_ctx(data)
    day = weekday(date)
    occ = ctx.occurrences[occ_id]
    p = next(p for p in data["placements"] if p["occ_id"] == occ_id)
    s, e, _ = ctx.occ_window(occ, int(p["period"]))
    absents = absent_on(data, date)
    busy = busy_intervals(data, date)
    sec_teachers = {t for o in ctx.occurrences.values() if o.section_id == occ.section_id for t in o.teacher_ids}
    area = ctx.subjects.get(occ.subject_id, {}).get("area_id")
    ranked, excluded = [], defaultdict(int)
    for t_id, t in ctx.teachers.items():
        if t_id in occ.teacher_ids or t_id in absents:
            continue
        if any(bs < e and s < be for bs, be, _ in busy.get(t_id, [])):
            excluded["busy"] += 1
            continue
        hard_block = False
        for c in teacher_rules(data, t_id):
            if not is_hard(c):
                continue
            if c["type"] == "teacher_allowed_days" and day not in c.get("days", []):
                hard_block = True
            if c["type"] == "teacher_unavailable" and slot_blocked(c.get("slots", []), day, s, e):
                hard_block = True
        if hard_block:
            excluded["unavailable"] += 1
            continue
        load_today = sum(d for _, _, d in busy.get(t_id, []))
        if t.get("max_day") and load_today + occ.duration > t["max_day"]:
            excluded["max_day"] += 1
            continue
        on_duty = any(cd["day"] == day and cd["start"] < e and s < cd["end"] for cd in t.get("cover_duty", []))
        if not on_duty and not t.get("cover_eligible"):
            excluded["not_eligible"] += 1
            continue
        reasons, score = [], 0
        if on_duty:
            score += 100; reasons.append("duty")
        if occ.subject_id in t.get("subject_ids", []):
            score += 30; reasons.append("same_subject")
        if t_id in sec_teachers:
            score += 20; reasons.append("knows_section")
        t_areas = {ctx.subjects.get(sid, {}).get("area_id") for sid in t.get("subject_ids", [])}
        if area and area in t_areas and "same_subject" not in reasons:
            score += 10; reasons.append("same_area")
        recent = covers_count(data, t_id, date)
        score -= 5 * recent
        score -= 3 * load_today
        ranked.append({"teacher_id": t_id, "name": t.get("name"), "tier": "A" if on_duty else "B",
                       "score": score, "reasons": reasons, "covers_30d": recent, "load_today": load_today,
                       "needs_confirmation": not on_duty})
    ranked.sort(key=lambda r: (-r["score"], r["teacher_id"]))
    return {"occ_id": occ_id, "date": date, "day": day, "time": f"{minutes_to_hhmm(s)}–{minutes_to_hhmm(e)}",
            "candidates": ranked, "excluded": dict(excluded)}


def assign(data: dict, date: str, occ_id: str, sub_teacher_id: str | None, kind: str = "cover",
           note: str = "") -> dict:
    data["substitutions"] = [s for s in data.get("substitutions", []) if not (s["date"] == date and s["occ_id"] == occ_id)]
    if sub_teacher_id:
        cands = {c["teacher_id"] for c in candidates_for(data, date, occ_id)["candidates"]}
        if sub_teacher_id not in cands:
            raise ValueError("not_a_valid_candidate")
    rec = {"id": uuid.uuid4().hex[:8], "date": date, "occ_id": occ_id, "sub_teacher_id": sub_teacher_id,
           "kind": kind if sub_teacher_id or kind != "cover" else "unassigned", "note": note}
    data["substitutions"].append(rec)
    return rec


def auto_assign(data: dict, date: str) -> list:
    """Greedy: earliest lessons first, best-ranked tier-A candidate. Tier B is never
    auto-assigned because it needs a human confirmation."""
    done = []
    for row in affected(data, date):
        if row["substitution"]:
            continue
        cands = [c for c in candidates_for(data, date, row["occ_id"])["candidates"] if c["tier"] == "A"]
        if cands:
            done.append(assign(data, date, row["occ_id"], cands[0]["teacher_id"], note="auto"))
    return done
