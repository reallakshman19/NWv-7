import validate_insight_prefetch_output as gate

NOW_MS = 1767282000000


def make_story(index, angle="official_response", source_group="source_a"):
    return {
        "id": f"story-{index}",
        "title": f"Acme Bank outage story {index}",
        "summary": "Officials said investors and users reacted to the outage.",
        "url": f"https://example.com/{index}",
        "publishedAt": NOW_MS - index * 1000,
        "source": source_group,
        "sourceGroup": source_group,
        "angleHints": [{"angle": angle, "score": 0.9}],
        "storySignals": {
            "topicTokens": ["acme", "bank", "outage"],
            "numbers": ["4 percent"],
            "angleHints": [{"angle": angle, "score": 0.9}],
        },
    }


def make_rich_snapshot(story_count=30):
    stories = [
        make_story(
            i,
            angle="official_response" if i % 2 == 0 else "market_reaction",
            source_group=f"source_{i % 6}",
        )
        for i in range(story_count)
    ]
    return {
        "schemaVersion": 3,
        "collectorVersion": "insight-collector-json-v4",
        "contentHash": "abc123",
        "fetchedAt": NOW_MS,
        "slotMeta": {
            "now": {"fetchedAt": NOW_MS, "storyIds": [s["id"] for s in stories[:10]]},
            "minus4h": {"fetchedAt": NOW_MS, "storyIds": [s["id"] for s in stories[10:18]]},
            "minus12h": {"fetchedAt": NOW_MS, "storyIds": [s["id"] for s in stories[18:24]]},
            "minus24h": {"fetchedAt": NOW_MS, "storyIds": [s["id"] for s in stories[24:30]]},
        },
        "slotQuality": {
            slot: {"storyCount": 6, "sourceGroupCount": 3, "thin": False, "fetchedAt": NOW_MS}
            for slot in gate.SLOT_ORDER
        },
        "sourceDiversity": {
            "sourceGroupCount": 6,
            "topSources": [{"sourceGroup": f"source_{i}", "count": 5} for i in range(6)],
        },
        "angleCoverage": {
            "storyCount": story_count,
            "nonBaseStoryCount": story_count,
            "nonBaseRatio": 1,
            "angleCount": 2,
            "topAngles": [{"angle": "official_response", "count": 15}],
        },
        "eventSketches": [
            {"id": "sketch-1", "storyCount": 10, "sourceGroupCount": 3, "angleCount": 2},
            {"id": "sketch-2", "storyCount": 8, "sourceGroupCount": 2, "angleCount": 2},
            {"id": "sketch-3", "storyCount": 4, "sourceGroupCount": 1, "angleCount": 1},
        ],
        "richnessSummary": {
            "storyCount": story_count,
            "eventSketchCount": 3,
            "multiSourceSketchCount": 2,
            "multiAngleSketchCount": 2,
            "hasClusterablePool": True,
        },
        "stories": stories,
    }


def test_validate_snapshot_passes_structural_contract():
    report = gate.validate_snapshot(make_rich_snapshot(), NOW_MS)
    assert report["status"] in ("PASS", "WARN")
    assert report["schemaVersion"] == 3
    assert report["storyCount"] == 30
    assert report["sourceGroupCount"] >= 5
    assert report["angleHintCoverage"] >= 0.35
    assert report["eventSketchCount"] == 3
    assert report["multiSourceEventSketchCount"] == 2
    assert not report["errors"]


def test_validate_schema_v3_fails_missing_required_quality_fields():
    snapshot = make_rich_snapshot()
    snapshot.pop("slotQuality")
    snapshot.pop("sourceDiversity")
    snapshot.pop("angleCoverage")
    report = gate.validate_snapshot(snapshot, NOW_MS)
    assert report["status"] == "FAIL"
    assert any("slotQuality" in error for error in report["errors"])
    assert any("sourceDiversity" in error for error in report["errors"])
    assert any("angleCoverage" in error for error in report["errors"])


def test_validate_schema_v3_warns_missing_event_sketches_not_fail():
    snapshot = make_rich_snapshot()
    snapshot.pop("eventSketches")
    snapshot.pop("richnessSummary")
    report = gate.validate_snapshot(snapshot, NOW_MS)
    assert report["status"] == "WARN"
    assert not report["errors"]
    assert any("eventSketches" in warning for warning in report["warnings"])
    assert any("richnessSummary" in warning for warning in report["warnings"])


def test_validate_snapshot_fails_missing_core_fields():
    report = gate.validate_snapshot({
        "schemaVersion": 99,
        "stories": [],
        "fetchedAt": 0,
        "contentHash": "",
    }, NOW_MS)

    assert report["status"] == "FAIL"
    assert report["errors"]


def test_write_summary_creates_markdown(tmp_path, monkeypatch):
    report_path = tmp_path / "insight_quality_report.json"
    summary_path = tmp_path / "insight_quality_summary.md"

    monkeypatch.setattr(gate, "REPORT_PATH", report_path)
    monkeypatch.setattr(gate, "SUMMARY_PATH", summary_path)

    report = gate.validate_snapshot(make_rich_snapshot(), NOW_MS)
    gate.write_json(report_path, report)
    gate.write_summary(report)

    assert report_path.exists()
    assert summary_path.exists()
    text = summary_path.read_text()
    assert "Insight Prefetch Quality Report" in text
    assert "Event sketches" in text
    assert "Multi-source sketches" in text


def test_validator_uses_insight_health_without_sections_diagnostic_leakage(tmp_path, monkeypatch):
    import json
    health_dir = tmp_path / 'public/newsdata'
    health_dir.mkdir(parents=True)
    (health_dir / 'source_health.json').write_text(json.dumps({'sources': {
        'unrelated_sections_source': {'zeroItemRuns': 500},
    }}))
    (health_dir / 'insight_source_health.json').write_text(json.dumps({'sources': {
        'insight_empty_source': {'zeroItemRuns': 4},
    }}))
    monkeypatch.chdir(tmp_path)
    report = gate.validate_snapshot(make_rich_snapshot(), NOW_MS)
    assert not any('unrelated_sections_source' in warning for warning in report['warnings'])
    assert any('insight_empty_source' in warning for warning in report['warnings'])
