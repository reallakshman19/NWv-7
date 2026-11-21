#!/usr/bin/env python3
"""Mirror an independently committed Cloudflare Sections preview to GitHub.

This is an audit/recovery copy, not promotion of Cloudflare shadow authority.
The producer never replaces sections_latest.json and never creates news stories.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE_URL = "https://nw-sections-shadow.reallaksh19.workers.dev/preview/sections/latest"
SNAPSHOT_PATH = Path("public/newsdata/sections_cloudflare_latest.json")
MANIFEST_PATH = Path("public/newsdata/sections_cloudflare_manifest.json")
MAX_BODY_BYTES = 10 * 1024 * 1024
MAX_SNAPSHOT_AGE_MS = 12 * 60 * 60 * 1000
FUTURE_SKEW_MS = 5 * 60 * 1000
MAX_STORY_AGE_MS = 36 * 60 * 60 * 1000
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PREVIEW_SOURCES = {"committed_evidence", "committed_lane_reconstruction"}


class MirrorRejected(ValueError):
    pass


def as_ms(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        numeric = int(value)  # type: ignore[arg-type]
    except (ValueError, TypeError, OverflowError):
        return 0
    if 0 < numeric < 10_000_000_000:
        return numeric * 1000
    return numeric if numeric > 0 else 0


def fetch_live(url: str = SOURCE_URL) -> bytes:
    if url != SOURCE_URL:
        raise MirrorRejected("unapproved_source_url")
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "NWv7-SectionsMirror/1"})
    with urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise MirrorRejected(f"source_http_{response.status}")
        data = response.read(MAX_BODY_BYTES + 1)
    if not data or len(data) > MAX_BODY_BYTES:
        raise MirrorRejected("empty_or_oversized_source")
    return data


def validate(raw: bytes, now_ms: int) -> dict:
    if not raw or len(raw) > MAX_BODY_BYTES:
        raise MirrorRejected("empty_or_oversized_source")
    try:
        snapshot = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise MirrorRejected("invalid_json") from exc
    if not isinstance(snapshot, dict) or snapshot.get("schemaVersion") != 2:
        raise MirrorRejected("unsupported_sections_schema")
    fetched = as_ms(snapshot.get("fetchedAt"))
    if not fetched or fetched > now_ms + FUTURE_SKEW_MS or now_ms - fetched > MAX_SNAPSHOT_AGE_MS:
        raise MirrorRejected("stale_or_future_snapshot")
    preview = snapshot.get("preview")
    if not isinstance(preview, dict) or (
        preview.get("dataSource") != "cloudflare_d1"
        or preview.get("mode") != "cloudflare_preview"
        or preview.get("servingAuthority") != "github_static"
        or preview.get("evidenceVerified") is not True
        or preview.get("projectionSource") not in PREVIEW_SOURCES
    ):
        raise MirrorRejected("unverified_cloudflare_preview")
    epoch = preview.get("epochId")
    digest = preview.get("decisionOutputDigest")
    generation = preview.get("pointerGeneration")
    if not isinstance(epoch, str) or not epoch or len(epoch) > 256:
        raise MirrorRejected("missing_epoch_id")
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise MirrorRejected("invalid_decision_digest")
    if snapshot.get("contentHash") != digest[:12]:
        raise MirrorRejected("decision_digest_prefix_mismatch")
    if type(generation) is not int or generation < 1:
        raise MirrorRejected("invalid_pointer_generation")
    committed = as_ms(preview.get("committedAt"))
    if not committed or committed > now_ms + FUTURE_SKEW_MS or committed > fetched + FUTURE_SKEW_MS:
        raise MirrorRejected("invalid_commit_clock")
    sections = snapshot.get("sections")
    if not isinstance(sections, dict):
        raise MirrorRejected("missing_sections")
    counts = {}
    valid_stories = 0
    for section, items in sections.items():
        if not isinstance(section, str) or not isinstance(items, list):
            raise MirrorRejected("malformed_section")
        counts[section] = len(items)
        for item in items:
            if not isinstance(item, dict):
                raise MirrorRejected("malformed_story")
            title = item.get("title") or item.get("headline")
            link = item.get("url") or item.get("link")
            timestamp = as_ms(item.get("publishedAt") or item.get("pubDate") or item.get("date"))
            if (isinstance(title, str) and title.strip()
                and isinstance(link, str) and link.startswith(("https://", "http://"))
                and timestamp and timestamp <= now_ms + FUTURE_SKEW_MS
                and now_ms - timestamp <= MAX_STORY_AGE_MS
                and str(item.get("timestampConfidence", "high")).lower() not in {"low", "unknown", "fallback"}):
                valid_stories += 1
    if valid_stories == 0:
        raise MirrorRejected("no_eligible_publisher_stories")
    return {"epochId": epoch, "pointerGeneration": generation,
            "decisionOutputDigest": digest, "fetchedAt": fetched,
            "committedAt": committed, "sectionCounts": counts,
            "usableStoryCount": valid_stories}


def check_predecessor(snapshot_path: Path, manifest_path: Path, incoming: dict, incoming_sha: str) -> bool:
    if not snapshot_path.exists() and not manifest_path.exists():
        return True
    if not snapshot_path.exists() or not manifest_path.exists():
        raise MirrorRejected("incomplete_previous_mirror")
    try:
        previous = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise MirrorRejected("invalid_previous_manifest") from exc
    prior_sha = hashlib.sha256(snapshot_path.read_bytes()).hexdigest()
    if previous.get("sha256") != prior_sha:
        raise MirrorRejected("previous_mirror_digest_mismatch")
    old_gen = previous.get("pointerGeneration")
    if type(old_gen) is not int:
        raise MirrorRejected("invalid_previous_generation")
    new_gen = incoming["pointerGeneration"]
    if new_gen < old_gen:
        raise MirrorRejected("pointer_generation_rollback")
    if new_gen == old_gen:
        if (previous.get("epochId") != incoming["epochId"]
            or previous.get("decisionOutputDigest") != incoming["decisionOutputDigest"]
            or prior_sha != incoming_sha):
            raise MirrorRejected("mutated_committed_epoch")
        return False
    if incoming["committedAt"] < as_ms(previous.get("committedAt")):
        raise MirrorRejected("committed_at_rollback")
    return True


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def mirror(raw: bytes, now_ms: int, snapshot_path: Path = SNAPSHOT_PATH,
           manifest_path: Path = MANIFEST_PATH) -> str:
    validated = validate(raw, now_ms)
    sha = hashlib.sha256(raw).hexdigest()
    if not check_predecessor(snapshot_path, manifest_path, validated, sha):
        return "UNCHANGED"
    manifest = {
        "schemaVersion": 1,
        "mirrorKind": "cloudflare_shadow_verified_preview",
        "servingAuthority": "github_static",
        "sourceUrl": SOURCE_URL,
        "sourceMode": "cloudflare_preview",
        **validated,
        "mirroredAt": now_ms,
        "sha256": sha,
        "byteLength": len(raw),
        "status": "VERIFIED_SHADOW_MIRROR_NOT_PRODUCTION_AUTHORITY",
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    # A Git commit publishes these two files together; never commit partial output.
    write_atomic(snapshot_path, raw)
    write_atomic(manifest_path, manifest_bytes)
    return "UPDATED"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="Offline test fixture only; forbidden in publication workflow")
    parser.add_argument("--snapshot", type=Path, default=SNAPSHOT_PATH)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()
    try:
        raw = args.input.read_bytes() if args.input else fetch_live()
        outcome = mirror(raw, int(time.time() * 1000), args.snapshot, args.manifest)
    except (MirrorRejected, OSError, ValueError) as error:
        print(f"CF MIRROR REJECTED: {error}", file=sys.stderr)
        return 1
    print(f"CF MIRROR {outcome}; snapshot={args.snapshot}; manifest={args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
