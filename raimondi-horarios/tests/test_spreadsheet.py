"""Spreadsheet import: template round trip, error reporting, joint classes, commitments."""
import base64
import io
import json

from openpyxl import Workbook

from app.model import build_ctx
from app.spreadsheet import SHEETS, export_xlsx, import_xlsx
from app.solver import solve
from app.validator import validate


def workbook(**sheets) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        ws.append(SHEETS[name])
        for r in rows:
            ws.append(list(r))
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


BELL = [("B", "Única", i + 1, f"{(480 + 45 * i) // 60}:{(480 + 45 * i) % 60:02d}",
         f"{(525 + 45 * i) // 60}:{(525 + 45 * i) % 60:02d}", "clase", "") for i in range(4)]
SUBJ = [("IT", "Italiano", "Italiano", "IT", "", "", "sí"), ("EF", "Educación Física", "Educazione fisica", "EF", "", "", "no")]
SECS = [("1A", "1A", "media", "", "B", "", ""), ("1B", "1B", "media", "", "B", "", "")]


def test_template_round_trip():
    d = json.load(open("data/seed_school.json"))
    s, rep = import_xlsx(export_xlsx(d))
    assert rep["ok"] and not rep["warnings"]
    assert len(s["lessons"]) == len(d["lessons"]) and len(s["teachers"]) == len(d["teachers"])
    assert validate(s)["summary"]["teaching_periods"] == 445


def test_errors_are_reported_with_sheet_and_row():
    carga = [("1A", "IT", 4, "Ana Rossi", "2+1", "", "", ""),     # blocks do not add up
             ("9Z", "IT", 2, "Ana Rossi", "", "", "", ""),       # unknown section
             ("1A", "XX", 2, "Ana Rossi", "", "", "", "")]       # unknown subject
    _, rep = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga))
    assert not rep["ok"]
    rows = {(e["sheet"], e["row"]) for e in rep["errors"]}
    assert {("Carga", 2), ("Carga", 3), ("Carga", 4)} <= rows


def test_capacity_error_and_auto_teacher_warning():
    carga = [("1A", "IT", 5, "Ana Rossi", "", "", "", "")]  # 5 hours, bell offers 4 x 5 = 20 -> fine
    s, rep = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga))
    assert rep["ok"] and any("Ana Rossi" in w["message"]["es"] for w in rep["warnings"])
    carga = [("1A", "IT", 21, "Ana Rossi", "", "", "", "")]
    _, rep = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga))
    assert not rep["ok"] and "21" in rep["errors"][0]["message"]["es"]


def test_joint_class_blocks_every_section():
    carga = [("1A", "EF", 2, "Mori / Nieri", "2", "", "", "1B"),
             ("1B", "IT", 2, "Ana Rossi", "", "", "", "")]
    s, rep = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga))
    assert rep["ok"]
    ef = next(l for l in s["lessons"] if l["subject_id"] == "EF")
    assert ef["joint_section_ids"] == ["1B"] and len(ef["teacher_ids"]) == 2
    s["placements"] = [{"occ_id": "1A-EF-1", "day": "MON", "period": 1, "room_id": None, "locked": False},
                       {"occ_id": "1B-IT-1", "day": "MON", "period": 2, "room_id": None, "locked": False},
                       {"occ_id": "1B-IT-2", "day": "TUE", "period": 1, "room_id": None, "locked": False}]
    hard = validate(s)["hard"]
    assert any(f["code"] == "overlap_section" and set(f["occ_ids"]) == {"1A-EF-1", "1B-IT-1"} for f in hard)
    s["placements"] = []
    r = solve(s, time_limit=5)
    assert r["status"] in ("OPTIMAL", "FEASIBLE") and r["validation"]["valid"]


def test_commitments_block_teacher():
    comp = [("Ana Rossi", "", "LUN,MAR,MIE,JUE", "B", "1-4", "Reunión", "")]
    carga = [("1A", "IT", 1, "Ana Rossi", "", "", "", "")]
    s, rep = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga, Compromisos=comp))
    assert rep["ok"]
    r = solve(s, time_limit=5)
    assert r["status"] in ("OPTIMAL", "FEASIBLE") and r["placements"][0]["day"] == "FRI"
    # three blocks of one lesson but only Friday free: explained arithmetically, nothing dropped
    carga = [("1A", "IT", 3, "Ana Rossi", "", "", "", "")]
    s, _ = import_xlsx(workbook(Campanas=BELL, Materias=SUBJ, Secciones=SECS, Carga=carga, Compromisos=comp))
    r = solve(s, time_limit=5)
    assert r["status"] == "INFEASIBLE_PRECHECK"
    assert any(f["code"] == "spread_capacity" for f in r["diagnostics"]["fatal"])


def test_upload_endpoint_dry_run_then_apply(client):
    b64 = base64.b64encode(client.get("/api/template/xlsx").content).decode()
    r = client.post("/api/import/xlsx", json={"file_b64": b64, "dry_run": True, "name": "demo"}).json()
    assert r["report"]["ok"] and "version" not in r and r["validation"]["teaching_periods"] == 445
    r = client.post("/api/import/xlsx", json={"file_b64": b64, "dry_run": False, "name": "demo"}).json()
    assert r["version"]
    st = client.get("/api/state").json()
    assert st["validation"]["summary"]["placed_occurrences"] == 0
    bad = client.post("/api/import/xlsx", json={"file_b64": base64.b64encode(b"not excel").decode()}).json()
    assert not bad["report"]["ok"]
