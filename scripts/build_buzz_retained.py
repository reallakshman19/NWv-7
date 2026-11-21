#!/usr/bin/env python3
"""Build a bounded, expiry-aware Buzz-only rolling JSON from verified Sections RSS.

Sections authority and the Cloudflare shadow mirror are deliberately untouched.
A repository refresh, cache replay or missing feed does not renew publisher evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

from sections_news_identity import canonical_news_url

ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / "config/buzz_retention_policy.json").read_text(encoding="utf-8"))
INPUT = ROOT / "public/newsdata/sections_latest.json"
OUTPUT = ROOT / "public/newsdata/buzz_retained_latest.json"
REPORT = ROOT / "public/newsdata/buzz_retention_report.json"
H = 3_600_000
DAY = 24 * H
BUZZ_SECTIONS = ("entertainment", "technology", "social")
SOURCE_SECTIONS = {"entertainment": "entertainment", "technology": "technology",
                   "social": "social", "world": "social", "india": "social",
                   "tn": "social", "trichy": "social", "muscat": "social"}
TREND_SIGNAL = re.compile(r"\b(?:viral|trending|social media|social network|online trend|internet sensation)\b", re.I)
BLOCKED_CONFIDENCE = {"low", "unknown", "fallback"}
BLOCKED_TIMESTAMP_SOURCE = {"missing", "invalid", "fetch_time_fallback", "fetch_fallback", "fetchedat", "unknown"}
WITHDRAWAL = {"withdrawn", "retracted", "removed", "cancelled", "canceled"}
SOCIAL_CAP = int(POLICY["socialMaximumDisplayHours"]) * H
MAX_CAP = int(POLICY["maximumDisplayHours"]) * H
FRESH = int(POLICY["freshHours"]) * H
RENEW = int(POLICY["renewalHours"]) * H
MAX_AGE = int(POLICY["maxSnapshotAgeHours"]) * H
SKEW = int(POLICY["futureSkewMinutes"]) * 60_000
MAX_ITEMS = int(POLICY["maxItems"])
MAX_BYTES = int(POLICY["maxSnapshotBytes"])


class RetentionRejected(ValueError):
    pass


def millis(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        n = int(value)
    except (ValueError, TypeError, OverflowError):
        return 0
    return n * 1000 if 0 < n < 10_000_000_000 else n if n > 0 else 0


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def digest(items: list[dict]) -> str:
    return hashlib.sha256(json.dumps(items, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def is_withdrawn(item: dict) -> bool:
    return bool(item.get("suppressionReason") or item.get("withdrawnAt")
                or str(item.get("status") or "").lower() in WITHDRAWAL)


def source_rows(snapshot: dict, now: int) -> tuple[list[dict], dict]:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("sections"), dict):
        return [], {"eligible": False, "reason": "missing_sections"}
    clock = millis(snapshot.get("fetchedAt"))
    age = now - clock
    if not clock or age < -SKEW or age > MAX_AGE or int(snapshot.get("schemaVersion") or 0) not in (1, 2):
        return [], {"eligible": False, "reason": "stale_or_invalid_sections_clock"}
    rows: list[dict] = []
    for section, bucket in snapshot["sections"].items():
        destination = SOURCE_SECTIONS.get(section)
        if not destination or not isinstance(bucket, list):
            continue
        for original in bucket:
            if not isinstance(original, dict):
                continue
            if destination == "social" and section not in ("social",) and not TREND_SIGNAL.search(
                    " ".join(str(original.get(k) or "") for k in ("title", "summary"))):
                continue
            item = dict(original)
            item["buzzSection"] = destination
            item["sourceSection"] = section
            rows.append(item)
    return rows, {"eligible": True, "reason": "publisher_snapshot",
                  "fetchedAt": clock, "contentHash": snapshot.get("contentHash") or "",
                  "qualifiedInputRows": len(rows)}


def identity(item: dict) -> str:
    category = str(item.get("buzzSection") or "")
    url = canonical_news_url(item.get("url") or item.get("link") or "")
    return f"{category}:{url}" if category in BUZZ_SECTIONS and url else ""


def is_valid_story(item: dict, now: int) -> bool:
    if not isinstance(item, dict) or not identity(item):
        return False
    if not str(item.get("title") or "").strip():
        return False
    published = millis(item.get("publishedAt"))
    if not published or published > now + SKEW or now - published > MAX_CAP:
        return False
    if str(item.get("timestampConfidence") or "").lower() in BLOCKED_CONFIDENCE:
        return False
    if str(item.get("publishedAtSource") or "").lower() in BLOCKED_TIMESTAMP_SOURCE:
        return False
    return True


def deadlines(item: dict) -> dict:
    published = millis(item["publishedAt"])
    verified = millis(item.get("lastVerifiedAt"))
    cap = SOCIAL_CAP if item["buzzSection"] == "social" else MAX_CAP
    base_until = published + FRESH
    renewed_until = verified + RENEW if verified else base_until
    display_until = min(published + cap, max(base_until, renewed_until))
    explicit = millis(item.get("expiryAt")) or millis(item.get("withdrawnAt"))
    if explicit:
        display_until = min(display_until, explicit)
    return {"freshUntil": base_until, "displayUntil": display_until,
            "archiveUntil": display_until + 7 * DAY,
            "expiryReason": "explicit_expiry" if explicit and display_until == explicit
            else "verified_renewal" if display_until > base_until else "36h_default"}


def make_row(item: dict, old: dict | None, source_time: int, now: int) -> dict:
    row = {k: v for k, v in item.items() if not k.startswith("_")}
    # A publisher update for the same canonical URL does not rewrite the
    # original published time or first-known identity.
    if old:
        row["publishedAt"] = old["publishedAt"]
        row["firstSeenAt"] = old["firstSeenAt"]
        row["lastVerifiedAt"] = max(millis(old.get("lastVerifiedAt")), source_time)
    else:
        row["firstSeenAt"] = source_time
        row["lastVerifiedAt"] = source_time
    row["retention"] = deadlines(row)
    return row


def priority(item: dict) -> tuple:
    category = str(item.get("buzzSection") or "")
    return (-millis(item.get("publishedAt")),
            -millis(item.get("lastVerifiedAt")), category, identity(item))


def envelope(items: list[dict], now: int, latest: dict, metrics: dict) -> dict:
    return {"schemaVersion": 1, "kind": "buzz_rolling_retention",
            "policyVersion": POLICY["version"], "generatedAt": now,
            "source": latest, "freshHours": POLICY["freshHours"],
            "maxDisplayHours": POLICY["maximumDisplayHours"],
            "maxItems": MAX_ITEMS, "maxBytes": MAX_BYTES,
            "items": items, "itemsSha256": digest(items),
            "metrics": metrics}


def bound(items: list[dict], now: int, latest: dict) -> tuple[dict, dict]:
    by_cat = {section: sorted((x for x in items if x["buzzSection"] == section), key=priority)
              for section in BUZZ_SECTIONS}
    selected: list[dict] = []
    used: set[str] = set()
    for category in BUZZ_SECTIONS:
        for row in by_cat[category][:int(POLICY["categorySoftCaps"][category])]:
            if len(selected) >= MAX_ITEMS:
                break
            selected.append(row)
            used.add(identity(row))
    for row in sorted(items, key=priority):
        if len(selected) >= MAX_ITEMS:
            break
        if identity(row) not in used:
            selected.append(row)
            used.add(identity(row))

    # The cap is for the actual pretty-printed JSON bytes, not an estimate.
    # Drop oldest/lowest-priority non-protected rows deterministically.
    omitted_by_size = 0
    while True:
        chosen = sorted(selected, key=priority)
        counts = dict(sorted(Counter(x["buzzSection"] for x in chosen).items()))
        metrics = {"accepted": len(chosen), "eligibleBeforeCap": len(items),
                   "rejectedByCapacity": len(items) - len(chosen),
                   "byCategory": counts,
                   "rejectedByCategory": dict(sorted(Counter(
                       x["buzzSection"] for x in items if identity(x) not in {identity(y) for y in chosen}
                   ).items())), "rejectedByBytes": omitted_by_size}
        result = envelope(chosen, now, latest, metrics)
        size = len(json_bytes(result))
        if size <= MAX_BYTES:
            metrics["snapshotBytes"] = size
            # Account for the inserted size counter itself.
            result = envelope(chosen, now, latest, metrics)
            size = len(json_bytes(result))
            metrics["snapshotBytes"] = size
            result = envelope(chosen, now, latest, metrics)
            if len(json_bytes(result)) <= MAX_BYTES:
                return result, metrics
        if not selected:
            raise RetentionRejected("snapshot_metadata_exceeds_3MB")
        selected.sort(key=priority)
        selected.pop()
        omitted_by_size += 1


def build(current: dict, previous: dict, now: int) -> tuple[dict, dict]:
    observed, source = source_rows(current, now)
    existing = previous.get("items", []) if isinstance(previous, dict) else []
    if existing and (previous.get("kind") != "buzz_rolling_retention"
                     or previous.get("policyVersion") != POLICY["version"]
                     or previous.get("itemsSha256") != digest(existing)):
        raise RetentionRejected("invalid_or_tampered_predecessor")
    if not isinstance(existing, list):
        raise RetentionRejected("previous_items_not_array")
    survivors: dict[str, dict] = {}
    for raw in existing:
        if not isinstance(raw, dict) or is_withdrawn(raw) or not is_valid_story(raw, now):
            continue
        row = dict(raw)
        row["retention"] = deadlines(row)
        if now < row["retention"]["displayUntil"]:
            survivors[identity(row)] = row

    source_clock = int(source.get("fetchedAt") or 0)
    # Only observations from a newer source epoch can renew lastVerifiedAt.
    # A repeated snapshot can supply new rows only on an empty bootstrap.
    prev_source_clock = millis(previous.get("source", {}).get("fetchedAt")) if isinstance(previous, dict) else 0
    refreshed = 0
    withdrawals = 0
    if source["eligible"] and source_clock >= prev_source_clock:
        for item in observed:
            key = identity(item)
            if not key:
                continue
            if is_withdrawn(item):
                survivors.pop(key, None)
                withdrawals += 1
                continue
            if not is_valid_story(item, now):
                continue
            old = survivors.get(key)
            if source_clock == prev_source_clock and old is not None:
                continue
            row = make_row(item, old, source_clock, now)
            if now < row["retention"]["displayUntil"]:
                survivors[key] = row
                refreshed += 1

    all_eligible = list(survivors.values())
    snapshot, metrics = bound(all_eligible, now, source)
    if not snapshot["items"]:
        raise RetentionRejected("no_eligible_buzz_items_keep_last_qualified_release")
    report = {"schemaVersion": 1, "status": "WARN" if not source["eligible"] or metrics["rejectedByCapacity"] else "PASS",
              "generatedAt": now, "policyVersion": POLICY["version"],
              "source": source, "sourceReverifiedRows": refreshed,
              "explicitWithdrawals": withdrawals,
              "retainedAcrossSourceGap": sum(1 for x in snapshot["items"]
                                               if millis(x.get("lastVerifiedAt")) < source_clock or not source["eligible"]),
              "metrics": metrics,
              "snapshotSha256": hashlib.sha256(json_bytes(snapshot)).hexdigest()}
    return snapshot, report


def write_atomic(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json_bytes(payload)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", type=Path, default=INPUT)
    parser.add_argument("--existing", type=Path, default=OUTPUT)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--now", type=int, default=None)
    args = parser.parse_args()
    try:
        now = args.now if args.now is not None else int(time.time() * 1000)
        current = json.loads(args.current.read_text(encoding="utf-8"))
        previous = json.loads(args.existing.read_text(encoding="utf-8")) if args.existing.exists() else {}
        snapshot, report = build(current, previous, now)
        if len(json_bytes(report)) > int(POLICY["maxReportBytes"]):
            raise RetentionRejected("report_exceeds_byte_budget")
        write_atomic(args.out, snapshot)
        write_atomic(args.report, report)
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        print(f"BUZZ RETENTION HOLD: {exc}", file=sys.stderr)
        return 1
    print(f"BUZZ RETENTION {report['status']}: {report['metrics']['accepted']} eligible; "
          f"{report['metrics']['rejectedByCapacity']} capacity exclusions; {report['metrics']['snapshotBytes']} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
