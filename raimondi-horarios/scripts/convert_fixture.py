"""Convert the research handoff fixture (synthetic_fixture_design.json) into the app's
canonical scenario format. Run: python scripts/convert_fixture.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUBJECT_IT = {"IT": "Italiano", "MA": "Matematica", "EN": "Inglese", "CN": "Cinese mandarino",
              "SC": "Scienze", "AR": "Arte"}
COLORS = {"IT": "#4f7cff", "MA": "#ff8a3d", "EN": "#2bb673", "CN": "#e0457b", "SC": "#16a3b8", "AR": "#9b6bff"}
AREAS = {"IT": "LEN", "EN": "LEN", "CN": "LEN", "MA": "MAT", "SC": "MAT", "AR": "ART"}


def convert(src: dict) -> dict:
    periods = [{"label": str(p["id"]), "start": p["start_minute"], "end": p["end_minute"]}
               for p in src["calendar"]["periods"]]
    breaks = [{"start": b["start_minute"], "end": b["end_minute"], "label": "Recreo",
               "crossing_allowed": b.get("crossing_allowed", False)} for b in src["calendar"]["breaks"]]
    constraints = []
    for c in src["constraints"]:
        if c["type"] == "allowed_teacher_days":
            constraints.append({"id": c["id"], "type": "teacher_allowed_days", "teacher_id": c["teacher_id"],
                                "days": c["days"], "hard": True, "note": "Hipótesis por confirmar con Carlos"})
        elif c["type"] == "preferred_periods":
            constraints.append({"id": c["id"], "type": "preferred_periods", "subject_ids": c["subjects"],
                                "periods": c["periods"], "hard": False, "priority": c.get("priority", 2),
                                "enabled": False, "note": "Preferencia: materias centrales en horas 2–5"})
        elif c["type"] == "avoid_slot":
            constraints.append({"id": c["id"], "type": "avoid_slot", "day": c["day"], "period": c["period"],
                                "hard": False, "priority": c.get("priority", 3)})
    return {
        "meta": {"name": "Fixture sintético (handoff 19/10/2026)", "school": "Demo ficticia",
                 "academic_year": src["academic_year"], "timezone": src["timezone"], "synthetic": True},
        "days": src["cycle_days"],
        "settings": {"spread_lessons": True},
        "bells": [{"id": "B1", "name": "Horario único", "periods": periods, "breaks": breaks}],
        "areas": [{"id": "LEN", "name_es": "Lenguas", "name_it": "Lingue", "color": "#4f7cff"},
                  {"id": "MAT", "name_es": "Matemática y Ciencias", "name_it": "Matematica e Scienze", "color": "#ff8a3d"},
                  {"id": "ART", "name_es": "Artes", "name_it": "Arti", "color": "#9b6bff"}],
        "subjects": [{"id": s["id"], "name_es": s["name"], "name_it": SUBJECT_IT[s["id"]], "short": s["id"],
                      "area_id": AREAS[s["id"]], "color": COLORS[s["id"]]} for s in src["subjects"]],
        "teachers": [{"id": t["id"], "name": t["label"], "short": t["id"], "subject_ids": t["subject_ids"],
                      "max_day": 6, "max_week": 24, "cover_eligible": True, "cover_duty": []} for t in src["teachers"]],
        "sections": [{"id": s["id"], "name": s["label"], "level": s["level"], "track": s.get("track"),
                      "bell_id": "B1", "home_room": s["room_id"], "groups": []} for s in src["sections"]],
        "rooms": [{"id": r["id"], "name": r["id"], "kind": r["kind"]} for r in src["rooms"]],
        "lessons": [{"id": r["id"], "section_id": r["section_id"], "subject_id": r["subject_id"],
                     "teacher_ids": r["teacher_ids"], "periods_per_week": r["periods_per_cycle"],
                     "blocks": r["block_pattern"],
                     "room_ids": next(o["room_eligibility"] for o in src["lesson_occurrences"]
                                      if o["requirement_id"] == r["id"])} for r in src["requirements"]],
        "constraints": constraints,
        "placements": [{"occ_id": p["occurrence_id"], "day": p["day"], "period": p["period_start"],
                        "room_id": p["room_id"], "locked": False} for p in src["witness_placements"]],
        "absences": [], "substitutions": [],
    }


if __name__ == "__main__":
    src = json.loads((ROOT / "data" / "fixture_original.json").read_text())
    out = convert(src)
    (ROOT / "data" / "seed_fixture.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print("ok", len(out["placements"]), "placements")
