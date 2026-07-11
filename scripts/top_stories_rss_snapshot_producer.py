#!/usr/bin/env python3
"""Dedicated Top Stories RSS snapshot producer.

This script is intentionally server/workflow/local-CLI side only. It does not
integrate with browser runtime and does not write generated runtime data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = REPO_ROOT / "config" / "top_stories_rss_sources.json"
DEFAULT_MAX_PER_SOURCE = 12
DEFAULT_MAX_TOTAL = 36
DEFAULT_FRESHNESS_HOURS = 24
USER_AGENT = "NWv-7 Top Stories RSS Snapshot Producer/1.0"


@dataclass(frozen=True)
class SourceDefinition:
    id: str
    source: str
    source_group: str
    url: str
    enabled: bool = True


def _text(value: object) -> str:
    return str(value or "").strip()


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", _text(value)).strip()


def _normalize_identity_text(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", _normalize_text(value).lower()).strip()


def _normalize_url(value: object) -> str:
    raw = _text(value)
    if not raw:
        return ""
    base = raw.split("#", 1)[0].split("?", 1)[0]
    return base.rstrip("/").lower()


def _sha_identity(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _stable_identity(title: str, url: str, guid: str = "") -> str:
    normalized_url = _normalize_url(url)
    if normalized_url:
        return normalized_url
    normalized_guid = _normalize_text(guid)
    if normalized_guid:
        return normalized_guid.lower()
    return _normalize_identity_text(title)


def _canonical_id(title: str, url: str, guid: str = "") -> str:
    identity = _stable_identity(title, url, guid)
    if not identity:
        return ""
    return f"topfeed:{_sha_identity(identity)}"


def _parse_date_ms(value: str | None) -> int | None:
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError, OverflowError):
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def _format_ms(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _child_text(node: ET.Element, names: Iterable[str]) -> str:
    wanted = set(names)
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1]
        if local in wanted and child.text:
            return _normalize_text(child.text)
    return ""


def _entry_link(node: ET.Element) -> str:
    rss_link = _child_text(node, ["link"])
    if rss_link:
        return rss_link
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1]
        if local == "link" and child.attrib.get("href"):
            return _normalize_text(child.attrib.get("href"))
    return ""


def _iter_feed_entries(xml_text: str) -> list[ET.Element]:
    root = ET.fromstring(xml_text)
    entries = []
    for node in root.iter():
        local = node.tag.rsplit("}", 1)[-1]
        if local in {"item", "entry"}:
            entries.append(node)
    return entries


def parse_feed_rows(
    xml_text: str,
    source: SourceDefinition,
    *,
    now_ms: int,
    max_per_source: int = DEFAULT_MAX_PER_SOURCE,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    diagnostics = {
        "id": source.id,
        "ok": True,
        "items": 0,
        "staleRejected": 0,
        "duplicatesRejected": 0,
        "malformedRejected": 0,
        "error": None,
    }
    seen_in_source: set[str] = set()
    freshness_ms = max(1, int(freshness_hours)) * 60 * 60 * 1000
    entries = _iter_feed_entries(xml_text)

    for feed_rank, entry in enumerate(entries, start=1):
        if len(rows) >= max_per_source:
            break
        title = _child_text(entry, ["title"])
        url = _entry_link(entry)
        guid = _child_text(entry, ["guid", "id"])
        published_raw = _child_text(entry, ["pubDate", "published", "updated", "dc:date"])
        published_ms = _parse_date_ms(published_raw)
        identity = _stable_identity(title, url, guid)
        if not title or not identity or published_ms is None:
            diagnostics["malformedRejected"] += 1
            continue
        if now_ms - published_ms > freshness_ms or published_ms - now_ms > 5 * 60 * 1000:
            diagnostics["staleRejected"] += 1
            continue
        source_identity = f"{source.id}|{identity}"
        if source_identity in seen_in_source:
            diagnostics["duplicatesRejected"] += 1
            continue
        seen_in_source.add(source_identity)
        rows.append({
            "id": _canonical_id(title, url, guid),
            "canonicalId": _canonical_id(title, url, guid),
            "title": title,
            "url": url,
            "link": url,
            "source": source.source,
            "sourceGroup": source.source_group,
            "publishedAt": _format_ms(published_ms),
            "observedAt": _format_ms(now_ms),
            "topFeedRank": feed_rank,
            "topFeedSource": source.id,
            "clusterKey": _sha_identity(identity),
        })

    diagnostics["items"] = len(rows)
    return rows, diagnostics


def load_source_config(path: Path = DEFAULT_CONFIG_PATH) -> list[SourceDefinition]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sources = []
    for raw in payload.get("sources", []):
        sources.append(SourceDefinition(
            id=_text(raw.get("id")),
            source=_text(raw.get("source")),
            source_group=_text(raw.get("sourceGroup") or raw.get("source")),
            url=_text(raw.get("url")),
            enabled=bool(raw.get("enabled", True)),
        ))
    enabled = [source for source in sources if source.enabled]
    if len(enabled) != 3:
        raise ValueError(f"expected exactly three enabled Top Stories RSS sources, found {len(enabled)}")
    ids = [source.id for source in enabled]
    if len(ids) != len(set(ids)):
        raise ValueError("Top Stories RSS source ids must be unique")
    for source in enabled:
        if not source.id or not source.source or not source.source_group or not source.url:
            raise ValueError(f"invalid Top Stories RSS source definition: {source}")
    return enabled


def fetch_rss(url: str, timeout: int = 20) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - CLI/server-side producer only.
        return response.read().decode("utf-8", errors="replace")


def build_snapshot(
    *,
    sources: list[SourceDefinition] | None = None,
    fetcher: Callable[[str], str] | None = None,
    now_ms: int | None = None,
    max_per_source: int = DEFAULT_MAX_PER_SOURCE,
    max_total: int = DEFAULT_MAX_TOTAL,
    freshness_hours: int = DEFAULT_FRESHNESS_HOURS,
    dry_run: bool = False,
) -> dict:
    now = int(now_ms if now_ms is not None else datetime.now(tz=timezone.utc).timestamp() * 1000)
    source_defs = sources if sources is not None else load_source_config()
    fetch = fetcher or fetch_rss
    all_rows: list[dict] = []
    diagnostics: list[dict] = []

    for source in source_defs:
        if dry_run:
            diagnostics.append({
                "id": source.id,
                "ok": True,
                "items": 0,
                "staleRejected": 0,
                "duplicatesRejected": 0,
                "malformedRejected": 0,
                "dryRun": True,
                "error": None,
            })
            continue
        try:
            xml_text = fetch(source.url)
            rows, source_diagnostics = parse_feed_rows(
                xml_text,
                source,
                now_ms=now,
                max_per_source=max_per_source,
                freshness_hours=freshness_hours,
            )
            diagnostics.append(source_diagnostics)
            all_rows.extend(rows)
        except Exception as error:  # noqa: BLE001 - diagnostics should capture source-level feed failures.
            diagnostics.append({
                "id": source.id,
                "ok": False,
                "items": 0,
                "staleRejected": 0,
                "duplicatesRejected": 0,
                "malformedRejected": 0,
                "error": f"{type(error).__name__}: {error}",
            })

    all_rows.sort(key=lambda row: (int(row.get("topFeedRank") or 9999), _text(row.get("topFeedSource")), _text(row.get("canonicalId"))))
    top_feed_items = all_rows[:max_total]
    return {
        "schemaVersion": 1,
        "generatedAt": now,
        "sourceCount": len(source_defs),
        "rowCount": len(top_feed_items),
        "sources": diagnostics,
        "topFeedItems": top_feed_items,
    }


def serialize_payload(payload: dict) -> str:
    return json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def write_payload(payload: dict, output_path: Path | None) -> None:
    text = serialize_payload(payload)
    if output_path:
        output_path.write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a dedicated Top Stories RSS top-feed snapshot payload.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to top_stories_rss_sources.json")
    parser.add_argument("--output", help="Optional output JSON path. Does not write runtime data by default.")
    parser.add_argument("--dry-run", action="store_true", help="Validate config and emit deterministic empty diagnostics without network fetch.")
    parser.add_argument("--now-ms", type=int, help="Fixed generation timestamp in epoch milliseconds for deterministic runs.")
    parser.add_argument("--max-per-source", type=int, default=DEFAULT_MAX_PER_SOURCE)
    parser.add_argument("--max-total", type=int, default=DEFAULT_MAX_TOTAL)
    parser.add_argument("--freshness-hours", type=int, default=DEFAULT_FRESHNESS_HOURS)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    sources = load_source_config(Path(args.config))
    payload = build_snapshot(
        sources=sources,
        now_ms=args.now_ms,
        max_per_source=args.max_per_source,
        max_total=args.max_total,
        freshness_hours=args.freshness_hours,
        dry_run=args.dry_run,
    )
    output = Path(args.output) if args.output else None
    write_payload(payload, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
