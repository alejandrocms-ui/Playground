"""Only synthetic records. Never load the private school scenario in CI."""
import copy
import csv
import json
from pathlib import Path

import pytest

from app.diagnostics import precheck
from app.solver import solve
from app.validator import validate
from scripts.import_raimondi import import_scenario, read_sources, assess, private_path


def source():
    return json.loads((Path(__file__).parents[1] / 'data/import_example.json').read_text())


def test_complete_import_solves_and_independent_validator_accepts():
    data = import_scenario(source())
    assert not data['meta']['import_audit']['blockers']
    assert data['lessons'][0]['teacher_ids'] == ['T1']
    result = assess(data, 2)
    assert result['solver']['status'] == 'OPTIMAL'
    assert result['solution_validation']['valid']
    assert not data['placements']  # solving is a proposal, not applied


def test_partial_import_is_invalid_not_infeasible_and_survives_roundtrip():
    raw = source()
    raw['bells'] = []
    data = json.loads(json.dumps(import_scenario(raw)))
    assert not validate(data)['valid']
    assert precheck(data)['fatal'][0]['code'] == 'import_incomplete'
    assert solve(data)['status'] == 'MODEL_INVALID'


def test_raw_canonical_data_errors_do_not_crash_or_claim_impossible():
    data = import_scenario(source())
    data['lessons'][0]['teacher_ids'] = ['missing']
    assert any(f['code'] == 'unknown_teacher' for f in validate(data)['data'])
    assert not precheck(data)['ok']
    assert solve(data)['status'] == 'MODEL_INVALID'


def test_confirmed_capacity_deficit_is_arithmetic_impossibility():
    raw = source()
    raw['teachers'][0]['max_week'] = 1
    result = assess(import_scenario(raw), 2)
    assert result['solver']['status'] == 'INFEASIBLE_PRECHECK'
    assert any(f['code'] == 'teacher_week_cap' for f in result['diagnosis']['fatal'])


def test_unapproved_rule_is_preference_and_contract_is_not_teaching_cap():
    raw = source()
    raw['constraints'] = [{'id': 'R1', 'type': 'teacher_unavailable', 'teacher_id': 'T1',
                          'slots': [{'day': 'MON', 'start': 0, 'end': 1440}],
                          'hard': True, 'source_ref': 'S1#rule'}]
    raw['teachers'][0]['confirmed'] = False
    raw['teachers'][0]['max_week'] = 1
    raw['workloads'] = [{'teacher_id': 'T1', 'teaching': 11, 'permanence': 17,
                         'support': 0, 'reported_total': 28}]
    data = import_scenario(raw)
    assert data['constraints'][0]['hard'] is False
    assert 'Sin confirmar' in data['constraints'][0]['note']
    assert 'max_week' not in data['teachers'][0]
    result = assess(data, 2)
    assert result['solution_validation']['valid']
    assert result['solution_validation']['soft']


def test_hard_rule_needs_target_year_approval():
    raw = source()
    raw['constraints'] = [{'id': 'R1', 'type': 'teacher_allowed_days', 'teacher_id': 'T1',
                          'days': ['MON'], 'source_ref': 'S1', 'confirmed': True,
                          'approval': {'by': 'Demo reviewer', 'academic_year': 2026}}]
    assert import_scenario(raw)['constraints'][0]['hard'] is False
    raw['constraints'][0]['approval']['academic_year'] = 2027
    assert import_scenario(raw)['constraints'][0]['hard'] is True


@pytest.mark.parametrize('mutate', [
    lambda r: r['teachers'].append(copy.deepcopy(r['teachers'][0])),
    lambda r: r['lessons'][0].update(periods_per_week=-1),
    lambda r: r['lessons'][0].update(blocks=[True]),
    lambda r: r['lessons'][0].update(teacher_ids='T1'),
    lambda r: r['lessons'][0].update(group_id='missing'),
    lambda r: r['bells'][0]['periods'][0].update(end=400),
    lambda r: r['bells'][0]['periods'][1].update(start=490),
    lambda r: r['teachers'][0].update(confirmed='false'),
    lambda r: r['aliases'].append(copy.deepcopy(r['aliases'][0])),
])
def test_invalid_input_rejected_without_silent_repair(mutate):
    raw = source()
    mutate(raw)
    with pytest.raises(ValueError):
        import_scenario(raw)


def test_plan_blocks_and_multiple_teachers_not_silently_corrected():
    raw = source()
    raw['teachers'].append({**raw['teachers'][0], 'id': 'T2'})
    raw['lessons'][0].update(blocks=[1], teacher_ids=['T2'])
    raw['sections'][0]['weekly_total'] = 3
    data = import_scenario(raw)
    codes = {f['code'] for f in data['meta']['import_audit']['blockers']}
    assert {'blocks_mismatch', 'plan_total_mismatch', 'assignment_ambiguous'} <= codes
    assert data['lessons'][0]['blocks'] == [1]


def test_no_alias_fuzzy_matching_and_no_shared_code_merge():
    raw = source()
    raw['lessons'][0]['teacher_aliases'] = ['other-file:T1']
    data = import_scenario(raw)
    assert data['lessons'][0]['teacher_ids'] == []
    assert any(f['code'] == 'alias_unknown' for f in data['meta']['import_audit']['blockers'])


def test_unsupported_rules_block_instead_of_being_ignored():
    raw = source()
    raw['constraints'] = [{'id': 'R1', 'type': 'made_up', 'source_ref': 'S1'}]
    assert solve(import_scenario(raw))['status'] == 'MODEL_INVALID'


def test_csv_export_and_json_are_semantically_identical(tmp_path):
    raw = source()
    teacher = raw.pop('teachers')
    (tmp_path / 'manifest.json').write_text(json.dumps(raw))
    with (tmp_path / 'teachers.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(teacher[0]))
        writer.writeheader()
        writer.writerows({k: json.dumps(v) if not isinstance(v, str) else v for k, v in t.items()} for t in teacher)
    loaded, digest = read_sources(tmp_path)
    assert loaded == source()
    assert len(digest) == 64
    assert import_scenario(loaded) == import_scenario(source())


def test_outputs_restricted_to_private_directory(tmp_path):
    with pytest.raises(ValueError):
        private_path(tmp_path / 'public.json')


def test_import_is_deterministic_and_does_not_mutate_sources():
    raw = source()
    before = copy.deepcopy(raw)
    assert import_scenario(raw) == import_scenario(raw)
    assert raw == before


def test_partial_import_api_remains_reviewable_and_never_proposes(fixture_client):
    raw = source()
    raw['bells'] = []
    data = import_scenario(raw)
    response = fixture_client.post('/api/import/json', json=data)
    assert response.status_code == 200
    version = response.json()['version']
    for _ in range(2):
        assert fixture_client.get('/api/state').json()['validation']['valid'] is False
        assert fixture_client.get('/api/diagnose').json()['ok'] is False
        result = fixture_client.post('/api/solve', json={'time_limit': 1}).json()
        assert result['status'] == 'MODEL_INVALID'
        assert 'proposal_id' not in result
        assert fixture_client.get('/api/state').json()['version'] == version
    exported = fixture_client.get('/api/export/json').json()
    assert exported['meta']['import_audit']['blockers']


def test_duplicate_json_keys_rejected(tmp_path):
    p = tmp_path / 'source.json'
    p.write_text('{"meta": {}, "meta": {"synthetic": true}}')
    with pytest.raises(ValueError, match='Duplicate JSON key'):
        read_sources(p)


def test_malformed_optional_tables_rejected():
    raw = source()
    raw['aliases'] = ['not an object']
    with pytest.raises(ValueError, match='aliases'):
        import_scenario(raw)
