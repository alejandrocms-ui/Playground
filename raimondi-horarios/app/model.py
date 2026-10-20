"""Canonical scenario model and shared helpers.

A scenario is a plain JSON document (see docs/ARQUITECTURA.md). Everything here is
pure: functions take the scenario dict and return derived structures, so the solver,
the validator and the API all reason over exactly the same interpretation of the data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

DAYS = ["MON", "TUE", "WED", "THU", "FRI"]

ENTITY_KINDS = ["areas", "subjects", "teachers", "sections", "rooms", "bells", "lessons", "constraints"]

# Closed catalogue of rule types. The assistant, the UI and the solver only understand these.
CONSTRAINT_TYPES = {
    # hard by default (may be downgraded to a preference with hard=false)
    "teacher_unavailable": {"default_hard": True, "params": ["teacher_id", "slots"]},
    "teacher_allowed_days": {"default_hard": True, "params": ["teacher_id", "days"]},
    "teacher_max_days": {"default_hard": True, "params": ["teacher_id", "max"]},
    "section_unavailable": {"default_hard": True, "params": ["section_id", "slots"]},
    # preferences by default
    "preferred_periods": {"default_hard": False, "params": ["subject_ids", "periods", "section_ids"]},
    "avoid_slot": {"default_hard": False, "params": ["day", "period", "section_ids", "subject_ids"]},
    "teacher_compact_days": {"default_hard": False, "params": ["teacher_ids"]},
    "teacher_gaps": {"default_hard": False, "params": ["teacher_ids"]},
}

PRIORITY_WEIGHT = {1: 100, 2: 10, 3: 1}


def minutes_to_hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def index(items: Iterable[dict]) -> dict:
    return {it["id"]: it for it in items}


@dataclass
class Occurrence:
    id: str
    lesson_id: str
    k: int  # 1-based index of the block inside the lesson
    duration: int
    section_id: str
    subject_id: str
    teacher_ids: list
    group_id: str | None
    room_ids: list
    bell_id: str
    joint_section_ids: list = field(default_factory=list)  # "clases unidas": other sections in the same lesson

    @property
    def section_ids(self) -> list:
        return [self.section_id, *self.joint_section_ids]


@dataclass
class Ctx:
    """Indexed, derived view of a scenario."""

    data: dict
    days: list
    bells: dict
    sections: dict
    teachers: dict
    subjects: dict
    rooms: dict
    lessons: dict
    areas: dict
    occurrences: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)

    # ---- time helpers -------------------------------------------------
    def periods(self, bell_id: str) -> list:
        return self.bells[bell_id]["periods"]

    def block_window(self, bell_id: str, start_period: int, duration: int):
        """Return (start_min, end_min, [period numbers]) or None if the block does not fit
        or would cross a break where crossing is not allowed."""
        periods = self.periods(bell_id)
        i = start_period - 1
        if i < 0 or i + duration > len(periods):
            return None
        span = periods[i:i + duration]
        for a, b in zip(span, span[1:]):
            if crosses_break(self.bells[bell_id], a["end"], b["start"]):
                return None
        return span[0]["start"], span[-1]["end"], [p["n"] for p in span]

    def occ_window(self, occ: Occurrence, start_period: int):
        return self.block_window(occ.bell_id, start_period, occ.duration)

    def section_resource_keys(self, occ: Occurrence) -> list:
        """Student-cohort resources occupied by an occurrence. A whole-section lesson
        blocks every group of the section; a group lesson only its own group."""
        keys = []
        for sid in occ.section_ids:
            groups = [g["id"] for g in self.sections[sid].get("groups", [])]
            if not groups:
                keys.append(("section", sid, "*"))
            elif occ.group_id and sid == occ.section_id:
                keys.append(("section", sid, occ.group_id))
            else:
                keys += [("section", sid, g) for g in groups]
        return keys

    def resources(self, occ: Occurrence, room_id: str | None) -> list:
        keys = [("teacher", t, "") for t in occ.teacher_ids]
        keys += self.section_resource_keys(occ)
        if room_id:
            keys.append(("room", room_id, ""))
        return keys

    def teacher_bell(self, teacher_id: str) -> str | None:
        """The bell most of a teacher's lessons follow; used as the reference day grid
        for that teacher's gaps (lessons in other bells are mapped by real minutes)."""
        counts = {}
        for o in self.occurrences.values():
            if teacher_id in o.teacher_ids:
                counts[o.bell_id] = counts.get(o.bell_id, 0) + o.duration
        return max(counts, key=counts.get) if counts else None

    def periods_covered(self, bell_id: str, start: int, end: int) -> list:
        return [i for i, p in enumerate(self.periods(bell_id)) if p["start"] < end and start < p["end"]]

    def subject_name(self, subject_id: str, lang: str = "es") -> str:
        s = self.subjects.get(subject_id, {})
        return s.get(f"name_{lang}") or s.get("name_es") or subject_id


def crosses_break(bell: dict, end_a: int, start_b: int) -> bool:
    between = [br for br in bell.get("breaks", []) if br["start"] >= end_a and br["end"] <= start_b]
    if any(not br.get("crossing_allowed") for br in between):
        return True
    if between:
        return False
    # an undeclared gap between two periods is treated as a non-crossable break
    return start_b > end_a


def normalise_bells(data: dict) -> None:
    for bell in data.get("bells", []):
        for n, p in enumerate(bell["periods"], start=1):
            p["n"] = n


def build_ctx(data: dict) -> Ctx:
    normalise_bells(data)
    ctx = Ctx(
        data=data,
        days=data.get("days") or DAYS,
        bells=index(data.get("bells", [])),
        sections=index(data.get("sections", [])),
        teachers=index(data.get("teachers", [])),
        subjects=index(data.get("subjects", [])),
        rooms=index(data.get("rooms", [])),
        lessons=index(data.get("lessons", [])),
        areas=index(data.get("areas", [])),
    )
    for lesson in data.get("lessons", []):
        sec = ctx.sections.get(lesson["section_id"])
        if sec is None:
            ctx.errors.append({"code": "unknown_section", "entity": lesson["id"], "ref": lesson["section_id"]})
            continue
        if lesson["subject_id"] not in ctx.subjects:
            ctx.errors.append({"code": "unknown_subject", "entity": lesson["id"], "ref": lesson["subject_id"]})
        for t in lesson.get("teacher_ids", []):
            if t not in ctx.teachers:
                ctx.errors.append({"code": "unknown_teacher", "entity": lesson["id"], "ref": t})
        if not lesson.get("teacher_ids"):
            ctx.errors.append({"code": "no_teacher", "entity": lesson["id"]})
        blocks = lesson.get("blocks") or [1] * int(lesson.get("periods_per_week", 0))
        if sum(blocks) != int(lesson.get("periods_per_week", sum(blocks))):
            ctx.errors.append({"code": "blocks_mismatch", "entity": lesson["id"],
                               "expected": lesson.get("periods_per_week"), "actual": sum(blocks)})
        rooms = lesson.get("room_ids") or ([sec["home_room"]] if sec.get("home_room") else [])
        for r in rooms:
            if r not in ctx.rooms:
                ctx.errors.append({"code": "unknown_room", "entity": lesson["id"], "ref": r})
        joint = [j for j in lesson.get("joint_section_ids", []) if j != sec["id"]]
        for j in joint:
            if j not in ctx.sections:
                ctx.errors.append({"code": "unknown_section", "entity": lesson["id"], "ref": j})
        joint = [j for j in joint if j in ctx.sections]
        bell_id = sec.get("bell_id")
        if bell_id not in ctx.bells:
            ctx.errors.append({"code": "unknown_bell", "entity": sec["id"], "ref": bell_id})
            continue
        for k, dur in enumerate(blocks, start=1):
            occ_id = f"{lesson['id']}-{k}"
            ctx.occurrences[occ_id] = Occurrence(
                id=occ_id, lesson_id=lesson["id"], k=k, duration=int(dur),
                section_id=sec["id"], subject_id=lesson["subject_id"],
                teacher_ids=[t for t in lesson.get("teacher_ids", []) if t in ctx.teachers],
                group_id=lesson.get("group_id"), room_ids=[r for r in rooms if r in ctx.rooms],
                bell_id=bell_id, joint_section_ids=joint,
            )
    return ctx


def active_constraints(data: dict) -> list:
    return [c for c in data.get("constraints", []) if c.get("enabled", True)]


def is_hard(c: dict) -> bool:
    if "hard" in c:
        return bool(c["hard"])
    return CONSTRAINT_TYPES.get(c["type"], {}).get("default_hard", False)


def weight(c: dict) -> int:
    if "weight" in c:
        return int(c["weight"])
    return PRIORITY_WEIGHT.get(int(c.get("priority", 2)), 10)


def slot_blocked(slots: list, day: str, start: int, end: int) -> bool:
    """slots: [{day, start, end}] in real minutes. True if [start,end) intersects any."""
    for s in slots:
        if s["day"] == day and start < s["end"] and s["start"] < end:
            return True
    return False


def teacher_rules(data: dict, teacher_id: str) -> list:
    return [c for c in active_constraints(data) if c.get("teacher_id") == teacher_id]


def placement_index(data: dict) -> dict:
    return {p["occ_id"]: p for p in data.get("placements", [])}


def lang_pick(obj: dict, key: str, lang: str) -> str:
    return obj.get(f"{key}_{lang}") or obj.get(f"{key}_es") or obj.get(key) or obj.get("id", "")
