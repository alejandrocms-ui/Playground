"""Multibell regression fixture (acceptance case 11): one teacher with a primary lesson
09:30–10:15 and a media lesson 10:00–10:45 under different period numbers."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build() -> dict:
    return {
        "meta": {"name": "Regresión multicampana", "school": "Demo ficticia", "academic_year": 2027,
                 "timezone": "America/Lima", "synthetic": True},
        "days": ["MON", "TUE", "WED", "THU", "FRI"], "settings": {"spread_lessons": True},
        "bells": [
            {"id": "PRI", "name": "Primaria", "breaks": [],
             "periods": [{"label": "1", "start": 480, "end": 525}, {"label": "2", "start": 525, "end": 570},
                         {"label": "3", "start": 570, "end": 615}]},
            {"id": "MED", "name": "Media", "breaks": [],
             "periods": [{"label": "1", "start": 555, "end": 600}, {"label": "2", "start": 600, "end": 645},
                         {"label": "3", "start": 645, "end": 690}]},
        ],
        "areas": [{"id": "LEN", "name_es": "Lenguas", "name_it": "Lingue", "color": "#4f7cff"}],
        "subjects": [{"id": "IT", "name_es": "Italiano", "name_it": "Italiano", "area_id": "LEN", "color": "#4f7cff"}],
        "teachers": [{"id": "IT1", "name": "Docente ficticio IT1", "subject_ids": ["IT"], "max_day": 6,
                      "max_week": 24, "cover_eligible": True, "cover_duty": []}],
        "sections": [{"id": "P1", "name": "Primaria ficticia", "level": "primaria", "bell_id": "PRI",
                      "home_room": "R-P1", "groups": []},
                     {"id": "M1", "name": "Media ficticia", "level": "media", "bell_id": "MED",
                      "home_room": "R-M1", "groups": []}],
        "rooms": [{"id": "R-P1", "name": "R-P1", "kind": "home"}, {"id": "R-M1", "name": "R-M1", "kind": "home"}],
        "lessons": [{"id": "P1-IT", "section_id": "P1", "subject_id": "IT", "teacher_ids": ["IT1"],
                     "periods_per_week": 1, "blocks": [1], "room_ids": ["R-P1"]},
                    {"id": "M1-IT", "section_id": "M1", "subject_id": "IT", "teacher_ids": ["IT1"],
                     "periods_per_week": 1, "blocks": [1], "room_ids": ["R-M1"]}],
        "constraints": [],
        # P1 period 3 = 09:30–10:15 ; M1 period 2 = 10:00–10:45 -> real overlap 10:00–10:15
        "placements": [{"occ_id": "P1-IT-1", "day": "MON", "period": 3, "room_id": "R-P1", "locked": False},
                       {"occ_id": "M1-IT-1", "day": "MON", "period": 2, "room_id": "R-M1", "locked": False}],
        "absences": [], "substitutions": [],
    }


if __name__ == "__main__":
    (ROOT / "data" / "seed_multibell.json").write_text(json.dumps(build(), ensure_ascii=False, indent=1))
    print("ok")
