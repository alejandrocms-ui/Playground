"""Generate a fictional, Raimondi-shaped demo school (Primaria, Media, Liceo with three
tracks, two bell schedules, shared teachers, split groups, specialised rooms) and solve
it once so the app opens with a complete timetable.

ALL DATA IS FICTIONAL. Names, loads and rules are illustrative, not the school's.
Run: python scripts/make_seed_school.py [--time 60]"""
import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.solver import solve  # noqa: E402
from app.validator import validate  # noqa: E402


def hm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def bell(id_, name, times, breaks):
    return {"id": id_, "name": name,
            "periods": [{"label": str(i + 1), "start": hm(a), "end": hm(b)} for i, (a, b) in enumerate(times)],
            "breaks": [{"label": l, "start": hm(a), "end": hm(b), "crossing_allowed": False} for l, a, b in breaks]}


BELLS = [
    bell("PRIM", "Primaria (40 min)",
         [("08:00", "08:40"), ("08:40", "09:20"), ("09:20", "10:00"), ("10:00", "10:40"),
          ("11:00", "11:40"), ("11:40", "12:20"), ("12:20", "13:00")],
         [("Recreo / Intervallo", "10:40", "11:00")]),
    bell("SEC", "Media y Liceo (45 min)",
         [("08:00", "08:45"), ("08:45", "09:30"), ("09:30", "10:15"), ("10:35", "11:20"),
          ("11:20", "12:05"), ("12:05", "12:50"), ("13:30", "14:15"), ("14:15", "15:00")],
         [("Recreo / Intervallo", "10:15", "10:35"), ("Almuerzo / Pranzo", "12:50", "13:30")]),
]

AREAS = [
    {"id": "LEN", "name_es": "Lenguas y Comunicación", "name_it": "Lingue e Comunicazione", "color": "#4f7cff"},
    {"id": "MAT", "name_es": "Matemática", "name_it": "Matematica", "color": "#ff8a3d"},
    {"id": "CIE", "name_es": "Ciencia y Tecnología", "name_it": "Scienze e Tecnologia", "color": "#16a3b8"},
    {"id": "HUM", "name_es": "Humanidades y Ciencias Sociales", "name_it": "Area umanistica", "color": "#b07d48"},
    {"id": "ART", "name_es": "Arte y Cultura", "name_it": "Arte e Cultura", "color": "#9b6bff"},
    {"id": "EFI", "name_es": "Educación Física", "name_it": "Educazione Fisica", "color": "#2bb673"},
    {"id": "FOR", "name_es": "Formación y Religión", "name_it": "Formazione e Religione", "color": "#8a94a6"},
]

SUBJECTS = [
    ("IT", "Italiano", "Italiano", "LEN", "#4f7cff", True),
    ("ES", "Comunicación (Castellano)", "Spagnolo", "LEN", "#6b8cff", True),
    ("EN", "Inglés", "Inglese", "LEN", "#2f9e8f", True),
    ("CN", "Chino mandarín", "Cinese mandarino", "LEN", "#e0457b", False),
    ("LA", "Latín", "Latino", "LEN", "#7a5cd6", False),
    ("MA", "Matemática", "Matematica", "MAT", "#ff8a3d", True),
    ("FI", "Física", "Fisica", "CIE", "#f2a900", False),
    ("SC", "Ciencias", "Scienze", "CIE", "#16a3b8", False),
    ("ST", "Historia", "Storia", "HUM", "#b07d48", False),
    ("GE", "Geografía", "Geografia", "HUM", "#8f9f3a", False),
    ("FL", "Filosofía", "Filosofia", "HUM", "#a0522d", False),
    ("PS", "Personal Social", "Educazione civica", "HUM", "#c49a6c", False),
    ("AR", "Arte", "Arte e immagine", "ART", "#9b6bff", False),
    ("SA", "Historia del arte", "Storia dell'arte", "ART", "#b38cff", False),
    ("DG", "Diseño y dibujo", "Discipline grafiche", "ART", "#d16ba5", False),
    ("MU", "Música", "Musica", "ART", "#c56cf0", False),
    ("EF", "Educación Física", "Educazione fisica", "EFI", "#2bb673", False),
    ("RE", "Religión", "Religione", "FOR", "#8a94a6", False),
]

# subject -> blocks per week, per curriculum
PLAN = {
    "PRIM": {"IT": [2, 2, 1, 1, 1], "ES": [2, 1, 1, 1], "MA": [2, 1, 1, 1, 1], "EN": [1, 1, 1], "SC": [2],
             "PS": [1, 1], "AR": [2], "MU": [1], "EF": [2], "RE": [1]},
    "MED": {"IT": [2, 1, 1, 1, 1], "ES": [2, 1, 1], "MA": [2, 1, 1, 1], "EN": [1, 1, 1], "CN": [2],
            "SC": [2, 1], "ST": [1, 1], "GE": [1, 1], "AR": [2], "MU": [1, 1], "EF": [2], "RE": [1]},
    "LSC": {"IT": [2, 1, 1], "ES": [2, 1], "MA": [2, 1, 1, 1], "FI": [2, 1], "EN": [1, 1, 1], "LA": [1, 1, 1],
            "SC": [2, 1], "ST": [1, 1], "FL": [1, 1], "AR": [2], "EF": [2], "RE": [1]},
    "LLI": {"IT": [2, 1, 1], "ES": [2, 1], "MA": [1, 1, 1], "EN": [1, 1, 1], "CN": [2, 1], "LA": [1, 1],
            "SC": [1, 1], "ST": [1, 1], "FL": [1, 1], "SA": [1, 1], "EF": [2], "RE": [1]},
    "LAR": {"IT": [2, 1, 1], "ES": [2, 1], "MA": [1, 1, 1], "EN": [1, 1, 1], "ST": [1, 1], "FL": [1, 1],
            "SA": [2, 1], "DG": [2, 2, 2], "SC": [1, 1], "EF": [2], "RE": [1]},
}

SECTIONS = [
    *[(f"{g}P", f"{g}° Primaria", "primaria", None, "PRIM", "PRIM") for g in range(1, 6)],
    *[(f"{g}M", f"{g}ª Media", "media", None, "SEC", "MED") for g in range(1, 4)],
    ("1LS", "1° Liceo Científico", "liceo", "scientifico", "SEC", "LSC"),
    ("2LS", "2° Liceo Científico", "liceo", "scientifico", "SEC", "LSC"),
    ("1LL", "1° Liceo Lingüístico", "liceo", "linguistico", "SEC", "LLI"),
    ("2LL", "2° Liceo Lingüístico", "liceo", "linguistico", "SEC", "LLI"),
    ("1LA", "1° Liceo Artístico", "liceo", "artistico", "SEC", "LAR"),
    ("2LA", "2° Liceo Artístico", "liceo", "artistico", "SEC", "LAR"),
]

SPECIAL_ROOMS = {"SC": ["LAB"], "FI": ["LAB"], "EF": ["GYM1", "GYM2"], "MU": ["MUS"], "DG": ["ART1", "ART2"]}

FIRST = ["Lucía", "Marco", "Giulia", "Andrés", "Chiara", "Diego", "Francesca", "Javier", "Elena", "Paolo",
         "Valeria", "Luca", "Camila", "Matteo", "Rosa", "Sergio", "Silvia", "Tomás", "Anna", "Bruno",
         "Carla", "Davide", "Inés", "Fabio", "Gabriela", "Hugo", "Irene", "Jorge", "Laura", "Mario",
         "Nadia", "Óscar", "Patrizia", "Raúl", "Sara", "Teresa", "Ugo", "Vera", "Walter", "Ximena"]
LAST = ["Bianchi", "Quispe", "Romano", "Salazar", "Ferrari", "Mendoza", "Esposito", "Huamán", "Ricci", "Vargas",
        "Marino", "Torres", "Greco", "Rojas", "Conti", "Flores", "Gallo", "Ramos", "Costa", "Castillo",
        "Fontana", "Chávez", "Moretti", "Gutiérrez", "Barbieri", "Paredes", "Lombardi", "Soto", "Rinaldi", "Díaz",
        "Caruso", "Rivera", "Ferraro", "Medina", "Leone", "Aguilar", "Longo", "Cruz", "Martini", "Navarro"]

CAP = {"IT": 18, "ES": 18, "MA": 18, "EN": 18}


def build():
    subjects = [{"id": i, "name_es": es, "name_it": it, "short": i, "area_id": a, "color": c, "core": core}
                for i, es, it, a, c, core in SUBJECTS]
    sections, rooms, lessons = [], [], []
    for sid, name, level, track, bell_id, plan in SECTIONS:
        groups = [{"id": "A", "name": "Grupo A"}, {"id": "B", "name": "Grupo B"}] if sid in ("1LL", "2LL") else []
        sections.append({"id": sid, "name": name, "level": level, "track": track, "bell_id": bell_id,
                         "home_room": f"A-{sid}", "groups": groups, "plan": plan})
        rooms.append({"id": f"A-{sid}", "name": f"Aula {sid}", "kind": "home"})
        for subj, blocks in PLAN[plan].items():
            room_ids = SPECIAL_ROOMS.get(subj) or [f"A-{sid}"]
            if subj == "AR" and level != "primaria":
                room_ids = ["ART1", "ART2"]
            if subj == "EN" and groups:  # split English conversation by group
                lessons.append({"id": f"{sid}-{subj}", "section_id": sid, "subject_id": subj, "teacher_ids": [],
                                "periods_per_week": 2, "blocks": [1, 1], "room_ids": room_ids})
                for g, extra in (("A", f"A-{sid}"), ("B", "LANG")):
                    lessons.append({"id": f"{sid}-{subj}{g}", "section_id": sid, "subject_id": subj,
                                    "teacher_ids": [], "periods_per_week": 1, "blocks": [1], "group_id": g,
                                    "room_ids": [extra]})
                continue
            lessons.append({"id": f"{sid}-{subj}", "section_id": sid, "subject_id": subj, "teacher_ids": [],
                            "periods_per_week": sum(blocks), "blocks": blocks, "room_ids": room_ids})
    rooms += [{"id": r, "name": n, "kind": k} for r, n, k in [
        ("LAB", "Laboratorio de ciencias", "science_lab"), ("ART1", "Taller de arte 1", "art_studio"),
        ("ART2", "Taller de arte 2", "art_studio"), ("GYM1", "Gimnasio", "gym"), ("GYM2", "Patio deportivo", "gym"),
        ("MUS", "Sala de música", "music"), ("LANG", "Laboratorio de idiomas", "language_lab")]]

    # teacher pools: fill each teacher up to a cap, keeping level order so people are shared across levels
    teachers, n = [], 0
    by_subject = {}
    for l in lessons:
        by_subject.setdefault(l["subject_id"], []).append(l)
    for subj, ls in by_subject.items():
        cap = CAP.get(subj, 20)
        demand = sum(l["periods_per_week"] for l in ls)
        k = max(1, math.ceil(demand / cap))
        pool = []
        for i in range(k):
            tid = f"{subj}{i + 1}"
            name = f"{FIRST[n % len(FIRST)]} {LAST[(n * 7) % len(LAST)]}"
            n += 1
            pool.append({"id": tid, "name": name, "short": tid, "subject_ids": [subj], "max_day": 6,
                         "max_week": 24, "cover_eligible": True, "cover_duty": [], "email": "",
                         "contract_note": "Ficticio: carga lectiva separada de apoyo/tutoría"})
        target = math.ceil(demand / k)
        i, load = 0, 0
        for l in ls:
            if load + l["periods_per_week"] > target + 1 and i < k - 1:
                i, load = i + 1, 0
            l["teacher_ids"] = [pool[i]["id"]]
            load += l["periods_per_week"]
        teachers += pool
    for t in teachers:
        t["assigned"] = sum(l["periods_per_week"] for l in lessons if t["id"] in l["teacher_ids"])

    days = ["MON", "TUE", "WED", "THU", "FRI"]
    # cover duty (guardia) for lighter loads, in secondary bell times — explicit, never inferred
    sec = BELLS[1]["periods"]
    k = 0
    for t in teachers:
        if t["assigned"] <= 16:
            for _ in range(2):
                d, p = days[k % 5], sec[(k * 3) % 7]
                t["cover_duty"].append({"day": d, "start": hm_(p["start"]), "end": hm_(p["end"])})
                k += 1
        del t["assigned"]

    cn = [t["id"] for t in teachers if t["subject_ids"] == ["CN"]]
    constraints = [
        {"id": "H-CN-DAYS", "type": "teacher_allowed_days", "teacher_id": cn[0], "days": ["TUE", "THU"],
         "hard": True, "note": "Ejemplo: docente de chino solo martes y jueves (hipótesis a validar)"},
        {"id": "H-PT-MON", "type": "teacher_unavailable", "teacher_id": "MU1",
         "slots": [{"day": "MON", "start": 0, "end": 24 * 60}], "hard": True,
         "note": "Ejemplo: tiempo parcial, no trabaja lunes"},
        {"id": "H-FL1-DAYS", "type": "teacher_max_days", "teacher_id": "FL1", "max": 4, "hard": True,
         "note": "Ejemplo: máximo 4 días con clase"},
        {"id": "R-DOBLE-2H", "type": "block_shape", "hours": 2, "pattern": [2], "subject_ids": [], "section_ids": [],
         "hard": True, "note": "Cursos de 2 h en un solo bloque, nunca partido por un recreo"},
        {"id": "S-CORE", "type": "avoid_after_lunch", "subject_ids": ["IT", "ES", "MA", "EN"], "section_ids": [],
         "hard": False, "priority": 1, "note": "Preferencia: materias base en la mañana, no después del almuerzo"},
        {"id": "S-EQUIDAD", "type": "balanced_distribution", "subject_ids": [], "section_ids": [], "hard": False,
         "priority": 2, "note": "Preferencia: distribución equitativa en la semana y en los bloques del día"},
        {"id": "S-FRI-LAST", "type": "avoid_slot", "day": "FRI", "period": 8, "hard": False, "priority": 3,
         "note": "Preferencia: evitar la última hora del viernes"},
        {"id": "S-GAPS", "type": "teacher_gaps", "teacher_ids": [], "hard": False, "priority": 2,
         "note": "Preferencia: evitar huecos en el día de cada docente"},
        {"id": "S-COMPACT", "type": "teacher_compact_days", "teacher_ids": [], "hard": False, "priority": 3,
         "note": "Preferencia: concentrar los días de cada docente"},
    ]
    for t in teachers:
        if t["id"] == cn[0]:
            t["max_day"] = 8
    return {
        "meta": {"name": "Escuela demo (ficticia, estructura tipo Raimondi)", "school": "Demo ficticia",
                 "academic_year": 2027, "timezone": "America/Lima", "term_start": "2027-03-01",
                 "term_end": "2027-12-17", "synthetic": True},
        "days": days, "settings": {"spread_lessons": True}, "bells": BELLS, "areas": AREAS,
        "subjects": subjects, "teachers": teachers, "sections": sections, "rooms": rooms,
        "lessons": lessons, "constraints": constraints, "placements": [], "absences": [], "substitutions": [],
    }


def hm_(m):
    return m


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--time", type=float, default=60)
    args = ap.parse_args()
    data = build()
    res = solve(data, time_limit=args.time)
    print("status", res["status"], "time", res["wall_time"], "vars", res.get("variables"), "obj", res.get("objective"))
    if res["placements"] is None:
        print(json.dumps(res["diagnostics"], ensure_ascii=False, indent=1)[:3000], res.get("conflict_groups"))
        sys.exit(1)
    data["placements"] = res["placements"]
    v = validate(data)
    print(v["summary"])
    (ROOT / "data" / "seed_school.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
