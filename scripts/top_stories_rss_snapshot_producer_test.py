#!/usr/bin/env python3
"""Certification tests for the Top Stories RSS snapshot producer."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

import top_stories_rss_snapshot_producer as producer

NOW_MS = 1_725_000_000_000
FRESH_MS = NOW_MS - 60 * 60 * 1000
STALE_MS = NOW_MS - 30 * 60 * 60 * 1000


def rfc822(ms: int) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")


FRESH_FEED = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Fixture Feed</title>
  <item>
    <title>Flood evacuation alert issued</title>
    <link>https://example.com/flood-alert?utm=1</link>
    <guid>fixture-flood-alert</guid>
    <pubDate>{rfc822(FRESH_MS)}</pubDate>
  </item>
  <item>
    <title>Public safety court order issued</title>
    <link>https://example.com/public-safety-order?utm=2</link>
    <guid>fixture-public-safety-order</guid>
    <pubDate>{rfc822(FRESH_MS)}</pubDate>
  </item>
  <item>
    <title>Old storm update</title>
    <link>https://example.com/old-storm</link>
    <guid>fixture-old-storm</guid>
    <pubDate>{rfc822(STALE_MS)}</pubDate>
  </item>
</channel></rss>
"""

ATOM_FEED = f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Fixture</title>
  <entry>
    <title>Court public safety order</title>
    <link href="https://example.org/court-order" />
    <id>atom-court-order</id>
    <updated>{producer._format_ms(FRESH_MS)}</updated>
  </entry>
</feed>
"""

MALFORMED_FEED = "<rss><channel><item><title>Broken"


class TopStoriesRssSnapshotProducerTest(unittest.TestCase):
    def source(self, source_id: str, url: str = "https://example.com/rss.xml") -> producer.SourceDefinition:
        return producer.SourceDefinition(
            id=source_id,
            source=source_id.title(),
            source_group=source_id.title(),
            url=url,
        )

    def test_source_config_has_exactly_three_enabled_sources(self) -> None:
        sources = producer.load_source_config()
        self.assertEqual(len(sources), 3)
        self.assertEqual([source.enabled for source in sources], [True, True, True])

    def test_source_ids_are_stable_and_unique(self) -> None:
        sources = producer.load_source_config()
        ids = [source.id for source in sources]
        self.assertEqual(ids, [
            "bbc-news-top-stories",
            "npr-news-top-stories",
            "guardian-world-top-stories",
        ])
        self.assertEqual(len(ids), len(set(ids)))

    def test_parses_rss_fixture_without_network(self) -> None:
        source = self.source("fixture-source")
        rows, diagnostics = producer.parse_feed_rows(FRESH_FEED, source, now_ms=NOW_MS)
        self.assertEqual(diagnostics["ok"], True)
        self.assertEqual(diagnostics["items"], 2)
        self.assertEqual(diagnostics["staleRejected"], 1)
        self.assertEqual(rows[0]["topFeedSource"], "fixture-source")
        self.assertEqual(rows[0]["source"], "Fixture-Source")
        self.assertIn("canonicalId", rows[0])

    def test_parses_atom_fixture_without_network(self) -> None:
        source = self.source("atom-source")
        rows, diagnostics = producer.parse_feed_rows(ATOM_FEED, source, now_ms=NOW_MS)
        self.assertEqual(diagnostics["items"], 1)
        self.assertEqual(rows[0]["title"], "Court public safety order")
        self.assertEqual(rows[0]["url"], "https://example.org/court-order")

    def test_rows_include_required_top_feed_fields(self) -> None:
        rows, _ = producer.parse_feed_rows(FRESH_FEED, self.source("required-source"), now_ms=NOW_MS)
        required = {
            "id",
            "canonicalId",
            "title",
            "url",
            "link",
            "source",
            "sourceGroup",
            "publishedAt",
            "observedAt",
            "topFeedRank",
            "topFeedSource",
            "clusterKey",
        }
        self.assertTrue(required.issubset(rows[0].keys()))

    def test_top_feed_rank_is_deterministic_per_source_order(self) -> None:
        rows, _ = producer.parse_feed_rows(FRESH_FEED, self.source("rank-source"), now_ms=NOW_MS)
        self.assertEqual([row["topFeedRank"] for row in rows], [1, 2])

    def test_duplicate_story_identities_collapse_within_source(self) -> None:
        duplicate_feed = f"""<rss><channel>
          <item><title>Same alert</title><link>https://example.com/same?x=1</link><pubDate>{rfc822(FRESH_MS)}</pubDate></item>
          <item><title>Same alert updated</title><link>https://example.com/same?x=2</link><pubDate>{rfc822(FRESH_MS)}</pubDate></item>
        </channel></rss>"""
        rows, diagnostics = producer.parse_feed_rows(duplicate_feed, self.source("dup-source"), now_ms=NOW_MS)
        self.assertEqual(len(rows), 1)
        self.assertEqual(diagnostics["duplicatesRejected"], 1)

    def test_stale_rows_are_rejected(self) -> None:
        stale_feed = f"""<rss><channel>
          <item><title>Old item</title><link>https://example.com/old</link><pubDate>{rfc822(STALE_MS)}</pubDate></item>
        </channel></rss>"""
        rows, diagnostics = producer.parse_feed_rows(stale_feed, self.source("stale-source"), now_ms=NOW_MS)
        self.assertEqual(rows, [])
        self.assertEqual(diagnostics["staleRejected"], 1)

    def test_malformed_feed_is_captured_as_source_diagnostics(self) -> None:
        sources = [self.source("ok-source", "ok://feed"), self.source("bad-source", "bad://feed")]
        payload = producer.build_snapshot(
            sources=sources,
            fetcher=lambda url: FRESH_FEED if url.startswith("ok://") else MALFORMED_FEED,
            now_ms=NOW_MS,
        )
        self.assertEqual(payload["sources"][0]["ok"], True)
        self.assertEqual(payload["sources"][1]["ok"], False)
        self.assertIn("ParseError", payload["sources"][1]["error"])

    def test_output_schema_is_stable(self) -> None:
        payload = producer.build_snapshot(sources=[self.source("dry")], now_ms=0, dry_run=True)
        self.assertEqual(list(payload.keys()), ["schemaVersion", "generatedAt", "sourceCount", "rowCount", "sources", "topFeedItems"])
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertEqual(payload["generatedAt"], 0)

    def test_stdout_serialization_is_deterministic_with_fixed_now(self) -> None:
        sources = [self.source("a", "a://feed"), self.source("b", "b://feed")]
        fetcher = lambda _url: FRESH_FEED
        first = producer.serialize_payload(producer.build_snapshot(sources=sources, fetcher=fetcher, now_ms=NOW_MS))
        second = producer.serialize_payload(producer.build_snapshot(sources=sources, fetcher=fetcher, now_ms=NOW_MS))
        self.assertEqual(first, second)
        json.loads(first)

    def test_dry_run_uses_no_network_and_no_rows(self) -> None:
        payload = producer.build_snapshot(sources=[self.source("dry")], now_ms=0, dry_run=True)
        self.assertEqual(payload["rowCount"], 0)
        self.assertEqual(payload["sources"][0]["dryRun"], True)

    def test_output_write_does_not_require_public_newsdata(self) -> None:
        payload = producer.build_snapshot(sources=[self.source("dry")], now_ms=0, dry_run=True)
        before = copy.deepcopy(payload)
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "snapshot.json"
            producer.write_payload(payload, out)
            self.assertTrue(out.exists())
            self.assertNotIn("public/newsdata", str(out))
        self.assertEqual(payload, before)

    def test_no_browser_runtime_files_are_imported_or_touched(self) -> None:
        source = Path(producer.__file__).read_text(encoding="utf-8")
        forbidden = [
            "src/context/NewsContext",
            "useMainTabViewModel",
            "sectionsDataset",
            "rssAggregator",
            "public/newsdata",
            "XMLHttpRequest",
            "WebSocket",
        ]
        for marker in forbidden:
            self.assertNotIn(marker, source)


if __name__ == "__main__":
    unittest.main()
