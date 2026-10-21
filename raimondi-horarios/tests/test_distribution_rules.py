"""Pedagogical distribution rules: day blocks, lunch, double blocks, morning core, balance."""
import copy

from app.model import build_ctx
from app.solver import solve
from app.spreadsheet import export_xlsx, import_xlsx
from app.validator import validate


def hm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


TIMES = [("08:00", "08:45"), ("08:45", "09:30"), ("09:45", "10:30"), ("10:30", "11:15"), ("11:15", "12:00"),
         ("12:45", "13:30"), ("13:30", "14:15")]


def scenario(rules, lessons=None):
    lessons = lessons or [("IT", 4, [1, 1, 1, 1]), ("MA", 5, [1] * 5), ("AR", 2, [1, 1]), ("EF", 2, [1, 1])]
    return {
        "meta": {"name": "t"}, "days": ["MON", "TUE", "WED", "THU", "FRI"], "settings": {"spread_lessons": True},
        "bells": [{"id": "B", "name": "B", "periods": [{"label": str(i + 1), "start": hm(a), "end": hm(b)} for i, (a, b) in enumerate(TIMES)],
                   "breaks": [{"label": "Pausa", "start": hm("09:30"), "end": hm("09:45")},
                              {"label": "Pranzo", "start": hm("12:00"), "end": hm("12:45")}]}],
        "areas": [], "rooms": [],
        "subjects": [{"id": s, "name_es": s, "name_it": s} for s in ("IT", "MA", "AR", "EF")],
        "teachers": [{"id": f"T{s}", "name": s, "subject_ids": [s]} for s in ("IT", "MA", "AR", "EF")],
        "sections": [{"id": "S", "name": "S", "bell_id": "B", "groups": []}],
        "lessons": [{"id": f"S-{s}", "section_id": "S", "subject_id": s, "teacher_ids": [f"T{s}"],
                     "periods_per_week": h, "blocks": b, "room_ids": []} for s, h, b in lessons],
        "constraints": rules, "placements": [], "absences": [], "substitutions": [],
    }


def test_day_blocks_and_lunch_detection():
    ctx = build_ctx(scenario([]))
    assert ctx.segments("B") == [[1, 2], [3, 4, 5], [6, 7]]
    assert ctx.lunch("B") == (hm("12:00"), hm("12:45"))
    assert ctx.morning_segments("B") == [0, 1]


def test_two_hour_subjects_become_one_block_that_never_crosses_a_break():
    rules = [{"id": "B2", "type": "block_shape", "hours": 2, "subject_ids": [], "section_ids": []}]
    ctx = build_ctx(scenario(rules))
    ar = [o for o in ctx.occurrences.values() if o.lesson_id == "S-AR"]
    assert len(ar) == 1 and ar[0].duration == 2
    assert ctx.occ_window(ar[0], 2) is None  # periods 2-3 straddle the pause
    r = solve(scenario(rules), time_limit=10)
    assert r["status"] in ("OPTIMAL", "FEASIBLE") and r["validation"]["valid"]
    italian = [o for o in build_ctx(scenario(rules)).occurrences.values() if o.lesson_id == "S-IT"]
    assert all(o.duration == 1 for o in italian)  # 4-hour lessons are not touched by a 2-hour rule


def test_core_subjects_stay_in_the_morning():
    rules = [{"id": "CORE", "type": "avoid_after_lunch", "subject_ids": ["IT", "MA"], "priority": 1}]
    r = solve(scenario(rules), time_limit=10)
    assert r["validation"]["summary"]["soft_by_rule"].get("CORE") is None
    d = scenario(rules)
    d["placements"] = r["placements"]
    p = next(p for p in d["placements"] if p["occ_id"] == "S-MA-1")
    p.update(day="MON", period=6)
    hits = [f for f in validate(d)["soft"] if f["rule_id"] == "CORE"]
    assert hits and hits[0]["code"] == "avoid_after_lunch"


def test_italian_prefers_double_periods():
    rules = [{"id": "PAIR", "type": "prefer_double_periods", "subject_ids": ["IT"]}]
    d = scenario(rules)
    d["settings"]["spread_lessons"] = False
    r = solve(d, time_limit=10)
    assert r["validation"]["summary"]["soft_by_rule"].get("PAIR") is None  # 4 singles -> 2 pairs
    d["placements"] = [{"occ_id": f"S-IT-{k}", "day": day, "period": 1, "room_id": None, "locked": False}
                       for k, day in zip(range(1, 5), ["MON", "TUE", "WED", "THU"])]
    miss = [f for f in validate(d)["soft"] if f["rule_id"] == "PAIR"]
    assert miss and miss[0]["penalty"] == 2 * 10


def test_balanced_distribution_over_days_and_blocks():
    rules = [{"id": "BAL", "type": "balanced_distribution", "subject_ids": []}]
    d = scenario(rules)
    d["settings"]["spread_lessons"] = False
    d["placements"] = [{"occ_id": f"S-MA-{k}", "day": "MON", "period": k, "room_id": None, "locked": False} for k in range(1, 6)]
    found = {f["code"] for f in validate(d)["soft"] if f["rule_id"] == "BAL"}
    assert found == {"balanced_segment", "balanced_day"}
    d["placements"] = []
    r = solve(d, time_limit=10)
    assert r["validation"]["summary"]["soft_by_rule"].get("BAL") is None


def test_rules_survive_the_spreadsheet():
    rules = [{"id": "B2", "type": "block_shape", "hours": 2, "pattern": [2], "subject_ids": ["AR"], "section_ids": [], "hard": True},
             {"id": "CORE", "type": "avoid_after_lunch", "subject_ids": ["IT", "MA"], "section_ids": [], "hard": False, "priority": 1}]
    s, rep = import_xlsx(export_xlsx(scenario(copy.deepcopy(rules))))
    assert rep["ok"]
    got = {c["id"]: c for c in s["constraints"]}
    assert got["B2"]["hours"] == 2 and got["B2"]["pattern"] == [2] and got["B2"]["subject_ids"] == ["AR"]
    assert got["CORE"]["type"] == "avoid_after_lunch" and set(got["CORE"]["subject_ids"]) == {"IT", "MA"}
