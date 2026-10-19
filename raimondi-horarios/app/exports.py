"""Exports: JSON snapshot, flat CSV of placements (re-importable), per-teacher iCalendar.
No aSc XML here on purpose: that round trip has to be proven in aSc first."""
from __future__ import annotations

import csv
import datetime as dt
import io

from .model import DAYS, build_ctx, minutes_to_hhmm
from .validator import placed_items

CSV_COLUMNS = ["occ_id", "lesson_id", "section_id", "subject_id", "teacher_ids", "day", "period",
               "start", "end", "room_id", "locked"]


def placements_csv(data: dict) -> str:
    ctx = build_ctx(data)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for p, occ, s, e, _ in sorted(placed_items(ctx, data), key=lambda r: r[0]["occ_id"]):
        w.writerow([occ.id, occ.lesson_id, occ.section_id, occ.subject_id, "|".join(occ.teacher_ids),
                    p["day"], p["period"], minutes_to_hhmm(s), minutes_to_hhmm(e), p.get("room_id") or "",
                    int(bool(p.get("locked")))])
    return buf.getvalue()


def parse_placements_csv(text: str) -> list:
    rows = csv.DictReader(io.StringIO(text))
    out = []
    for r in rows:
        out.append({"occ_id": r["occ_id"], "day": r["day"], "period": int(r["period"]),
                    "room_id": r.get("room_id") or None, "locked": r.get("locked") in ("1", "true", "True")})
    return out


def _ics_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def teacher_ics(data: dict, teacher_id: str, lang: str = "es") -> str:
    ctx = build_ctx(data)
    meta = data.get("meta", {})
    start = dt.date.fromisoformat(meta.get("term_start", f"{meta.get('academic_year', 2027)}-03-01"))
    end = dt.date.fromisoformat(meta.get("term_end", f"{meta.get('academic_year', 2027)}-12-15"))
    start -= dt.timedelta(days=start.weekday())  # Monday of the first week
    tz = meta.get("timezone", "America/Lima")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Raimondi Horarios MVP//ES", "CALSCALE:GREGORIAN"]
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for p, occ, s, e, _ in placed_items(ctx, data):
        if teacher_id not in occ.teacher_ids:
            continue
        day = start + dt.timedelta(days=DAYS.index(p["day"]))
        ds = f"{day:%Y%m%d}T{s // 60:02d}{s % 60:02d}00"
        de = f"{day:%Y%m%d}T{e // 60:02d}{e % 60:02d}00"
        title = f"{ctx.subject_name(occ.subject_id, lang)} · {ctx.sections[occ.section_id].get('name', occ.section_id)}"
        lines += ["BEGIN:VEVENT", f"UID:{occ.id}-{teacher_id}@raimondi-horarios", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID={tz}:{ds}", f"DTEND;TZID={tz}:{de}",
                  f"RRULE:FREQ=WEEKLY;UNTIL={end:%Y%m%d}T235959Z",
                  f"SUMMARY:{_ics_escape(title)}", f"LOCATION:{_ics_escape(p.get('room_id') or '')}",
                  "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
