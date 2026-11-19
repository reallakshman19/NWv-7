"""Validate public/data/up_ahead.json lifecycle contract.

Hard failures are limited to structural/contract breakage. Thin live data remains
WARN because static/browser fallback should preserve availability.
"""
from __future__ import annotations

import json
import time
import argparse
from collections import Counter
from pathlib import Path
from typing import Any
from enrich_upahead_contract import (
    DAY_MS, MAX_PENDING_BYTES, MAX_PENDING_ITEMS, PENDING_LOOKAHEAD_DAYS,
    lifecycle_for_item,
)

UP_AHEAD_PATH = Path("public/data/up_ahead.json")
REPORT_PATH = Path("public/data/up_ahead_quality_report.json")
SUMMARY_PATH = Path("public/data/up_ahead_quality_summary.md")

EXPECTED_CONTRACT_VERSION = "upahead-lifecycle-v1"
EXPECTED_LOOKAHEAD_DAYS = 7
EXPECTED_EVENT_PAST_GRACE_HOURS = 24
EXPECTED_PLANNER_PAST_GRACE_HOURS = 6
MIN_VISIBLE_ITEMS = 3
MAX_SNAPSHOT_AGE_MS = 12 * 3_600_000


def read_json(path: Path, fallback: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def validate_snapshot(snapshot: dict[str, Any], now_ms: int | None = None, *, require_acquisition=False) -> dict[str, Any]:
    ts = int(now_ms if now_ms is not None else time.time() * 1000)
    errors: list[str] = []
    warnings: list[str] = []
    items = snapshot.get("items") if isinstance(snapshot.get("items"), list) else []
    horizon = snapshot.get("horizon") if isinstance(snapshot.get("horizon"), dict) else {}
    lifecycle_summary = snapshot.get("lifecycleSummary") if isinstance(snapshot.get("lifecycleSummary"), dict) else {}

    if int(snapshot.get("schemaVersion") or 0) < 1:
        errors.append("schemaVersion is missing or invalid")
    if not int(snapshot.get("fetchedAt") or 0):
        errors.append("fetchedAt is missing or zero")
    else:
        age = ts - int(snapshot['fetchedAt'])
        if age < -300_000 or age > MAX_SNAPSHOT_AGE_MS:
            errors.append("Snapshot is stale or future-dated (maximum age 12 hours)")
    if not snapshot.get("contentHash"):
        errors.append("contentHash is missing")
    if snapshot.get("contractVersion") != EXPECTED_CONTRACT_VERSION:
        errors.append(f"contractVersion must be {EXPECTED_CONTRACT_VERSION}")
    pending = snapshot.get('pendingItems', [])
    if not isinstance(pending, list):
        errors.append('pendingItems must be an array')
        pending = []
    if len(pending) > MAX_PENDING_ITEMS or sum(len(json.dumps(row, ensure_ascii=False).encode('utf8')) for row in pending) > MAX_PENDING_BYTES:
        errors.append('Pending future pool exceeds bounded storage policy')
    for row in pending:
        if not isinstance(row, dict):
            errors.append('Invalid pending occurrence')
            continue
        current = lifecycle_for_item(row, ts)
        start = row.get('eventStartAt')
        if not current['isActionValid'] or current['isVisible'] or not isinstance(start, (int, float)) or not ts < start <= ts + PENDING_LOOKAHEAD_DAYS * DAY_MS:
            errors.append('Pending occurrence is expired, visible or outside its admission horizon')
    if snapshot.get('retention', {}).get('rejectedFutureCount'):
        warnings.append(f"{snapshot['retention']['rejectedFutureCount']} future occurrences rejected by storage limits")
    if not items:
        warnings.append("items[] is empty or missing")

    if horizon.get("lookaheadDays") != EXPECTED_LOOKAHEAD_DAYS:
        errors.append(f"horizon.lookaheadDays must be {EXPECTED_LOOKAHEAD_DAYS}")
    if horizon.get("eventPastGraceHours") != EXPECTED_EVENT_PAST_GRACE_HOURS:
        errors.append(f"horizon.eventPastGraceHours must be {EXPECTED_EVENT_PAST_GRACE_HOURS}")
    if horizon.get("plannerPastGraceHours") != EXPECTED_PLANNER_PAST_GRACE_HOURS:
        errors.append(f"horizon.plannerPastGraceHours must be {EXPECTED_PLANNER_PAST_GRACE_HOURS}")

    missing_lifecycle = []
    horizon_violations = []
    planner_grace_violations = []
    category_counts = Counter()
    class_counts = Counter()
    visible_count = 0
    planner_lifecycle_count = 0

    for item in items:
        if not isinstance(item, dict):
            continue
        category_counts[str(item.get("category") or "unknown")] += 1
        class_counts[str(item.get("contentClass") or "unknown")] += 1
        lifecycle = item.get("lifecycle") if isinstance(item.get("lifecycle"), dict) else None
        if not lifecycle:
            missing_lifecycle.append(item.get("id") or item.get("url") or item.get("title") or "unknown")
            continue
        current = lifecycle_for_item(item, ts)
        if current.get("isVisible"):
            visible_count += 1
        if current.get("plannerEligibleByLifecycle"):
            planner_lifecycle_count += 1
        if item.get("eventStartAt") and current.get("withinSevenDayHorizon") is not True:
            horizon_violations.append(item.get("id") or item.get("title") or "unknown")
        if item.get("plannerEligible") and lifecycle.get("plannerPastGraceHours") != EXPECTED_PLANNER_PAST_GRACE_HOURS:
            planner_grace_violations.append(item.get("id") or item.get("title") or "unknown")

    if missing_lifecycle:
        errors.append(f"{len(missing_lifecycle)} items missing lifecycle metadata")
    if visible_count == 0:
        errors.append("No currently active Up Ahead items; publication is unusable")
    acquisition = snapshot.get('acquisitionSummary') or {}
    if require_acquisition and not acquisition:
        errors.append('Missing acquisition evidence')
    if acquisition and not acquisition.get('successfulSources'):
        errors.append('All acquisition sources failed')
    if acquisition.get('failedSources'):
        warnings.append(f"{acquisition['failedSources']} acquisition sources failed; coverage is partial")
    for category, row in acquisition.get('byCategory', {}).items():
        if not row.get('successfulSources'):
            warnings.append(f'{category}: acquisition unavailable')
        elif not category_counts.get(category):
            warnings.append(f'{category}: no currently active items')
    if horizon_violations:
        errors.append(f"{len(horizon_violations)} dated items outside Up Ahead 7-day horizon")
    if planner_grace_violations:
        errors.append(f"{len(planner_grace_violations)} planner items missing 6h planner grace")
    if visible_count < MIN_VISIBLE_ITEMS and items:
        warnings.append(f"Thin visible Up Ahead pool: {visible_count} visible items < recommended {MIN_VISIBLE_ITEMS}")
    if lifecycle_summary.get("horizonViolationCount", 0):
        errors.append("lifecycleSummary reports horizon violations")

    status = "FAIL" if errors else "WARN" if warnings else "PASS"
    return {
        "status": status,
        "generatedAt": ts,
        "schemaVersion": snapshot.get("schemaVersion", 0),
        "contractVersion": snapshot.get("contractVersion", ""),
        "fetchedAt": snapshot.get("fetchedAt", 0),
        "contentHash": snapshot.get("contentHash", ""),
        "itemCount": len(items),
        "pendingItemCount": len(pending),
        "visibleItemCount": visible_count,
        "plannerEligibleByLifecycleCount": planner_lifecycle_count,
        "categoryCounts": dict(sorted(category_counts.items())),
        "contentClassCounts": dict(sorted(class_counts.items())),
        "horizon": horizon,
        "lifecycleSummary": lifecycle_summary,
        "errors": errors,
        "warnings": warnings,
        "thresholds": {
            "lookaheadDays": EXPECTED_LOOKAHEAD_DAYS,
            "eventPastGraceHours": EXPECTED_EVENT_PAST_GRACE_HOURS,
            "plannerPastGraceHours": EXPECTED_PLANNER_PAST_GRACE_HOURS,
            "minVisibleItems": MIN_VISIBLE_ITEMS,
            "maxSnapshotAgeMs": MAX_SNAPSHOT_AGE_MS,
        },
    }


def write_summary(report: dict[str, Any]) -> None:
    lines = [
        "# Up Ahead Prefetch Quality Report",
        "",
        f"- Status: **{report['status']}**",
        f"- Contract: `{report.get('contractVersion') or 'n/a'}`",
        f"- Items: `{report['itemCount']}`",
        f"- Visible items: `{report['visibleItemCount']}`",
        f"- Planner lifecycle eligible: `{report['plannerEligibleByLifecycleCount']}`",
        f"- Lookahead days: `{report.get('horizon', {}).get('lookaheadDays', 'n/a')}`",
        f"- Planner past grace hours: `{report.get('horizon', {}).get('plannerPastGraceHours', 'n/a')}`",
        "",
        "## Category counts",
        "",
    ]
    lines += [f"- {key}: {count}" for key, count in report.get("categoryCounts", {}).items()]
    if report["errors"]:
        lines += ["", "## Errors", ""] + [f"- {item}" for item in report["errors"]]
    if report["warnings"]:
        lines += ["", "## Warnings", ""] + [f"- {item}" for item in report["warnings"]]
    SUMMARY_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--require-acquisition', action='store_true')
    args = parser.parse_args()
    snapshot = read_json(UP_AHEAD_PATH, {})
    report = validate_snapshot(snapshot, require_acquisition=args.require_acquisition)
    write_json(REPORT_PATH, report)
    write_summary(report)
    print(json.dumps({
        "status": report["status"],
        "itemCount": report["itemCount"],
        "visibleItemCount": report["visibleItemCount"],
        "plannerEligibleByLifecycleCount": report["plannerEligibleByLifecycleCount"],
        "errors": report["errors"],
        "warnings": report["warnings"],
    }, indent=2))
    return 1 if report["status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
