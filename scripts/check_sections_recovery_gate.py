"""Fail-closed publication gate for a refreshed GitHub Sections snapshot.

Unlike the historical structural validator (which intentionally WARNs for thin
sections), this gate rejects empty, stale and unqualified data before a scheduled
producer may update the public fallback. It never modifies the snapshot.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000
STORY_MAX_AGE_MS = 36 * 60 * 60 * 1000
FUTURE_SKEW_MS = 5 * 60 * 1000
MIN_ACTIVE_SECTIONS = 4
MIN_WORLD_SOURCES = 2


def story_is_current(story: object, now_ms: int) -> bool:
    if not isinstance(story, dict):
        return False
    title = str(story.get("title") or story.get("headline") or "").strip()
    url = str(story.get("url") or story.get("link") or "").strip()
    source = str(story.get("sourceGroup") or story.get("source") or "").strip()
    try:
        timestamp = int(story.get("publishedAt") or 0)
    except (ValueError, TypeError):
        return False
    if 0 < timestamp < 10_000_000_000:
        timestamp *= 1000
    parsed_url = urlparse(url)
    return bool(
        title and source and parsed_url.scheme == "https" and parsed_url.netloc
        and now_ms - STORY_MAX_AGE_MS <= timestamp <= now_ms + FUTURE_SKEW_MS
        and str(story.get("timestampConfidence") or "").lower() != "low"
        and str(story.get("publishedAtSource") or "").lower()
            not in ("fetch_time_fallback", "missing", "invalid")
    )


def validate_recovery(snapshot: object, now_ms: int | None = None) -> list[str]:
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    errors: list[str] = []
    if not isinstance(snapshot, dict):
        return ["Snapshot is not an object"]
    fetched_at = snapshot.get("fetchedAt")
    try:
        fetched_at = int(fetched_at)
    except (TypeError, ValueError):
        fetched_at = 0
    if not now_ms - SNAPSHOT_MAX_AGE_MS <= fetched_at <= now_ms + FUTURE_SKEW_MS:
        errors.append("Snapshot timestamp is missing, stale or in the future")
    if int(snapshot.get("schemaVersion") or 0) not in (1, 2):
        errors.append("Unsupported Sections schema")
    if not str(snapshot.get("contentHash") or "").strip():
        errors.append("Missing content hash")
    sections = snapshot.get("sections")
    if not isinstance(sections, dict):
        return errors + ["Missing Sections mapping"]
    current = {
        key: [story for story in rows if story_is_current(story, now_ms)]
        for key, rows in sections.items()
        if isinstance(rows, list)
    }
    active = [key for key, rows in current.items() if rows]
    if len(active) < MIN_ACTIVE_SECTIONS:
        errors.append(f"Only {len(active)} sections have current verifiable stories")
    world = current.get("world") or []
    world_sources = {str(story.get("sourceGroup") or story.get("source")) for story in world}
    if len(world) < 2 or len(world_sources) < MIN_WORLD_SOURCES:
        errors.append(
            f"World insufficient: {len(world)} current stories from "
            f"{len(world_sources)} independent source groups"
        )
    return errors


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public/newsdata/sections_latest.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Sections publication BLOCKED: cannot read valid snapshot: {exc}", file=sys.stderr)
        return 1
    errors = validate_recovery(data)
    if errors:
        for error in errors:
            print(f"Sections publication BLOCKED: {error}", file=sys.stderr)
        return 1
    print(f"Sections recovery qualified: {data['fetchedAt']} {data['contentHash']}; no publication yet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
