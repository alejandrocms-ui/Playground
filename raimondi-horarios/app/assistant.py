"""Conversational layer. Turns a sentence (ES/IT) into ONE operation from a closed list,
with resolved IDs, which the user must confirm. It never edits data by itself.

Two interpreters with the same output contract:
  * 'claude' — Claude via the Anthropic SDK with a JSON schema (used when credentials exist)
  * 'reglas' — deterministic keyword parser (always available, labelled as non-AI)
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import unicodedata

from .model import DAYS, build_ctx

INTENTS = ["show_teacher", "show_section", "teacher_allowed_days", "teacher_unavailable", "preferred_periods",
           "avoid_slot", "move", "lock", "generate", "absence", "explain", "unknown"]

DAY_WORDS = {
    "MON": ["lunes", "lunedi"], "TUE": ["martes", "martedi"], "WED": ["miercoles", "mercoledi"],
    "THU": ["jueves", "giovedi"], "FRI": ["viernes", "venerdi"],
}
CORE_WORDS = ["centrales", "troncales", "principales", "fondamentali", "principali", "core"]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def has(text: str, *words) -> bool:
    return any(re.search(rf"\b{re.escape(w)}", text) for w in words)


def find_days(t: str) -> list:
    return [d for d, ws in DAY_WORDS.items() if any(re.search(rf"\b{w}\b", t) for w in ws)]


def find_periods(t: str) -> list:
    m = re.search(r"\b(?:horas?|ore|ora|periodos?|periodi|franjas?)\s*(\d+)\s*(?:-|–|a|al|y|e)\s*(\d+)", t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return list(range(min(a, b), max(a, b) + 1))
    m = re.findall(r"\b(?:hora|ora|periodo|franja)\s*(\d+)", t)
    return [int(x) for x in m]


def find_entity(t: str, items: list, keys=("id", "short", "name", "name_es", "name_it"), raw: str = "") -> list:
    """Long names match case-insensitively; short codes (EN, IT, P1) only as exact
    case-sensitive tokens, so Spanish 'en' or Italian 'e' never resolve to a subject."""
    hits = []
    for it in items:
        for k in keys:
            v = it.get(k)
            if not v:
                continue
            nv = norm(str(v))
            short = len(nv) <= 3
            if (short and re.search(rf"(?<![\w-]){re.escape(str(v))}(?![\w-])", raw)) or (not short and nv in t):
                hits.append(it["id"])
                break
    return hits


def find_date(t: str, today: dt.date) -> str | None:
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", t)
    if m:
        return m.group(1)
    if has(t, "manana", "domani"):
        return (today + dt.timedelta(days=1)).isoformat()
    if has(t, "hoy", "oggi"):
        return today.isoformat()
    days = find_days(t)
    if days:
        delta = (DAYS.index(days[0]) - today.weekday()) % 7
        return (today + dt.timedelta(days=delta)).isoformat()
    return None


def parse_rules(text: str, data: dict, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    t = norm(text)
    teachers = find_entity(t, data.get("teachers", []), raw=text)
    sections = find_entity(t, data.get("sections", []), keys=("id", "name"), raw=text)
    subjects = find_entity(t, data.get("subjects", []), keys=("id", "name_es", "name_it"), raw=text)
    days = find_days(t)
    periods = find_periods(t)
    args = {}

    if has(t, "ausente", "falta", "enfermo", "assente", "malato", "no viene", "non viene"):
        if teachers:
            return {"intent": "absence", "args": {"teacher_id": teachers[0], "date": find_date(t, today)}}
    if has(t, "por que", "perche", "explica", "spiega", "conflicto", "conflitto", "problema"):
        return {"intent": "explain", "args": {}}
    if has(t, "genera", "resolver", "resuelve", "risolvi", "calcola", "optimiza", "ottimizza", "crear horario"):
        return {"intent": "generate", "args": {}}
    if has(t, "mover", "mueve", "pasar", "cambia", "sposta", "spostare"):
        args = {"section_id": sections[0] if sections else None, "subject_id": subjects[0] if subjects else None,
                "from_day": days[0] if len(days) > 1 else None, "day": days[-1] if days else None,
                "period": periods[0] if periods else None}
        return {"intent": "move", "args": args}
    if has(t, "fija", "fijar", "bloquea la clase", "blocca la lezione", "fissa", "lock"):
        return {"intent": "lock", "args": {"section_id": sections[0] if sections else None,
                                           "subject_id": subjects[0] if subjects else None,
                                           "day": days[0] if days else None}}
    if teachers and days and has(t, "solo", "solamente", "unicamente", "soltanto", "solamente"):
        return {"intent": "teacher_allowed_days", "args": {"teacher_id": teachers[0], "days": days,
                                                           "hard": not has(t, "prefer")}}
    if teachers and has(t, "no puede", "no esta disponible", "no disponible", "non puo", "non e disponibile",
                        "indisponibile", "bloquear", "bloccare", "libre"):
        return {"intent": "teacher_unavailable", "args": {"teacher_id": teachers[0], "days": days or [],
                                                          "periods": periods, "hard": True}}
    if has(t, "prefer", "mejor", "meglio", "evitar las", *CORE_WORDS) and (subjects or has(t, *CORE_WORDS)):
        subs = subjects or [s["id"] for s in data.get("subjects", []) if s.get("core")]
        return {"intent": "preferred_periods", "args": {"subject_ids": subs, "periods": periods or [2, 3, 4, 5],
                                                        "hard": False}}
    if has(t, "evitar", "evita", "evitare"):
        return {"intent": "avoid_slot", "args": {"day": days[0] if days else None,
                                                 "period": periods[0] if periods else None, "hard": False}}
    if teachers and has(t, "horario", "orario", "muestra", "mostra", "ver", "vedi"):
        return {"intent": "show_teacher", "args": {"teacher_id": teachers[0]}}
    if sections and has(t, "horario", "orario", "muestra", "mostra", "ver", "vedi"):
        return {"intent": "show_section", "args": {"section_id": sections[0]}}
    if teachers:
        return {"intent": "show_teacher", "args": {"teacher_id": teachers[0]}}
    return {"intent": "unknown", "args": {}}


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intent", "teacher_id", "section_id", "subject_ids", "days", "periods", "day", "period",
                 "from_day", "date", "hard", "clarification"],
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "teacher_id": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "section_id": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "subject_ids": {"type": "array", "items": {"type": "string"}},
        "days": {"type": "array", "items": {"type": "string", "enum": DAYS}},
        "periods": {"type": "array", "items": {"type": "integer"}},
        "day": {"anyOf": [{"type": "string", "enum": DAYS}, {"type": "null"}]},
        "from_day": {"anyOf": [{"type": "string", "enum": DAYS}, {"type": "null"}]},
        "period": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "date": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "hard": {"anyOf": [{"type": "boolean"}, {"type": "null"}]},
        "clarification": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    },
}

SYSTEM = """You translate a school coordinator's request (Spanish or Italian) into exactly one
timetable operation from a closed list. Use only IDs from the catalogue. If an entity is
ambiguous or missing, set intent to "unknown" and write a short clarification question in
the user's language. A rule is hard only if the user states it is mandatory or contractual;
words like "preferably", "mejor", "meglio" mean a preference (hard=false). Never invent policy.
Intents: show_teacher, show_section, teacher_allowed_days (days the teacher CAN teach),
teacher_unavailable (days/periods the teacher cannot teach), preferred_periods (subjects in
preferred period numbers), avoid_slot (day + period to avoid), move (section+subject block from
from_day to day/period), lock (fix a section+subject block on day), generate, absence
(teacher absent on date, ISO yyyy-mm-dd; today is {today}), explain."""


def claude_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def parse_claude(text: str, data: dict, today: dt.date | None = None) -> dict:
    import anthropic

    today = today or dt.date.today()
    catalogue = {
        "teachers": [{"id": t["id"], "name": t.get("name"), "subjects": t.get("subject_ids")} for t in data["teachers"]],
        "sections": [{"id": s["id"], "name": s.get("name")} for s in data["sections"]],
        "subjects": [{"id": s["id"], "es": s.get("name_es"), "it": s.get("name_it")} for s in data["subjects"]],
    }
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=os.environ.get("RAIMONDI_MODEL", "claude-opus-5-5"),
        max_tokens=2000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=SYSTEM.replace("{today}", today.isoformat()),
        messages=[{"role": "user", "content": f"Catalogue:\n{json.dumps(catalogue, ensure_ascii=False)}\n\nRequest: {text}"}],
    )
    if resp.stop_reason == "refusal":
        return {"intent": "unknown", "args": {}, "clarification": None}
    raw = json.loads(next(b.text for b in resp.content if b.type == "text"))
    intent = raw.pop("intent")
    args = {k: v for k, v in raw.items() if v not in (None, [], "") and k != "clarification"}
    if "subject_ids" in args and intent in ("move", "lock"):
        args["subject_id"] = args.pop("subject_ids")[0]
    return {"intent": intent, "args": args, "clarification": raw.get("clarification")}


def interpret(text: str, data: dict, prefer_llm: bool = True) -> dict:
    mode = "reglas"
    result = None
    if prefer_llm and claude_available():
        try:
            result = parse_claude(text, data)
            mode = "claude"
        except Exception as exc:  # network, auth, schema — fall back but say so
            result = None
            mode = f"reglas (Claude no disponible: {type(exc).__name__})"
    if result is None:
        result = parse_rules(text, data)
    result["mode"] = mode
    result["problems"] = check_ids(result, data)
    return result


def check_ids(result: dict, data: dict) -> list:
    """Fail closed: every referenced ID must exist."""
    ctx = build_ctx(data)
    a = result.get("args", {})
    probs = []
    if a.get("teacher_id") and a["teacher_id"] not in ctx.teachers:
        probs.append(f"teacher:{a['teacher_id']}")
    if a.get("section_id") and a["section_id"] not in ctx.sections:
        probs.append(f"section:{a['section_id']}")
    for s in a.get("subject_ids", []) + ([a["subject_id"]] if a.get("subject_id") else []):
        if s not in ctx.subjects:
            probs.append(f"subject:{s}")
    need = {
        "show_teacher": ["teacher_id"], "show_section": ["section_id"], "teacher_allowed_days": ["teacher_id", "days"],
        "teacher_unavailable": ["teacher_id"], "preferred_periods": ["subject_ids"], "avoid_slot": ["day", "period"],
        "move": ["section_id", "subject_id", "day", "period"], "lock": ["section_id", "subject_id"],
        "absence": ["teacher_id", "date"],
    }.get(result["intent"], [])
    for k in need:
        if not a.get(k):
            probs.append(f"missing:{k}")
    return probs
