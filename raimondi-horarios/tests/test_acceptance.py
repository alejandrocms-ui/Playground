"""The demo acceptance specification (demo_acceptance_spec.md), case by case."""
import copy
import json

from app.model import build_ctx
from app.solver import solve
from app.validator import validate


def state(c):
    return c.get("/api/state").json()


# 1. Load and display the witness: 52 teaching periods, 30 occurrences, no hard violations
def test_01_witness(fixture_client):
    s = state(fixture_client)["validation"]["summary"]
    assert s["teaching_periods"] == 52 and s["occurrences"] == 30
    assert s["placed_occurrences"] == 30 and s["hard_violations"] == 0


# 2. Teacher IT1: one identity spanning primary and media, 8 periods
def test_02_teacher_it1(fixture_client):
    load = state(fixture_client)["validation"]["teacher_load"]["IT1"]
    assert load["placed"] == 8 and load["sections"] == ["M1", "P1"]


# 3. Move P1 Italian Monday block to Tuesday 1–2: both conflicts detected; multi-move proposal offered
def test_03_move_conflict_and_proposal(fixture_client):
    r = fixture_client.post("/api/move", json={"occ_id": "REQ-P1-IT-1", "day": "TUE", "period": 1})
    assert r.status_code == 409
    pairs = {tuple(sorted(c["occ_ids"])) for c in r.json()["conflicts"]}
    assert ("REQ-P1-IT-1", "REQ-P1-MA-1") in pairs  # same section
    assert ("REQ-M1-IT-1", "REQ-P1-IT-1") in pairs  # same teacher IT1
    p = fixture_client.post("/api/propose-move", json={"occ_id": "REQ-P1-IT-1", "day": "TUE", "period": 1}).json()
    assert p["status"] in ("OPTIMAL", "FEASIBLE") and p["validation"]["summary"]["hard_violations"] == 0
    moved = {d["occ_id"] for d in p["diff"]}
    assert "REQ-P1-IT-1" in moved and len(moved) > 1


# 4. Core subjects in periods 2–5 as a preference: counted, then improved by the solver
def test_04_core_preference(fixture_client):
    data = state(fixture_client)["data"]
    rule = next(c for c in data["constraints"] if c["id"] == "S-CORE")
    rule["enabled"] = True
    fixture_client.put("/api/entities/constraints/S-CORE", json=rule)
    v = state(fixture_client)["validation"]
    outside = sum(f["message"]["es"].count("hora") and int(f["message"]["es"].split(":")[1].split()[0])
                  for f in v["soft"] if f["rule_id"] == "S-CORE")
    assert outside == 10  # witness has 10 core periods outside the window
    assert v["summary"]["hard_violations"] == 0  # a preference never makes the timetable invalid
    res = fixture_client.post("/api/solve", json={"time_limit": 10, "keep_current": False}).json()
    after = res["validation"]["summary"]["soft_by_rule"].get("S-CORE", {"count": 0})["count"]
    assert after < v["summary"]["soft_by_rule"]["S-CORE"]["count"]


# 5. A two-period block starting at period 3 crosses the 10:15–10:35 break
def test_05_block_cannot_cross_break(fixture_client):
    r = fixture_client.post("/api/move", json={"occ_id": "REQ-P1-SC-1", "day": "FRI", "period": 3})
    assert r.status_code == 409 and r.json()["conflicts"][0]["code"] == "block_window"


# 6. Chinese capacity contradiction: 4 periods needed, 2 available -> arithmetic explanation, no silent drop
def test_06_chinese_capacity(fixture_client):
    data = state(fixture_client)["data"]
    ctx = build_ctx(data)
    keep = [p for p in ctx.periods("B1") if p["n"] in (4, 5)]
    slots = [{"day": d, "start": p["start"], "end": p["end"]} for d in ctx.days for p in ctx.periods("B1")
             if not (d == "TUE" and p in keep)]
    fixture_client.put("/api/entities/constraints/H-CN-ONLY", json={
        "type": "teacher_unavailable", "teacher_id": "CN1", "slots": slots, "hard": True})
    res = fixture_client.post("/api/solve", json={"time_limit": 5}).json()
    assert res["status"] == "INFEASIBLE_PRECHECK" and res["placements"] is None
    cap = [f for f in res["diagnostics"]["fatal"] if f["code"] == "teacher_capacity"]
    assert cap and "4 > 2" in cap[0]["message"]["es"]
    assert {"kind": "add_teacher", "teacher_id": "CN1"} in cap[0]["options"]
    # requirement untouched
    after = state(fixture_client)["data"]
    assert sum(l["periods_per_week"] for l in after["lessons"] if l["subject_id"] == "CN") == 4


# 7. Contradictory locks: same teacher, same time, two classes -> conflict naming both occurrences
def test_07_contradictory_locks(fixture_client):
    data = state(fixture_client)["data"]
    for p in data["placements"]:
        if p["occ_id"] == "REQ-P1-IT-1":
            p.update(locked=True)
        if p["occ_id"] == "REQ-M1-IT-1":
            p.update(day="MON", period=1, locked=True)
    fixture_client.post("/api/import/json", json=data)
    res = fixture_client.post("/api/solve", json={"time_limit": 5}).json()
    lock = [f for f in res["diagnostics"]["fatal"] if f["code"] == "lock_conflict"]
    assert lock and set(lock[0]["entities"]) == {"REQ-P1-IT-1", "REQ-M1-IT-1"}


# 8. Timeout must say inconclusive (UNKNOWN), never 'impossible'
def test_08_unknown_is_not_infeasible():
    data = json.load(open("data/seed_school.json"))
    data["placements"] = []
    res = solve(data, time_limit=0.01, workers=1)
    assert res["status"] in ("UNKNOWN", "FEASIBLE", "OPTIMAL")
    if res["status"] == "UNKNOWN":
        assert res["placements"] is None and "conflict_groups" not in res


# 9. Preference change -> solve -> independent validation -> diff -> undo to the exact prior snapshot
def test_09_versioning_and_undo(fixture_client):
    before_n = state(fixture_client)["version"]
    before = state(fixture_client)["data"]
    fixture_client.put("/api/entities/constraints/S-FRI-P1", json={
        "type": "avoid_slot", "day": "FRI", "period": 1, "hard": False, "priority": 1})
    res = fixture_client.post("/api/solve", json={"time_limit": 10}).json()
    assert res["validation"]["valid"]
    fixture_client.post(f"/api/proposals/{res['proposal_id']}/accept")
    diff = fixture_client.get(f"/api/versions/{before_n}/diff").json()
    assert diff["placements"] and "S-FRI-P1" in diff["rules_added"]
    fixture_client.post(f"/api/versions/{before_n}/restore")
    assert state(fixture_client)["data"] == before


# 10. CSV/JSON export, re-parse and validate (not an aSc round trip)
def test_10_export_reimport(fixture_client):
    csv_text = fixture_client.get("/api/export/csv").text
    r = fixture_client.post("/api/import/csv?dry_run=true", json={"text": csv_text}).json()
    assert r["validation"]["hard_violations"] == 0 and r["validation"]["placed_occurrences"] == 30
    js = fixture_client.get("/api/export/json").json()
    assert validate(js)["summary"]["teaching_periods"] == 52


# 11. Multibell: 09:30–10:15 (primary p3) vs 10:00–10:45 (media p2) overlap is detected
def test_11_multibell_real_time(client):
    client.post("/api/reset", json={"seed": "multibell"})
    hard = state(client)["validation"]["hard"]
    assert any(f["code"] == "overlap_teacher" and set(f["occ_ids"]) == {"P1-IT-1", "M1-IT-1"} for f in hard)
    data = state(client)["data"]
    res = solve(data, time_limit=5)
    assert res["status"] in ("OPTIMAL", "FEASIBLE") and res["validation"]["valid"]


# Substitutions: explicit eligibility, ranking, no inference from empty slots
def test_substitutions(client):
    client.post("/api/reset", json={"seed": "school"})
    data = state(client)["data"]
    t = data["teachers"][0]["id"]
    date = "2027-03-01"  # a Monday
    client.post("/api/absences", json={"date": date, "teacher_id": t})
    day = client.get(f"/api/substitutions?date={date}").json()
    assert day["affected"]
    occ = day["affected"][0]["occ_id"]
    cands = client.get(f"/api/substitutions/candidates?date={date}&occ_id={occ}").json()
    assert all(c["teacher_id"] != t for c in cands["candidates"])
    # turning off cover eligibility removes free teachers who are not on duty
    for x in data["teachers"]:
        x["cover_eligible"] = False
        client.put(f"/api/entities/teachers/{x['id']}", json=x)
    c2 = client.get(f"/api/substitutions/candidates?date={date}&occ_id={occ}").json()
    assert all(c["tier"] == "A" for c in c2["candidates"])
    if c2["candidates"]:
        best = c2["candidates"][0]["teacher_id"]
        r = client.post("/api/substitutions", json={"date": date, "occ_id": occ, "sub_teacher_id": best})
        assert r.status_code == 200


def test_school_seed_valid():
    data = json.load(open("data/seed_school.json"))
    v = validate(data)
    assert v["valid"] and v["summary"]["placed_occurrences"] == v["summary"]["occurrences"]


def test_teacher_link_and_ics(client):
    client.post("/api/reset", json={"seed": "fixture"})
    link = next(x for x in client.get("/api/publish").json() if x["teacher_id"] == "IT1")["link"]
    _, _, tid, tok = link.split("/")
    d = client.get(f"/api/teacher/{tid}/{tok}").json()
    assert len(d["placements"]) == 4
    assert client.get(f"/api/teacher/{tid}/bad").status_code == 403
    ics = client.get(f"/api/teacher/{tid}/{tok}/ics").text
    assert ics.count("BEGIN:VEVENT") == 4 and "RRULE:FREQ=WEEKLY" in ics


def test_slot_map_marks_break_crossing(fixture_client):
    m = fixture_client.get("/api/slots/REQ-P1-SC-1").json()
    assert m["FRI|3"]["ok"] is False and "block_window" in m["FRI|3"]["codes"]
    assert m["FRI|1"]["ok"] is True
