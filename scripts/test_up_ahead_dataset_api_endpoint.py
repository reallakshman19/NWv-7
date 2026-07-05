import json
import os
import tempfile

import server


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f'{message}: expected {expected!r}, got {actual!r}')


def test_endpoint_mapping():
    assert_equal(server.UP_AHEAD_DATASET_ENDPOINT, '/api/datasets/upAhead', 'endpoint path mismatch')
    assert_equal(
        server.DATASET_API_FILES[server.UP_AHEAD_DATASET_ENDPOINT],
        server.UP_AHEAD_DATASET_FILE,
        'endpoint file mapping mismatch'
    )
    assert server.UP_AHEAD_DATASET_FILE.endswith(os.path.join('public', 'data', 'up_ahead.json'))


def test_existing_api_mappings_preserved():
    expected = {
        '/api/settings',
        '/api/blacklist',
        '/api/user_plan',
        '/api/market_snapshot',
    }
    assert expected.issubset(set(server.API_FILES.keys()))


def test_missing_dataset_fallback_shape():
    with tempfile.TemporaryDirectory() as tmpdir:
        missing = os.path.join(tmpdir, 'missing_up_ahead.json')
        payload = server.get_up_ahead_dataset_payload(missing)

    assert_equal(payload['timeline'], [], 'fallback timeline mismatch')
    assert_equal(payload['sections'], {}, 'fallback sections mismatch')
    assert_equal(payload['weekly_plan'], [], 'fallback weekly_plan mismatch')
    assert_equal(payload['lastUpdated'], None, 'fallback lastUpdated mismatch')
    assert_equal(payload['dropReport'], [], 'fallback dropReport mismatch')
    assert_equal(
        payload['auditSummary']['fallback'],
        'missing_or_invalid_up_ahead_dataset',
        'fallback auditSummary mismatch'
    )


def test_invalid_json_fallback_shape():
    with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as file:
        file.write('{invalid json')
        path = file.name
    try:
        payload = server.get_up_ahead_dataset_payload(path)
    finally:
        os.unlink(path)

    assert_equal(payload['sections'], {}, 'invalid JSON fallback sections mismatch')
    assert 'fallback' in payload['auditSummary']


def test_valid_json_returned():
    expected = {
        'timeline': [],
        'sections': {'events': [{'title': 'Test'}]},
        'weekly_plan': [],
        'lastUpdated': '2026-07-05T00:00:00Z',
        'auditSummary': {'ok': True},
        'dropReport': [],
    }
    with tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8') as file:
        json.dump(expected, file)
        path = file.name
    try:
        payload = server.get_up_ahead_dataset_payload(path)
    finally:
        os.unlink(path)

    assert_equal(payload, expected, 'valid dataset payload mismatch')


if __name__ == '__main__':
    test_endpoint_mapping()
    test_existing_api_mappings_preserved()
    test_missing_dataset_fallback_shape()
    test_invalid_json_fallback_shape()
    test_valid_json_returned()
    print('PASS: Up Ahead dataset API endpoint contract')
