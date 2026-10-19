"""Fast incremental checks for manual edits (drag & drop) in the timetable grid."""
from __future__ import annotations

from .i18n import msg
from .model import Ctx, build_ctx, minutes_to_hhmm
from .rules import static_issues


def _others(ctx: Ctx, data: dict, occ_id: str, day: str):
    for p in data.get("placements", []):
        if p["occ_id"] == occ_id or p["day"] != day or p["occ_id"] not in ctx.occurrences:
            continue
        o = ctx.occurrences[p["occ_id"]]
        win = ctx.occ_window(o, int(p["period"]))
        if win:
            yield p, o, win


def check_slot(ctx: Ctx, data: dict, occ_id: str, day: str, period: int, room_id: str | None = None) -> dict:
    occ = ctx.occurrences[occ_id]
    win = ctx.occ_window(occ, period)
    if win is None:
        return {"ok": False, "room_id": None, "conflicts": [{"code": "block_window", "occ_ids": [occ_id],
                "message": msg("block_window", occ=occ_id, day=day, period=period)}], "soft_penalty": 0}
    s, e, _ = win
    others = list(_others(ctx, data, occ_id, day))
    conflicts = []
    for iss in static_issues(ctx, occ, day, period, None):
        if iss["hard"]:
            conflicts.append({"code": iss["type"], "rule_id": iss["rule_id"], "occ_ids": [occ_id],
                              "message": msg(iss["type"], occ=occ_id, day=day, teacher=", ".join(occ.teacher_ids),
                                             rule=iss["rule_id"], days="")})
    # people: teachers and student cohorts
    mine = set(ctx.resources(occ, None))
    for p, o, (os_, oe, _) in others:
        if os_ < e and s < oe:
            shared = mine & set(ctx.resources(o, None))
            for key in shared:
                conflicts.append({"code": f"overlap_{key[0]}", "occ_ids": [occ_id, o.id], "resource": key[1],
                                  "message": msg(f"overlap_{key[0]}", res=key[1], day=day,
                                                 time=f"{minutes_to_hhmm(max(s, os_))}–{minutes_to_hhmm(min(e, oe))}",
                                                 occs=f"{occ_id} / {o.id}")})
    # rooms: keep requested/current room if free, else first free eligible room
    busy_rooms = {p.get("room_id") for p, o, (os_, oe, _) in others if os_ < e and s < oe}
    eligible = occ.room_ids or [None]
    chosen = room_id if room_id in eligible else None
    if chosen is None:
        cur = next((p.get("room_id") for p in data.get("placements", []) if p["occ_id"] == occ_id), None)
        chosen = cur if cur in eligible else None
    if chosen in busy_rooms or chosen is None:
        free = [r for r in eligible if r not in busy_rooms]
        if free:
            chosen = free[0]
        elif eligible != [None]:
            conflicts.append({"code": "overlap_room", "occ_ids": [occ_id], "resource": chosen,
                              "message": msg("overlap_room", res="/".join(eligible), day=day,
                                             time=f"{minutes_to_hhmm(s)}–{minutes_to_hhmm(e)}", occs=occ_id)})
    # same lesson twice in a day
    if data.get("settings", {}).get("spread_lessons", True):
        n = sum(1 for o in ctx.occurrences.values() if o.lesson_id == occ.lesson_id)
        if n <= len(ctx.days) and any(o.lesson_id == occ.lesson_id for _, o, _ in others):
            conflicts.append({"code": "spread", "occ_ids": [occ_id], "message": msg("spread", lesson=occ.lesson_id, day=day)})
    # daily cap
    for t in occ.teacher_ids:
        mx = ctx.teachers[t].get("max_day")
        if mx:
            load = occ.duration + sum(o.duration for _, o, _ in others if t in o.teacher_ids)
            if load > mx:
                conflicts.append({"code": "teacher_max_day", "occ_ids": [occ_id],
                                  "message": msg("teacher_max_day", teacher=t, day=day, actual=load, max=mx)})
    soft = [i for i in static_issues(ctx, occ, day, period, chosen, include_soft=True) if not i["hard"]]
    return {"ok": not conflicts, "room_id": chosen, "conflicts": conflicts,
            "soft_penalty": sum(i["weight"] * i.get("count", 1) for i in soft)}


def slot_map(data: dict, occ_id: str) -> dict:
    ctx = build_ctx(data)
    occ = ctx.occurrences[occ_id]
    out = {}
    for day in ctx.days:
        for p in ctx.periods(occ.bell_id):
            r = check_slot(ctx, data, occ_id, day, p["n"])
            out[f"{day}|{p['n']}"] = {"ok": r["ok"], "codes": sorted({c["code"] for c in r["conflicts"]}),
                                     "soft_penalty": r["soft_penalty"]}
    return out


def apply_move(data: dict, occ_id: str, day: str, period: int, room_id: str | None = None) -> dict:
    ctx = build_ctx(data)
    r = check_slot(ctx, data, occ_id, day, period, room_id)
    if not r["ok"]:
        return r
    existing = next((p for p in data["placements"] if p["occ_id"] == occ_id), None)
    if existing:
        if existing.get("locked"):
            return {"ok": False, "conflicts": [{"code": "locked", "occ_ids": [occ_id],
                    "message": {"es": f"{occ_id} está fijada; desbloquéala antes de moverla.",
                                "it": f"{occ_id} è bloccata; sbloccala prima di spostarla."}}]}
        existing.update({"day": day, "period": period, "room_id": r["room_id"]})
    else:
        data["placements"].append({"occ_id": occ_id, "day": day, "period": period, "room_id": r["room_id"],
                                   "locked": False})
    return r
