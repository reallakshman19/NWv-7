#!/usr/bin/env python3
"""Independent release gate for bounded Buzz rolling JSON (no network)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from build_buzz_retained import (
    H, MAX_AGE, MAX_BYTES, MAX_ITEMS, OUTPUT, POLICY, REPORT, SKEW,
    RetentionRejected, deadlines, digest, identity, is_valid_story, is_withdrawn,
    json_bytes, millis,
)


def validate(snapshot: dict, report: dict, now: int) -> list[str]:
    errors = []
    if not isinstance(snapshot, dict):
        return ["not_a_json_object"]
    if (snapshot.get("schemaVersion") != 1 or snapshot.get("kind") != "buzz_rolling_retention"
        or snapshot.get("policyVersion") != POLICY["version"]):
        errors.append("wrong_contract")
    if snapshot.get("maxItems") != MAX_ITEMS or snapshot.get("maxBytes") != MAX_BYTES:
        errors.append("cap_manifest_mismatch")
    generated = millis(snapshot.get("generatedAt"))
    if not generated or generated > now + SKEW or now - generated > MAX_AGE:
        errors.append("stale_or_future_snapshot")
    if len(json_bytes(snapshot)) > MAX_BYTES:
        errors.append("snapshot_over_byte_budget")
    items = snapshot.get("items")
    if not isinstance(items, list) or len(items) > MAX_ITEMS or not items:
        return errors + ["invalid_item_count"]
    if snapshot.get("itemsSha256") != digest(items):
        errors.append("item_digest_mismatch")
    tombstones = snapshot.get("tombstones", [])
    if not isinstance(tombstones, list) or len(tombstones) > 500:
        errors.append("invalid_tombstone_pool")
        tombstones = []
    if snapshot.get("tombstonesSha256") != digest(tombstones):
        errors.append("tombstone_digest_mismatch")
    retired_keys = set()
    for tombstone in tombstones:
        if not isinstance(tombstone, dict) or not isinstance(tombstone.get("identity"), str):
            errors.append("invalid_tombstone")
            continue
        key = tombstone["identity"]
        removed = millis(tombstone.get("removedAt"))
        if key in retired_keys or not removed or removed > now + SKEW or now - removed > 7 * 24 * H:
            errors.append("invalid_tombstone_clock_or_duplicate")
        retired_keys.add(key)
    if any(identity(row) in retired_keys for row in items if isinstance(row, dict)):
        errors.append("withdrawn_item_resurrected")

    seen = set()
    for row in items:
        if not isinstance(row, dict):
            errors.append("non_object_item")
            continue
        key = identity(row)
        if not key or key in seen:
            errors.append("duplicate_or_missing_story_identity")
        seen.add(key)
        if not is_valid_story(row, now) or is_withdrawn(row):
            errors.append("invalid_story_or_tombstone_in_live")
        prior = row.get("retention") if isinstance(row.get("retention"), dict) else {}
        if prior != deadlines(row):
            errors.append("stored_lifecycle_deadline_mismatch")
        if millis(prior.get("displayUntil")) <= now:
            errors.append("expired_story_in_active")
        first = millis(row.get("firstSeenAt"))
        verified = millis(row.get("lastVerifiedAt"))
        if not first or not verified or verified < first or verified > generated + SKEW:
            errors.append("invalid_source_verification_clock")

    metrics = snapshot.get("metrics") if isinstance(snapshot.get("metrics"), dict) else {}
    if metrics.get("accepted") != len(items):
        errors.append("accepted_count_mismatch")
    if metrics.get("byCategory") != dict(sorted(__import__("collections").Counter(
            row.get("buzzSection") for row in items if isinstance(row, dict)).items())):
        errors.append("category_count_mismatch")
    if (metrics.get("eligibleBeforeCap", 0) - metrics.get("accepted", 0)
        != metrics.get("rejectedByCapacity")):
        errors.append("capacity_exclusion_count_mismatch")
    if metrics.get("snapshotBytes") != len(json_bytes(snapshot)):
        errors.append("snapshot_byte_counter_mismatch")
    if report.get("snapshotSha256") != __import__("hashlib").sha256(json_bytes(snapshot)).hexdigest():
        errors.append("receipt_sha256_mismatch")
    if report.get("policyVersion") != POLICY["version"]:
        errors.append("report_policy_mismatch")
    if report.get("metrics") != metrics:
        errors.append("report_metrics_mismatch")
    if report.get("status") not in ("PASS", "WARN"):
        errors.append("not_a_qualified_publication")
    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--now", type=int, default=None)
    args = parser.parse_args()
    try:
        snapshot = json.loads(args.input.read_text(encoding="utf-8"))
        report = json.loads(args.report.read_text(encoding="utf-8"))
        errors = validate(snapshot, report, args.now if args.now is not None else int(time.time() * 1000))
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f"BUZZ RETENTION FAIL: {exc}", file=sys.stderr)
        return 1
    if errors:
        print(f"BUZZ RETENTION FAIL: {errors}", file=sys.stderr)
        return 1
    print(f"BUZZ RETENTION PASS: {len(snapshot['items'])} verified active stories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
