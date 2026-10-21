"""Spreadsheet (xlsx) import/export.

The school maintains its data in one workbook with friendly Spanish column names; this
module turns it into the canonical scenario and back. Import never guesses silently:
everything it had to infer (a teacher created from a name in "Carga", a default block
pattern) is listed as a warning, and anything ambiguous is an error that blocks import.
"""
from __future__ import annotations

import io
import re
import unicodedata
from collections import defaultdict

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .model import CONSTRAINT_TYPES, DAYS, minutes_to_hhmm

SHEETS = {
    "Campanas": ["campana", "nombre", "n", "inicio", "fin", "tipo", "etiqueta"],
    "Areas": ["id", "nombre_es", "nombre_it", "color"],
    "Materias": ["id", "nombre_es", "nombre_it", "abrev", "area", "color", "troncal"],
    "Docentes": ["id", "nombre", "materias", "max_semana", "max_dia", "reemplazos", "email", "nota"],
    "Secciones": ["id", "nombre", "nivel", "itinerario", "campana", "aula_base", "grupos"],
    "Aulas": ["id", "nombre", "tipo"],
    "Carga": ["seccion", "materia", "horas", "docentes", "bloques", "aulas", "grupo", "unida_con"],
    "Reglas": ["id", "tipo", "docente", "seccion", "materias", "dias", "horas", "max", "obligatoria", "prioridad", "nota"],
    "Compromisos": ["docente", "seccion", "dia", "campana", "horas", "tipo", "nota"],
}

HELP = {
    "Campanas": "Una fila por hora de clase o recreo. tipo = clase | recreo. Horas en formato HH:MM. "
                "n = número de la hora de clase (vacío en recreos).",
    "Areas": "Áreas curriculares (peruanas / italianas). color opcional (#RRGGBB).",
    "Materias": "id corto (IT, MA…). nombre_es y nombre_it se muestran según el idioma. troncal = sí/no.",
    "Docentes": "Opcional: si un docente aparece en Carga y no está aquí, se crea solo (con aviso). "
                "max_semana = horas lectivas máximas; max_dia = horas máximas por día; reemplazos = sí/no.",
    "Secciones": "campana = id de la hoja Campanas. grupos = A,B si la sección se divide (idiomas, laboratorios).",
    "Aulas": "Solo aulas especiales que deban respetarse (laboratorio, gimnasio…). Si una lección no indica aula, no se controla.",
    "Carga": "Una fila por materia y sección. docentes = nombre o id; co-docencia con '/'. "
             "bloques = 2+2+1 (vacío = todas de 1 hora). grupo = A/B si la lección es de medio grupo. "
             "unida_con = otras secciones que reciben la MISMA clase a la vez (p. ej. Ed. Física de todo un año).",
    "Reglas": "tipo: " + ", ".join(CONSTRAINT_TYPES) + ". dias = LUN,MAR…; horas = 1-3,5. obligatoria = sí/no "
              "(no = preferencia). prioridad 1 alta – 3 baja. block_shape: max = horas semanales del curso (2), horas = patrón (2 o 2+2+1).",
    "Compromisos": "Horas fijas que no son clase (reuniones, tutoría fuera de horario, vigilancia de recreo, atención a padres). "
                   "Bloquean al docente (o a la sección) en esas horas.",
}

DAY_ALIASES = {
    "MON": ["lun", "lunes", "lunedi", "mon", "lu"], "TUE": ["mar", "martes", "martedi", "tue", "ma"],
    "WED": ["mie", "mié", "miercoles", "mercoledi", "wed", "mi", "mer"],
    "THU": ["jue", "jueves", "giovedi", "thu", "ju", "gio"], "FRI": ["vie", "viernes", "venerdi", "fri", "vi", "ven"],
    "SAT": ["sab", "sábado", "sabado", "sabato", "sat"],
}
DAY_ES = {"MON": "LUN", "TUE": "MAR", "WED": "MIE", "THU": "JUE", "FRI": "VIE", "SAT": "SAB"}
PALETTE = ["#4f7cff", "#ff8a3d", "#2bb673", "#e0457b", "#16a3b8", "#9b6bff", "#b07d48", "#f2a900", "#2f9e8f",
           "#c56cf0", "#8f9f3a", "#d16ba5", "#6b8cff", "#a0522d", "#7a5cd6", "#8a94a6", "#c49a6c", "#1f8a70"]


def norm_key(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s)


def hkey(s) -> str:
    """Header key: 'Nombre ES' / 'nombre_es' -> 'nombre_es'."""
    s = unicodedata.normalize("NFD", str(s or "").lower().strip())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").upper()[:24] or "X"


def yes(v) -> bool:
    return norm_key(v) in ("si", "s", "yes", "y", "true", "1", "x", "obligatoria", "dura")


def parse_hhmm(v) -> int | None:
    if v is None or v == "":
        return None
    if hasattr(v, "hour"):
        return v.hour * 60 + v.minute
    if isinstance(v, (int, float)) and 0 <= v < 1:  # Excel time fraction
        return round(v * 24 * 60)
    m = re.match(r"^\s*(\d{1,2})[:.h](\d{2})", str(v))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def parse_days(v) -> list:
    out = []
    for tok in re.split(r"[,;/ ]+", str(v or "")):
        k = norm_key(tok)
        if not k:
            continue
        for d, al in DAY_ALIASES.items():
            if k == d.lower() or k in [norm_key(a) for a in al]:
                out.append(d)
    return out


def parse_ints(v) -> list:
    out = []
    for part in re.split(r"[,; ]+", str(v or "").strip()):
        if not part:
            continue
        m = re.match(r"^(\d+)\s*[-–]\s*(\d+)$", part)
        if m:
            out += list(range(int(m.group(1)), int(m.group(2)) + 1))
        elif part.replace(".0", "").isdigit():
            out.append(int(float(part)))
    return out


def split_list(v, sep=r"[,;]") -> list:
    return [x.strip() for x in re.split(sep, str(v or "")) if x.strip()]


def read_rows(wb, name: str) -> list:
    """Rows as dicts keyed by normalised header; tolerant to extra columns / blank rows."""
    if name not in wb.sheetnames:
        return []
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    hdr_i = next((i for i, r in enumerate(rows) if r and any(c is not None and str(c).strip() for c in r)), None)
    if hdr_i is None:
        return []
    headers = [hkey(c) for c in rows[hdr_i]]
    out = []
    for n, r in enumerate(rows[hdr_i + 1:], start=hdr_i + 2):
        if not r or all(c is None or str(c).strip() == "" for c in r):
            continue
        d = {h: (c.strip() if isinstance(c, str) else c) for h, c in zip(headers, r) if h}
        if str(d.get(headers[0], "")).startswith("#"):  # comment row
            continue
        d["_row"] = n
        out.append(d)
    return out


class Report:
    def __init__(self):
        self.errors, self.warnings, self.info = [], [], []

    def err(self, sheet, row, es, it=None):
        self.errors.append({"sheet": sheet, "row": row, "message": {"es": es, "it": it or es}})

    def warn(self, sheet, row, es, it=None):
        self.warnings.append({"sheet": sheet, "row": row, "message": {"es": es, "it": it or es}})

    def as_dict(self):
        return {"errors": self.errors, "warnings": self.warnings, "info": self.info, "ok": not self.errors}


def import_xlsx(content: bytes, meta: dict | None = None) -> tuple[dict, dict]:
    wb = load_workbook(io.BytesIO(content), data_only=True)
    rep = Report()
    missing = [s for s in ("Campanas", "Materias", "Secciones", "Carga") if s not in wb.sheetnames]
    for s in missing:
        rep.err(s, None, f"Falta la hoja obligatoria «{s}».", f"Manca il foglio obbligatorio «{s}».")
    if missing:
        return {}, rep.as_dict()

    # bells
    bells = {}
    for r in read_rows(wb, "Campanas"):
        bid = str(r.get("campana") or "").strip()
        s, e = parse_hhmm(r.get("inicio")), parse_hhmm(r.get("fin"))
        if not bid or s is None or e is None or e <= s:
            rep.err("Campanas", r["_row"], "Fila incompleta o con horas inválidas (campana, inicio, fin).")
            continue
        b = bells.setdefault(bid, {"id": bid, "name": r.get("nombre") or bid, "periods": [], "breaks": []})
        if norm_key(r.get("tipo")) in ("recreo", "pausa", "break", "intervallo", "pranzo", "almuerzo"):
            b["breaks"].append({"label": r.get("etiqueta") or "Recreo", "start": s, "end": e, "crossing_allowed": False})
        else:
            b["periods"].append({"label": str(r.get("n") or ""), "start": s, "end": e})
    for b in bells.values():
        b["periods"].sort(key=lambda p: p["start"])
        for a, c in zip(b["periods"], b["periods"][1:]):
            if c["start"] < a["end"]:
                rep.err("Campanas", None, f"La campana {b['id']} tiene horas que se solapan ({minutes_to_hhmm(c['start'])}).")

    areas = []
    for i, r in enumerate(read_rows(wb, "Areas")):
        aid = str(r.get("id") or "").strip()
        if aid:
            areas.append({"id": aid, "name_es": r.get("nombre_es") or aid, "name_it": r.get("nombre_it") or r.get("nombre_es") or aid,
                          "color": r.get("color") or PALETTE[i % len(PALETTE)]})

    subjects, subj_key = [], {}
    for i, r in enumerate(read_rows(wb, "Materias")):
        sid = str(r.get("id") or "").strip()
        if not sid:
            rep.err("Materias", r["_row"], "Materia sin id.")
            continue
        s = {"id": sid, "name_es": r.get("nombre_es") or sid, "name_it": r.get("nombre_it") or r.get("nombre_es") or sid,
             "short": r.get("abrev") or sid, "area_id": r.get("area") or None,
             "color": r.get("color") or PALETTE[i % len(PALETTE)], "core": yes(r.get("troncal"))}
        if s["area_id"] and not any(a["id"] == s["area_id"] for a in areas):
            areas.append({"id": s["area_id"], "name_es": s["area_id"], "name_it": s["area_id"], "color": PALETTE[len(areas) % len(PALETTE)]})
        subjects.append(s)
        for k in (sid, s["name_es"], s["name_it"], s["short"]):
            subj_key.setdefault(norm_key(k), sid)

    rooms = [{"id": str(r["id"]).strip(), "name": r.get("nombre") or r["id"], "kind": r.get("tipo") or ""}
             for r in read_rows(wb, "Aulas") if r.get("id")]
    room_ids = {r["id"] for r in rooms}

    sections, sec_key = [], {}
    for r in read_rows(wb, "Secciones"):
        sid = str(r.get("id") or "").strip()
        if not sid:
            continue
        bell = str(r.get("campana") or "").strip()
        if bell not in bells:
            rep.err("Secciones", r["_row"], f"La sección {sid} usa la campana «{bell}», que no existe en Campanas.")
        home = r.get("aula_base") or None
        if home and home not in room_ids:
            rooms.append({"id": home, "name": home, "kind": "home"})
            room_ids.add(home)
        sections.append({"id": sid, "name": r.get("nombre") or sid, "level": r.get("nivel") or "",
                         "track": r.get("itinerario") or None, "bell_id": bell, "home_room": home,
                         "groups": [{"id": g, "name": f"Grupo {g}"} for g in split_list(r.get("grupos"))]})
        for k in (sid, r.get("nombre")):
            if k:
                sec_key.setdefault(norm_key(k), sid)

    teachers, t_key = [], {}

    def add_teacher(tid, name, row_extra=None):
        t = {"id": tid, "name": name, "short": tid, "subject_ids": [], "max_day": None, "max_week": None,
             "cover_eligible": True, "cover_duty": [], "email": ""}
        if row_extra:
            t.update(row_extra)
        teachers.append(t)
        for k in (tid, name):
            if k:
                t_key.setdefault(norm_key(k), tid)
        return t

    for r in read_rows(wb, "Docentes"):
        name = r.get("nombre") or r.get("id")
        if not name:
            continue
        tid = str(r.get("id") or slug(name)).strip()
        if norm_key(tid) in t_key or norm_key(name) in t_key:
            rep.warn("Docentes", r["_row"], f"Docente repetido: {name}. Se usa la primera fila.")
            continue
        extra = {"max_week": int(r["max_semana"]) if str(r.get("max_semana") or "").strip().replace(".0", "").isdigit() else None,
                 "max_day": int(r["max_dia"]) if str(r.get("max_dia") or "").strip().replace(".0", "").isdigit() else None,
                 "cover_eligible": True if r.get("reemplazos") in (None, "") else yes(r.get("reemplazos")),
                 "email": r.get("email") or "", "contract_note": r.get("nota") or ""}
        t = add_teacher(tid, name, extra)
        t["subject_ids"] = [subj_key.get(norm_key(m), m) for m in split_list(r.get("materias"))]

    def resolve_teacher(name, sheet, row):
        k = norm_key(name)
        if not k:
            return None
        if k in t_key:
            return t_key[k]
        tid = slug(name)
        while norm_key(tid) in t_key:
            tid += "X"
        add_teacher(tid, name.strip())
        rep.warn(sheet, row, f"Docente «{name.strip()}» no estaba en Docentes: se creó con id {tid}. Revisa que no sea la misma persona escrita distinto.",
                 f"Docente «{name.strip()}» non era in Docenti: creato con id {tid}. Verifica che non sia la stessa persona scritta diversamente.")
        return tid

    lessons, used_ids = [], set()
    for r in read_rows(wb, "Carga"):
        row = r["_row"]
        sec = sec_key.get(norm_key(r.get("seccion")))
        subj = subj_key.get(norm_key(r.get("materia")))
        if not sec:
            rep.err("Carga", row, f"Sección desconocida «{r.get('seccion')}».", f"Classe sconosciuta «{r.get('seccion')}».")
            continue
        if not subj:
            rep.err("Carga", row, f"Materia desconocida «{r.get('materia')}» (agrégala en Materias).",
                    f"Materia sconosciuta «{r.get('materia')}» (aggiungila in Materie).")
            continue
        try:
            hours = int(float(r.get("horas") or 0))
        except ValueError:
            hours = 0
        if hours <= 0:
            rep.warn("Carga", row, f"{sec} · {subj}: horas vacías o 0, se ignora la fila.")
            continue
        blocks = parse_ints(str(r.get("bloques") or "").replace("+", ","))
        if blocks and sum(blocks) != hours:
            rep.err("Carga", row, f"{sec} · {subj}: los bloques suman {sum(blocks)} pero las horas son {hours}.",
                    f"{sec} · {subj}: i blocchi sommano {sum(blocks)} ma le ore sono {hours}.")
            continue
        blocks = blocks or [1] * hours
        tids = [resolve_teacher(n, "Carga", row) for n in split_list(r.get("docentes"), r"[/;+]| y | e ")]
        tids = [t for t in tids if t]
        if not tids:
            rep.warn("Carga", row, f"{sec} · {subj}: sin docente asignado; el motor la dejará marcada como dato incompleto.")
        for t in tids:
            tt = next(x for x in teachers if x["id"] == t)
            if subj not in tt["subject_ids"]:
                tt["subject_ids"].append(subj)
        rids = split_list(r.get("aulas"))
        for rid in rids:
            if rid not in room_ids:
                rooms.append({"id": rid, "name": rid, "kind": "special"})
                room_ids.add(rid)
        group = str(r.get("grupo") or "").strip() or None
        lid = f"{sec}-{subj}" + (f"-{group}" if group else "")
        while lid in used_ids:
            lid += "b"
        used_ids.add(lid)
        lesson = {"id": lid, "section_id": sec, "subject_id": subj, "teacher_ids": tids, "periods_per_week": hours,
                  "blocks": blocks, "room_ids": rids}
        if group:
            lesson["group_id"] = group
        joint = []
        for j in split_list(r.get("unida_con"), r"[,;+]"):
            js = sec_key.get(norm_key(j))
            if js and js != sec:
                joint.append(js)
            elif not js:
                rep.err("Carga", row, f"{sec} · {subj}: sección unida desconocida «{j}».")
        if joint:
            lesson["joint_section_ids"] = joint
        lessons.append(lesson)

    constraints = []
    for r in read_rows(wb, "Reglas"):
        t = str(r.get("tipo") or "").strip()
        if t not in CONSTRAINT_TYPES:
            rep.err("Reglas", r["_row"], f"Tipo de regla desconocido «{t}». Válidos: {', '.join(CONSTRAINT_TYPES)}.")
            continue
        c = {"id": str(r.get("id") or f"R{r['_row']}"), "type": t, "note": r.get("nota") or "",
             "hard": yes(r.get("obligatoria")) if r.get("obligatoria") not in (None, "") else CONSTRAINT_TYPES[t]["default_hard"],
             "priority": int(float(r.get("prioridad") or 2))}
        if r.get("docente"):
            c["teacher_id"] = t_key.get(norm_key(r["docente"])) or rep.err("Reglas", r["_row"], f"Docente desconocido «{r['docente']}».")
        if r.get("seccion"):
            c["section_id"] = sec_key.get(norm_key(r["seccion"]))
        days, hours = parse_days(r.get("dias")), parse_ints(r.get("horas"))
        if t == "teacher_allowed_days":
            c["days"] = days
        elif t in ("teacher_unavailable", "section_unavailable"):
            c["_days"], c["_hours"] = days or DAYS, hours
        elif t == "teacher_max_days":
            c["max"] = int(float(r.get("max") or 4))
        elif t == "preferred_periods":
            c["subject_ids"] = [subj_key.get(norm_key(m), m) for m in split_list(r.get("materias"))]
            c["periods"] = hours
            c["section_ids"] = [sec_key.get(norm_key(s), s) for s in split_list(r.get("seccion"))]
            c.pop("section_id", None)
        elif t == "avoid_slot":
            c["day"] = days[0] if days else None
            c["period"] = hours[0] if hours else None
            c["subject_ids"] = [subj_key.get(norm_key(m), m) for m in split_list(r.get("materias"))]
        elif t in ("block_shape", "prefer_double_periods", "avoid_after_lunch", "balanced_distribution"):
            c["subject_ids"] = [subj_key.get(norm_key(m), m) for m in split_list(r.get("materias"))]
            c["section_ids"] = [sec_key.get(norm_key(x), x) for x in split_list(r.get("seccion"))]
            c.pop("section_id", None)
            if t == "block_shape":
                c["hours"] = int(float(r["max"])) if str(r.get("max") or "").strip() else None
                c["pattern"] = parse_ints(str(r.get("horas") or "").replace("+", ","))
        elif t in ("teacher_compact_days", "teacher_gaps"):
            c["teacher_ids"] = [t_key.get(norm_key(x), x) for x in split_list(r.get("docente"))]
            c.pop("teacher_id", None)
        constraints.append(c)

    # fixed commitments -> unavailability rules (minutes resolved against the given bell)
    commit = defaultdict(list)
    for r in read_rows(wb, "Compromisos"):
        who_t = t_key.get(norm_key(r.get("docente"))) if r.get("docente") else None
        who_s = sec_key.get(norm_key(r.get("seccion"))) if r.get("seccion") else None
        bell = bells.get(str(r.get("campana") or "").strip())
        if not (who_t or who_s) or not bell:
            rep.err("Compromisos", r["_row"], "Indica un docente o sección existente y una campana válida.")
            continue
        hrs = parse_ints(r.get("horas"))
        for d in parse_days(r.get("dia")) or DAYS:
            for n in hrs:
                if 1 <= n <= len(bell["periods"]):
                    p = bell["periods"][n - 1]
                    commit[("t", who_t) if who_t else ("s", who_s)].append(
                        {"day": d, "start": p["start"], "end": p["end"], "what": r.get("tipo") or ""})
    for (kind, who), slots in commit.items():
        what = sorted({s.pop("what") for s in slots if s.get("what")})
        constraints.append({"id": f"C-{who}", "type": "teacher_unavailable" if kind == "t" else "section_unavailable",
                            ("teacher_id" if kind == "t" else "section_id"): who, "slots": slots, "hard": True,
                            "note": "Compromisos: " + ", ".join(what)})

    # resolve day/hour rules against the bell of the target
    for c in constraints:
        if "_days" in c:
            days, hours = c.pop("_days"), c.pop("_hours")
            if c["type"] == "section_unavailable":
                bell = bells.get(next((s["bell_id"] for s in sections if s["id"] == c.get("section_id")), ""), None)
            else:
                b_id = next((s["bell_id"] for l in lessons if c.get("teacher_id") in l["teacher_ids"]
                             for s in sections if s["id"] == l["section_id"]), None)
                bell = bells.get(b_id)
            if not hours or not bell:
                c["slots"] = [{"day": d, "start": 0, "end": 24 * 60} for d in days]
            else:
                c["slots"] = [{"day": d, "start": bell["periods"][n - 1]["start"], "end": bell["periods"][n - 1]["end"]}
                              for d in days for n in hours if 1 <= n <= len(bell["periods"])]

    # sanity: weekly hours vs bell capacity
    load = defaultdict(int)
    for l in lessons:
        if not l.get("group_id"):
            for sid in [l["section_id"], *l.get("joint_section_ids", [])]:
                load[sid] += l["periods_per_week"]
    for s in sections:
        b = bells.get(s["bell_id"])
        if not b:
            continue
        blocked = sum(1 for c in constraints if c["type"] == "section_unavailable" and c.get("section_id") == s["id"]
                      for sl in c["slots"] for p in b["periods"] if sl["start"] < p["end"] and p["start"] < sl["end"])
        cap = len(b["periods"]) * len(DAYS) - blocked
        if load[s["id"]] > cap:
            rep.err("Carga", None, f"La sección {s['id']} tiene {load[s['id']]} horas pero su campana solo ofrece {cap} franjas.",
                    f"La classe {s['id']} ha {load[s['id']]} ore ma la sua campanella offre solo {cap} fasce.")
        elif load[s["id"]] == 0:
            rep.warn("Secciones", None, f"La sección {s['id']} no tiene carga en la hoja Carga.")
    tload = defaultdict(int)
    for l in lessons:
        for t in l["teacher_ids"]:
            tload[t] += l["periods_per_week"]
    for t in teachers:
        if t.get("max_week") and tload[t["id"]] > t["max_week"]:
            rep.warn("Docentes", None, f"{t['name']}: {tload[t['id']]} horas asignadas > máximo {t['max_week']}.")

    data = {
        "meta": {"name": "Escenario importado", "school": "", "academic_year": 2027, "timezone": "America/Lima",
                 "synthetic": False, **(meta or {})},
        "days": DAYS, "settings": {"spread_lessons": True}, "bells": list(bells.values()), "areas": areas,
        "subjects": subjects, "teachers": teachers, "sections": sections, "rooms": rooms, "lessons": lessons,
        "constraints": constraints, "placements": [], "absences": [], "substitutions": [],
    }
    rep.info = [{"key": k, "value": len(data[k])} for k in ("bells", "sections", "teachers", "subjects", "lessons", "constraints")]
    rep.info.append({"key": "periods", "value": sum(l["periods_per_week"] for l in lessons)})
    return data, rep.as_dict()


# ---------------------------------------------------------------- export (also the template)
def _style(ws, sheet):
    head = PatternFill("solid", fgColor="1F4E8C")
    for i, h in enumerate(SHEETS[sheet], start=1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = head
        ws.column_dimensions[get_column_letter(i)].width = max(12, len(h) + 4)
    ws.freeze_panes = "A2"


def export_xlsx(data: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "LEEME"
    lines = [("Plantilla de horarios · Modello orari", True),
             ("1. Completa las hojas (no cambies los nombres de las columnas). Las filas que empiezan con # se ignoran.", False),
             ("2. En la app: Importar → subir planilla → revisar avisos → Cargar y generar primera pasada.", False),
             ("3. Después ajusta a mano con arrastrar y soltar; cada cambio queda en el Historial.", False), ("", False)]
    lines += [(f"{k}: {v}", False) for k, v in HELP.items()]
    for i, (t, bold) in enumerate(lines, start=1):
        c = ws.cell(row=i, column=1, value=t)
        c.font = Font(bold=bold, size=14 if bold else 11)
        c.alignment = Alignment(wrap_text=True)
    ws.column_dimensions["A"].width = 140

    def sheet(name, rows):
        w = wb.create_sheet(name)
        _style(w, name)
        for r in rows:
            w.append(r)

    sheet("Campanas", [row for b in data.get("bells", []) for row in (
        [[b["id"], b.get("name"), p.get("label") or i + 1, minutes_to_hhmm(p["start"]), minutes_to_hhmm(p["end"]), "clase", ""]
         for i, p in enumerate(b["periods"])] +
        [[b["id"], b.get("name"), "", minutes_to_hhmm(br["start"]), minutes_to_hhmm(br["end"]), "recreo", br.get("label")]
         for br in b.get("breaks", [])])])
    sheet("Areas", [[a["id"], a.get("name_es"), a.get("name_it"), a.get("color")] for a in data.get("areas", [])])
    sheet("Materias", [[s["id"], s.get("name_es"), s.get("name_it"), s.get("short"), s.get("area_id"), s.get("color"),
                        "sí" if s.get("core") else "no"] for s in data.get("subjects", [])])
    sheet("Docentes", [[t["id"], t.get("name"), ", ".join(t.get("subject_ids", [])), t.get("max_week"), t.get("max_day"),
                        "sí" if t.get("cover_eligible") else "no", t.get("email"), t.get("contract_note")]
                       for t in data.get("teachers", [])])
    sheet("Secciones", [[s["id"], s.get("name"), s.get("level"), s.get("track"), s.get("bell_id"), s.get("home_room"),
                         ",".join(g["id"] for g in s.get("groups", []))] for s in data.get("sections", [])])
    homes = {s.get("home_room") for s in data.get("sections", [])}
    sheet("Aulas", [[r["id"], r.get("name"), r.get("kind")] for r in data.get("rooms", []) if r["id"] not in homes])
    tname = {t["id"]: t.get("name") or t["id"] for t in data.get("teachers", [])}
    sheet("Carga", [[l["section_id"], l["subject_id"], l["periods_per_week"], " / ".join(tname.get(t, t) for t in l["teacher_ids"]),
                     "+".join(map(str, l["blocks"])) if any(b > 1 for b in l.get("blocks", [])) else "",
                     ", ".join(l.get("room_ids", [])) if l.get("room_ids") and l["room_ids"] != [next(
                         (s.get("home_room") for s in data["sections"] if s["id"] == l["section_id"]), None)] else "",
                     l.get("group_id") or "", ", ".join(l.get("joint_section_ids", []))] for l in data.get("lessons", [])])
    rule_rows = []
    for c in data.get("constraints", []):
        if c["id"].startswith("C-"):
            continue
        days = c.get("days") or sorted({s["day"] for s in c.get("slots", [])}, key=DAYS.index) or ([c["day"]] if c.get("day") else [])
        rule_rows.append([c["id"], c["type"], tname.get(c.get("teacher_id"), c.get("teacher_id")) or ", ".join(c.get("teacher_ids") or []),
                          c.get("section_id") or ", ".join(c.get("section_ids") or []), ", ".join(c.get("subject_ids") or []),
                          ",".join(DAY_ES.get(d, d) for d in days),
                          "+".join(map(str, c.get("pattern") or [])) if c["type"] == "block_shape"
                          else ",".join(map(str, c.get("periods") or ([c["period"]] if c.get("period") else []))),
                          c.get("hours") if c["type"] == "block_shape" else c.get("max"),
                          "sí" if c.get("hard") else "no", c.get("priority", 2), c.get("note")])
    sheet("Reglas", rule_rows)
    sheet("Compromisos", [["# ejemplo", "", "MAR", "", "5", "Reunión de tutores", "Bloquea la hora 5 del martes"]])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
