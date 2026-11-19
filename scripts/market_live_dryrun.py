"""Source-first, single-pass India-market live diagnostic without publication.

The entire candidate remains in process memory and a private temporary directory.
Only non-price health/status metadata is retained; provider permission is never inferred.
This module is operational, not a license to collect or distribute third-party feeds.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import quote

from refresh_india_market import INDICES, STOCKS, BSE, NAV, NFO, acquire, get, iso, validate

ROOT = Path(__file__).resolve().parent.parent
REQUEST_BUDGET = 25
ALLOWED_URLS = frozenset(
    [f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?range=5d&interval=1d"
     for symbol in [*INDICES.values(), *(f"{stock}.NS" for stock in STOCKS)]]
    + [NAV, BSE, NFO]
)
if len(ALLOWED_URLS) != REQUEST_BUDGET:
    raise RuntimeError("The allowlist must contain exactly 25 distinct acquisition URLs")


class BudgetExceeded(RuntimeError):
    pass


class BoundedGetter:
    def __init__(self, getter=get):
        self.getter = getter
        self.lock = threading.Lock()
        self.attempted = set()
        self.attempt_count = 0
        self.denied = 0

    def __call__(self, url):
        with self.lock:
            if url not in ALLOWED_URLS or url in self.attempted or self.attempt_count >= REQUEST_BUDGET:
                self.denied += 1
                raise BudgetExceeded("Disallowed, duplicate, or over-budget acquisition")
            self.attempted.add(url)
            self.attempt_count += 1
        return self.getter(url)


def classify_failure(message):
    """Classify failures without retaining URL, exception body, or quote values."""
    text = str(message or "").lower()
    if "429" in text or "too many requests" in text:
        return "HTTP_429"
    if "403" in text or "forbidden" in text:
        return "HTTP_403"
    if "401" in text or "unauthorized" in text:
        return "HTTP_401"
    if "404" in text or "not found" in text:
        return "HTTP_404"
    if any(word in text for word in ("timeout", "timed out", "readtimeout")):
        return "TIMEOUT"
    if any(word in text for word in ("ssl", "certificate", "proxyerror", "connectionerror", "connection aborted")):
        return "TRANSPORT_FAILURE"
    if any(word in text for word in ("timestamp", "older than five", "future-dated", "previous daily close")):
        return "SOURCE_CLOCK_OR_CLOSE"
    if any(word in text for word in ("json", "expecting value", "parse", "headings", "not aligned", "supported table", "xml")):
        return "PARSE_OR_SCHEMA"
    if "4 mb" in text or "four mb" in text:
        return "BODY_LIMIT"
    return "OTHER_SOURCE_FAILURE"


def clock_range(rows):
    clocks = sorted(row.get("quoteAt") for row in rows if isinstance(row.get("quoteAt"), str))
    return {"oldestAt": clocks[0] if clocks else None,
            "newestAt": clocks[-1] if clocks else None}


def read_only_readiness(snapshot, now, node="node"):
    # Source data must never leave the runner, including the action artifact.
    with tempfile.TemporaryDirectory(prefix="nw7-market-private-") as directory:
        private = Path(directory) / "candidate.json"
        private.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        command = [node, str(ROOT / "scripts/check_market_publication_readiness.mjs"),
                   "--snapshot", str(private), "--now", iso(now)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=20, check=False)
        if result.returncode != 0:
            return {"technicalStatus": "HOLD", "releaseStatus": "HOLD",
                    "blocks": [{"code": "READINESS_EXECUTION_FAILED", "detail": "Read-only checker unavailable"}]}
        parsed = json.loads(result.stdout)
        return {
            "technicalStatus": parsed.get("technicalStatus", "HOLD"),
            "releaseStatus": parsed.get("releaseStatus", "HOLD"),
            "counts": parsed.get("counts", {}),
            "blocks": parsed.get("blocks", []),
            "notes": parsed.get("notes", []),
            "manualBlocks": parsed.get("manualBlocks", []),
        }


def run(now=None, getter=get, node="node"):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Dry-run collection clock must carry a timezone")
    budget = BoundedGetter(getter)
    start = time.monotonic()
    try:
        candidate = acquire(now, budget)
    except Exception:
        # Never log unredacted provider exceptions or response bodies.
        return {"diagnosticVersion": "market-live-dryrun-v1", "checkedAt": iso(now),
                "dryRun": True, "published": False, "candidateRetained": False,
                "requests": {"maximum": REQUEST_BUDGET, "attempted": budget.attempt_count,
                             "denied": budget.denied},
                "status": "PROBE_ERROR", "technicalStatus": "HOLD", "releaseStatus": "HOLD",
                "failureClass": "ACQUISITION_EXECUTION_FAILED",
                "elapsedMs": int((time.monotonic()-start)*1000)}

    validation = {"status": "HOLD", "code": "PUBLISHER_VALIDATION_FAILED"}
    try:
        result = validate(candidate, now)
        validation = {"status": result["status"], "qualifiedIndices": result["indices"],
                      "qualifiedEquities": result["equities"]}
    except (ValueError, KeyError, TypeError):
        pass

    raw = json.dumps(candidate, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    readiness = read_only_readiness(candidate, now, node)
    by_source = {key: {"status": str(value.get("status", "unknown")).lower(),
                       "provider": str(value.get("provider", "unknown")),
                       "failureClass": classify_failure(value.get("message"))
                       if str(value.get("status", "")).lower() == "failed" else None}
                 for key, value in candidate.get("sourceHealth", {}).items()
                 if key not in {"equities"} and isinstance(value, dict)}
    statuses = Counter(item["status"] for item in by_source.values())
    equities = candidate.get("equities", [])
    coverage = candidate.get("equityCoverage") or {}
    violation = budget.denied > 0 or budget.attempt_count != REQUEST_BUDGET
    return {
        "diagnosticVersion": "market-live-dryrun-v1",
        "checkedAt": iso(now),
        "dryRun": True, "published": False, "candidateRetained": False,
        "rawQuotesInReport": False,
        "requestContract": {
            "maximum": REQUEST_BUDGET, "attempted": budget.attempt_count,
            "denied": budget.denied, "distinct": len(budget.attempted),
            "providerFamilies": {"Yahoo Finance": 22, "AMFI": 2, "BSE": 1}
        },
        "status": "PROBE_ERROR" if violation else "PROBE_COMPLETED",
        "technicalStatus": "HOLD" if violation else readiness.get("technicalStatus", "HOLD"),
        "releaseStatus": "HOLD",
        "rightsStatus": "UNVERIFIED",
        "publisherValidation": validation,
        "readiness": readiness,
        "sourceReceipt": by_source,
        "statusCounts": dict(statuses),
        "coverage": {
            "indexObserved": len(candidate.get("indices", [])),
            "trackedUniverse": len(STOCKS),
            "equityObserved": len(equities),
            "unavailableSymbols": coverage.get("unavailableSymbols", []),
            "sourceIndexTimes": clock_range(candidate.get("indices", [])),
            "sourceEquityTimes": clock_range(equities),
        },
        "candidateSha256": hashlib.sha256(raw).hexdigest(),
        "candidateByteCount": len(raw),
        "elapsedMs": int((time.monotonic()-start)*1000),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="reports/market-live-dryrun.json")
    parser.add_argument("--enforce-technical", action="store_true")
    args = parser.parse_args()
    result = run()
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # No values, price changes or provider response bodies appear on stdout.
    print(json.dumps({key: result.get(key) for key in
        ("status", "technicalStatus", "releaseStatus", "rightsStatus",
         "requestContract", "coverage", "publisherValidation")}, indent=2))
    if result["status"] != "PROBE_COMPLETED":
        return 2
    if args.enforce_technical and result["technicalStatus"] != "PASS":
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
