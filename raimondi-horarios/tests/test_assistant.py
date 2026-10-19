import datetime as dt
import json

from app.assistant import interpret, parse_rules

DATA = json.load(open("data/seed_fixture.json"))
MON = dt.date(2027, 3, 1)


def test_es_allowed_days():
    r = parse_rules("El docente CN1 solo puede martes y jueves", DATA, MON)
    assert r == {"intent": "teacher_allowed_days", "args": {"teacher_id": "CN1", "days": ["TUE", "THU"], "hard": True}}


def test_it_allowed_days():
    r = parse_rules("CN1 può insegnare soltanto martedì e giovedì", DATA, MON)
    assert r["intent"] == "teacher_allowed_days" and r["args"]["days"] == ["TUE", "THU"]


def test_preference_is_soft():
    r = parse_rules("Matemática e Italiano preferentemente en horas 2-5", DATA, MON)
    assert r["intent"] == "preferred_periods" and r["args"]["periods"] == [2, 3, 4, 5]
    assert set(r["args"]["subject_ids"]) == {"MA", "IT"} and r["args"]["hard"] is False


def test_absence_it():
    r = parse_rules("IT2 è assente domani", DATA, MON)
    assert r["intent"] == "absence" and r["args"] == {"teacher_id": "IT2", "date": "2027-03-02"}


def test_move_es():
    r = parse_rules("Mueve Italiano de P1 del lunes al martes hora 1", DATA, MON)
    assert r["intent"] == "move" and r["args"]["from_day"] == "MON" and r["args"]["day"] == "TUE"


def test_fail_closed_and_mode_label():
    r = interpret("Muestra el horario", DATA)
    assert r["mode"].startswith("reglas") and r["intent"] == "unknown"
