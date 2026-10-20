#!/usr/bin/env python3
"""Import reviewed JSON / CSV tables into the canonical model. No network or LLM."""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.model import CONSTRAINT_TYPES, ENTITY_KINDS
from app.diagnostics import precheck
from app.solver import solve
from app.validator import validate

TABLES = (*ENTITY_KINDS, "aliases", "workloads", "open_issues")
JSON_COLUMNS = {
    "periods", "breaks", "groups", "subject_ids", "teacher_ids", "teacher_aliases",
    "room_ids", "blocks", "slots", "days", "section_ids", "cover_duty", "approval",
    "confirmed", "hard", "enabled", "cover_eligible", "core", "max_day", "max_week",
    "periods_per_week", "max", "priority", "weight", "period", "teaching", "support",
    "permanence", "reported_total", "academic_year", "weekly_total", "resolved",
}


def read_json(payload):
    def unique_pairs(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise ValueError(f"Duplicate JSON key: {key}")
            out[key] = value
        return out

    def invalid_constant(value):
        raise ValueError(f"Invalid JSON number: {value}")

    return json.loads(payload, object_pairs_hook=unique_pairs, parse_constant=invalid_constant)


def read_sources(path: Path) -> tuple[dict, str]:
    """CSV: manifest.json for metadata, one UTF-8 CSV per table (Excel/Sheets export)."""
    if path.is_file():
        payload = path.read_bytes()
        return read_json(payload), hashlib.sha256(payload).hexdigest()
    manifest = path / "manifest.json"
    data = read_json(manifest.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("manifest must be an object")
    digest = hashlib.sha256(manifest.read_bytes())
    for table in TABLES:
        file = path / f"{table}.csv"
        if not file.exists():
            continue
        if table in data:
            raise ValueError(f"Duplicate table in manifest and CSV: {table}")
        digest.update(file.name.encode())
        digest.update(file.read_bytes())
        with file.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if len(reader.fieldnames or []) != len(set(reader.fieldnames or [])):
                raise ValueError(f"Duplicate CSV headers: {table}")
            rows = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise ValueError(f"Malformed CSV row: {table}")
                rows.append({k: read_json(v) if k in JSON_COLUMNS else v
                             for k, v in row.items() if v.strip()})
            data[table] = rows
    return data, digest.hexdigest()


def integer(value, label: str, minimum=1) -> int:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{label}: expected integer >= {minimum}")
    return value


def strings(value, label: str) -> list:
    if not isinstance(value, list) or any(not isinstance(v, str) or not v for v in value):
        raise ValueError(f"{label}: expected list of nonempty strings")
    if len(set(value)) != len(value):
        raise ValueError(f"{label}: duplicate values")
    return value


def intervals(rows, label, days=None):
    if not isinstance(rows, list):
        raise ValueError(f"{label}: expected list")
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{label}: expected interval object")
        a = integer(row.get("start"), label + ".start", 0)
        b = integer(row.get("end"), label + ".end", 0)
        if not a < b <= 1440:
            raise ValueError(f"{label}: invalid minute interval")
        if days is not None and row.get("day") not in days:
            raise ValueError(f"{label}: invalid day")


def import_scenario(source: dict, digest: str = "") -> dict:
    source = copy.deepcopy(source)
    if not isinstance(source, dict) or not isinstance(source.get("meta"), dict):
        raise ValueError("Expected an object with meta")
    meta = source["meta"]
    year = integer(meta.get("academic_year"), "academic_year")
    if type(meta.get("synthetic")) is not bool:
        raise ValueError("meta.synthetic must be explicitly true or false")
    for table in ("aliases", "workloads", "open_issues"):
        rows = source.get(table, [])
        if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
            raise ValueError(f"{table}: expected array of objects")
    sources = source.get("sources", [])
    if not isinstance(sources, list) or any(not isinstance(s, dict) or not s.get("id") for s in sources):
        raise ValueError("sources must contain source objects with IDs")
    source_ids = {s["id"] for s in sources}
    if len(source_ids) != len(sources):
        raise ValueError("Duplicate source IDs")
    blockers, warnings = [], []

    def finding(code, entity, detail, severity="blocker"):
        (blockers if severity == "blocker" else warnings).append(
            {"code": code, "entity": entity, "detail": detail})

    def sourced(row):
        return isinstance(row.get("source_ref"), str) and row["source_ref"].split("#")[0] in source_ids

    def approved(row):
        if not isinstance(row, dict):
            return False
        a = row.get("approval", {})
        return (isinstance(a, dict) and row.get("confirmed") is True and sourced(row)
                and bool(a.get("by")) and a.get("academic_year") == year)

    data = {"meta": meta, "days": source.get("days", []), "settings": source.get("settings", {}),
            "placements": [], "absences": [], "substitutions": []}
    days = strings(data["days"], "days")
    if not days or any(d not in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] for d in days):
        finding("calendar_missing", "days", "Confirmar días del ciclo; no se infieren de una demo.")
    if not isinstance(data["settings"], dict):
        raise ValueError("settings must be an object")
    if type(data["settings"].get("spread_lessons")) is not bool:
        finding("spread_unconfirmed", "settings", "Falta la política explícita de distribución de bloques.")
        data["settings"]["spread_lessons"] = False
    if not approved(source.get("calendar_review", {})):
        finding("calendar_unconfirmed", "calendar", "Días, campanas, recreos y política de bloques pendientes de aprobación para el año objetivo.")
    if not approved(source.get("coverage_review", {})):
        finding("coverage_unconfirmed", "coverage", "Confirmar que el conjunto incluye todas las secciones, materias, asignaciones e identidades del año objetivo.")
    for table in ENTITY_KINDS:
        rows = source.get(table, [])
        if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
            raise ValueError(f"{table}: expected array of objects")
        ids = [r.get("id") for r in rows]
        strings(ids, table + ".id")
        data[table] = rows
        for row in rows:
            if not sourced(row):
                finding("source_missing", row["id"], f"Falta fuente identificada: {table}.")
            for flag in ("confirmed", "hard", "enabled", "cover_eligible", "core"):
                if flag in row and type(row[flag]) is not bool:
                    raise ValueError(f"{row['id']}.{flag}: expected boolean")
    idx = {t: {r["id"]: r for r in data[t]} for t in ENTITY_KINDS}
    for table in ("sections", "subjects", "teachers", "lessons"):
        if not data[table]:
            finding("empty_table", table, "Tabla esencial vacía.")

    aliases = {}
    for alias in source.get("aliases", []):
        key, teacher = alias.get("alias"), alias.get("teacher_id")
        if not isinstance(key, str) or not key or teacher not in idx["teachers"] or key in aliases:
            raise ValueError("Invalid, unknown or duplicate teacher alias")
        aliases[key] = teacher
        if not approved(alias):
            finding("identity_unconfirmed", key, "Equivalencia de identidad pendiente; no se fusionan por coincidencia de nombre o código.")

    for bell in data["bells"]:
        periods = bell.get("periods", [])
        intervals(periods, bell["id"])
        intervals(bell.get("breaks", []), bell["id"] + ".breaks")
        if not periods or any(a["end"] > b["start"] for a, b in zip(periods, periods[1:])):
            raise ValueError(f"{bell['id']}: empty, unordered or overlapping periods")
        for br in bell.get("breaks", []):
            if type(br.get("crossing_allowed", False)) is not bool:
                raise ValueError("crossing_allowed must be boolean")
            if any(p["start"] < br["end"] and br["start"] < p["end"] for p in periods):
                raise ValueError("A break overlaps a teaching period")

    for teacher in data["teachers"]:
        for cap in ("max_week", "max_day"):
            if cap in teacher:
                integer(teacher[cap], cap)
                if not approved(teacher):
                    finding("cap_unconfirmed", teacher["id"], f"{cap} conservado solo como dato documental, sin imponerlo.", "warning")
                    teacher.setdefault("reported_limits", {})[cap] = teacher.pop(cap)
        strings(teacher.get("subject_ids", []), "teacher.subject_ids")
        if any(s not in idx["subjects"] for s in teacher.get("subject_ids", [])):
            raise ValueError("Unknown subject in teacher.subject_ids")
        intervals(teacher.get("cover_duty", []), "cover_duty", days)
        if (teacher.get("cover_eligible") or teacher.get("cover_duty")) and not approved(teacher):
            finding("cover_unconfirmed", teacher["id"], "Habilitación de reemplazos pendiente.", "warning")
            teacher["cover_eligible"], teacher["cover_duty"] = False, []

    for sec in data["sections"]:
        if sec.get("bell_id") not in idx["bells"]:
            finding("bells_missing", sec["id"], "Faltan campanas y recreos reales del nivel.")
        if sec.get("home_room") and sec["home_room"] not in idx["rooms"]:
            finding("room_unknown", sec["id"], "Aula física no registrada.")
        strings([g["id"] for g in sec.get("groups", [])], "groups.id")
        if "weekly_total" in sec:
            integer(sec["weekly_total"], "weekly_total")

    seen = set()
    for lesson in data["lessons"]:
        lid = lesson["id"]
        sec = idx["sections"].get(lesson.get("section_id"))
        if sec is None or lesson.get("subject_id") not in idx["subjects"]:
            raise ValueError(f"{lid}: unknown section or subject")
        group = lesson.get("group_id")
        if group and group not in {g["id"] for g in sec.get("groups", [])}:
            raise ValueError(f"{lid}: unknown section group")
        key = (lesson["section_id"], lesson["subject_id"], group)
        if key in seen:
            finding("duplicate_curriculum", lid, "Materia y grupo repetidos: comprobar si se duplicó la carga.")
        seen.add(key)
        hours = integer(lesson.get("periods_per_week"), lid + ".periods_per_week")
        if not lesson.get("blocks"):
            finding("blocks_missing", lid, "Patrón de bloques pendiente; horas unitarias solo para revisión documental.")
            lesson["blocks"] = [1] * hours
            lesson["provisional_blocks"] = True
        if not isinstance(lesson["blocks"], list):
            raise ValueError(f"{lid}: blocks must be a list")
        for b in lesson["blocks"]:
            integer(b, lid + ".blocks")
        if sum(lesson["blocks"]) != hours:
            finding("blocks_mismatch", lid, f"Bloques={sum(lesson['blocks'])}; plan={hours}.")
        refs = strings(lesson.pop("teacher_aliases", []), lid + ".teacher_aliases")
        teachers = strings(lesson.get("teacher_ids", []), lid + ".teacher_ids")
        for ref in refs:
            if ref not in aliases:
                finding("alias_unknown", lid, f"Identidad sin resolver: {ref}.")
            elif aliases[ref] not in teachers:
                teachers.append(aliases[ref])
        lesson["teacher_ids"] = teachers
        if not teachers or any(t not in idx["teachers"] for t in teachers):
            finding("assignment_missing", lid, "Asignación docente ausente o referencia desconocida.")
        if len(teachers) > 1 and not (lesson.get("assignment_mode") == "co_teaching" and approved(lesson)):
            finding("assignment_ambiguous", lid, "Varios docentes: confirmar codocencia, alternancia o grupos antes de generar.")
        rooms = strings(lesson.get("room_ids", []), lid + ".room_ids")
        if not rooms and not sec.get("home_room"):
            finding("room_missing", lid, "La sección no identifica un aula física; capacidad de aulas sin verificar.")
        if any(r not in idx["rooms"] for r in rooms):
            finding("room_unknown", lid, "Aula admitida no registrada.")

    for sec in data["sections"]:
        groups = [g["id"] for g in sec.get("groups", [])] or [None]
        for group in groups:
            total = sum(l["periods_per_week"] for l in data["lessons"]
                        if l["section_id"] == sec["id"] and (not l.get("group_id") or l["group_id"] == group))
            if sec.get("weekly_total") is None:
                finding("plan_total_missing", sec["id"], "Falta total de control del plan.")
            elif total != sec["weekly_total"]:
                finding("plan_total_mismatch", sec["id"], f"Grupo {group or '*'}: lecciones={total}; plan={sec['weekly_total']}.")

    supported = []
    for rule in data["constraints"]:
        typ = rule.get("type")
        if typ not in CONSTRAINT_TYPES:
            finding("rule_unsupported", rule["id"], "Tipo de regla fuera del catálogo; conservada en fuentes, no ejecutada.")
            continue
        for p in CONSTRAINT_TYPES[typ]["params"]:
            if p not in rule:
                raise ValueError(f"{rule['id']}: missing {p}")
        for key, table in (("teacher_id", "teachers"), ("section_id", "sections")):
            if key in rule and rule[key] not in idx[table]:
                raise ValueError(f"{rule['id']}: unknown {key}")
        for key, table in (("teacher_ids", "teachers"), ("section_ids", "sections"), ("subject_ids", "subjects")):
            if key in rule and any(v not in idx[table] for v in strings(rule[key], key)):
                raise ValueError(f"{rule['id']}: unknown {key}")
        if "slots" in rule:
            intervals(rule["slots"], rule["id"], days)
        if "days" in rule and any(d not in days for d in strings(rule["days"], "rule.days")):
            raise ValueError("Rule day outside calendar")
        for key in ("max", "period", "weight", "priority"):
            if key in rule:
                integer(rule[key], key)
        if "day" in rule and rule["day"] not in days:
            raise ValueError("Rule day outside calendar")
        if "periods" in rule:
            if not isinstance(rule["periods"], list):
                raise ValueError("Rule periods must be a list")
            for p in rule["periods"]:
                integer(p, "rule.periods")
        confirmed = approved(rule)
        rule["hard"] = bool(rule.get("hard", CONSTRAINT_TYPES[typ]["default_hard"]) and confirmed)
        rule["note"] = (rule.get("note", "") + f" | Fuente: {rule.get('source_ref', 'pendiente')}"
                        + (f" | Aprobó: {rule['approval']['by']} ({year})" if confirmed else " | Sin confirmar: preferencia"))
        if not confirmed:
            finding("rule_unconfirmed", rule["id"], "Importada como preferencia; no es una política aprobada.", "warning")
        supported.append(rule)
    data["constraints"] = supported
    for issue in source.get("open_issues", []):
        if issue.get("resolved") is not True:
            finding(issue.get("code", "source_question"), issue.get("entity", "source"), issue.get("detail", "Pendiente"))
    # Contract totals are documentary only. Never map ORE/apoyo/permanence to max_week.
    for load in source.get("workloads", []):
        if all(type(load.get(k)) is int for k in ("teaching", "support", "permanence", "reported_total")):
            actual = sum(load[k] for k in ("teaching", "support", "permanence"))
            if actual != load["reported_total"]:
                finding("workload_arithmetic", load.get("teacher_id", "workload"),
                        f"Componentes={actual}; total declarado={load['reported_total']}. Confirmar criterio de cómputo.", "warning")
    data["meta"]["import_audit"] = {"version": 1, "source_sha256": digest,
        "sources": sources, "blockers": blockers, "warnings": warnings,
        "workloads": source.get("workloads", []), "source_issues": source.get("open_issues", [])}
    return data


def assess(data: dict, time_limit=10.0) -> dict:
    validation = validate(data)
    diagnosis = precheck(data)
    result = solve(data, time_limit=time_limit, workers=1)
    after = None
    if result.get("placements") is not None:
        after = validate({**data, "placements": result["placements"]})
    return {"validation": validation,
            "diagnosis": {k: v for k, v in diagnosis.items() if k != "candidates"},
            "solver": result, "solution_validation": after,
            "source_totals": {"sections": len(data["sections"]), "teachers": len(data["teachers"]),
                "lessons": len(data["lessons"]), "periods": sum(l["periods_per_week"] for l in data["lessons"])},
            "import_audit": data["meta"]["import_audit"]}


def private_path(raw: Path) -> Path:
    path = raw.resolve()
    if not path.is_relative_to((ROOT / "data/private").resolve()):
        raise ValueError("Outputs must remain inside data/private/ (gitignored)")
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path)
    ap.add_argument("--output", type=Path, default=ROOT / "data/private/seed_raimondi.json")
    ap.add_argument("--report", type=Path, default=ROOT / "data/private/import_report.json")
    ap.add_argument("--time", type=float, default=10)
    args = ap.parse_args()
    try:
        out, report = private_path(args.output), private_path(args.report)
        if out == report or args.source.resolve() in (out, report):
            raise ValueError("Source, scenario and report must be different paths")
        if not 0 < args.time <= 600:
            raise ValueError("time must be > 0 and <= 600 seconds")
        source, digest = read_sources(args.source)
        data = import_scenario(source, digest)
        result = assess(data, args.time)
        for path, value in ((out, data), (report, result)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"output": str(out), "report": str(report), "status": result["solver"]["status"],
                          "blockers": len(data["meta"]["import_audit"]["blockers"]),
                          "totals": result["source_totals"]}, ensure_ascii=False))
        return 0 if result["solution_validation"] and result["solution_validation"]["valid"] else 2
    except (ValueError, TypeError, KeyError, OSError) as exc:
        print(f"Importación rechazada: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
