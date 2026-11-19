import json
import time

from insight_json_contract import (
    COLLECTOR_VERSION,
    build_angle_coverage,
    build_event_sketches,
    compute_snapshot_content_hash,
    infer_angle_hints,
    optimize_insight_snapshot,
    build_story_signals,
)


def sample_story(idx, title, summary, source_group="source_a", slot="now"):
    return {
        "id": f"story-{idx}",
        "title": title,
        "summary": summary,
        "url": f"https://example.com/{idx}",
        "publishedAt": int(time.time() * 1000) - idx * 1000,
        "source": source_group,
        "sourceGroup": source_group,
        "fetchedForSlots": [slot],
    }


def test_angle_hints_detect_official_market_and_public():
    official = infer_angle_hints(sample_story(
        1,
        "Finance Ministry says Acme Bank outage is under review",
        "Officials said the regulator asked for a statement",
    ))

    market = infer_angle_hints(sample_story(
        2,
        "Acme Bank shares fell as investors reacted",
        "Market trading fell 4 percent",
    ))

    public = infer_angle_hints(sample_story(
        3,
        "Customers criticise Acme Bank after outage goes viral",
        "Users and residents reacted online",
    ))

    assert official[0]["angle"] == "official_response"
    assert market[0]["angle"] == "market_reaction"
    assert public[0]["angle"] == "reaction_public"


def test_headline_subject_is_not_displaced_by_repeated_reaction_summary():
    signals = build_story_signals(sample_story(1, 'Acme Bank outage shares fell', 'Shares fell as shares fell in trading'))
    assert signals['topicTokens'][:3] == ['acme', 'bank', 'outage']
    other = build_story_signals(sample_story(2, 'Zenith Bank outage shares fell', 'Shares fell as shares fell in trading'))
    assert other['topicTokens'][:3] == ['zenith', 'bank', 'outage']


def test_sharing_a_weather_forecast_does_not_invent_market_reaction():
    hints = infer_angle_hints(sample_story(1, 'Expert shares Chennai rain forecast', 'Water rose after intense rain; Observer publishes a forecast'))
    assert all(hint['angle'] != 'market_reaction' for hint in hints)


def test_event_sketches_capture_repeated_topic_sources_and_angles():
    ts = int(time.time() * 1000)
    snapshot = {
        "schemaVersion": 2,
        "fetchedAt": ts,
        "slotMeta": {
            "now": {"fetchedAt": ts, "storyIds": ["story-1", "story-2", "story-3"]},
            "minus4h": {"fetchedAt": ts, "storyIds": []},
            "minus12h": {"fetchedAt": ts, "storyIds": []},
            "minus24h": {"fetchedAt": ts, "storyIds": []},
        },
        "stories": [
            sample_story(1, "Acme Bank outage customers criticise service", "Users criticise Acme Bank outage", "local"),
            sample_story(2, "Acme Bank outage ministry says regulator reviewing", "Officials said Acme Bank outage is under review", "gov"),
            sample_story(3, "Acme Bank outage shares fell as investors reacted", "Shares fell as market reacted", "market"),
        ],
    }
    optimized = optimize_insight_snapshot(snapshot, ts)
    sketches = optimized["eventSketches"]

    assert sketches
    first = sketches[0]
    assert first["storyCount"] >= 3
    assert first["sourceGroupCount"] >= 3
    assert first["angleCount"] >= 2
    assert optimized["angleCoverage"]["nonBaseStoryCount"] >= 3
    assert optimized["richnessSummary"]["eventSketchCount"] >= 1


def test_angle_coverage_counts_non_base_ratio():
    ts = int(time.time() * 1000)
    optimized = optimize_insight_snapshot({
        "schemaVersion": 2,
        "fetchedAt": ts,
        "slotMeta": {slot: {"fetchedAt": ts, "storyIds": []} for slot in ["now", "minus4h", "minus12h", "minus24h"]},
        "stories": [
            sample_story(1, "Finance Ministry says update", "Officials said statement", "gov"),
            sample_story(2, "Plain headline with no signal", "Plain summary", "wire"),
        ],
    }, ts)
    coverage = build_angle_coverage(optimized["stories"])
    assert coverage["storyCount"] == 2
    assert coverage["nonBaseStoryCount"] >= 1
    assert 0 < coverage["nonBaseRatio"] <= 1


def test_optimized_snapshot_has_schema_v3_quality_and_stable_hash():
    ts = int(time.time() * 1000)
    snapshot = {
        "schemaVersion": 2,
        "fetchedAt": ts,
        "slotMeta": {
            "now": {"fetchedAt": ts, "storyIds": ["story-1", "story-2"]},
            "minus4h": {"fetchedAt": ts, "storyIds": []},
            "minus12h": {"fetchedAt": ts, "storyIds": []},
            "minus24h": {"fetchedAt": ts, "storyIds": []},
        },
        "stories": [
            sample_story(1, "Finance Ministry says Acme Bank outage is under review", "Officials said regulator asked for statement", "gov"),
            sample_story(2, "Acme Bank shares fell as investors reacted", "Shares fell 4 percent", "market"),
        ],
    }

    optimized = optimize_insight_snapshot(snapshot, ts)
    hash_a = compute_snapshot_content_hash(optimized["stories"])
    hash_b = compute_snapshot_content_hash(json.loads(json.dumps(optimized["stories"])))

    assert optimized["schemaVersion"] == 3
    assert optimized["collectorVersion"] == COLLECTOR_VERSION
    assert optimized["slotQuality"]["now"]["storyCount"] == 2
    assert optimized["sourceDiversity"]["sourceGroupCount"] == 2
    assert "angleCoverage" in optimized
    assert "eventSketches" in optimized
    assert "richnessSummary" in optimized
    assert optimized["contentHash"] == hash_a
    assert hash_a == hash_b
