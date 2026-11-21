"""Read-only publisher RSS qualification for Buzz entertainment PRs.

Never bypass a publisher's HTTP access restrictions; a failed provider is
reported as unavailable, not relabeled as another publisher or Google RSS.
This probe does not publish data or approve redistribution of RSS content.
"""
from __future__ import annotations

import argparse
import calendar
import json
import time
from urllib.parse import urlsplit

import feedparser
import requests

from section_source_policy import load_section_source_policy

HOSTS = {
    "ndtv": ("ndtv.com",),
    "bbc": ("bbc.co.uk", "bbc.com"),
    "variety": ("variety.com",),
    "deadline": ("deadline.com",),
    "hollywood_reporter": ("hollywoodreporter.com",),
    "the_hindu": ("thehindu.com",),
}
HOLLYWOOD = frozenset({"variety", "deadline", "hollywood_reporter"})


def valid_publisher_link(link, source_group):
    try:
        parts = urlsplit(str(link or ""))
        hostname = (parts.hostname or "").lower().rstrip(".")
        return parts.scheme in ("https", "http") and any(
            hostname == domain or hostname.endswith("." + domain)
            for domain in HOSTS.get(source_group, ())
        )
    except (ValueError, TypeError):
        return False


def count_current_entries(entries, source_group, now, max_age_hours=36):
    """Count only publisher-dated items with direct publisher article URLs."""
    count = 0
    min_time = now - max_age_hours * 3600
    for entry in entries:
        stamp = entry.get("published_parsed") or entry.get("updated_parsed")
        if not stamp:
            continue
        try:
            published = calendar.timegm(stamp)
        except (TypeError, ValueError, OverflowError):
            continue
        if min_time <= published <= now + 300 and valid_publisher_link(
            entry.get("link"), source_group
        ):
            count += 1
    return count


def examine_feed(feed, now, requester=requests.get):
    group, url = feed["sourceGroup"], feed["url"]
    result = {"sourceGroup": group, "url": url, "current": 0, "ok": False}
    try:
        response = requester(url, timeout=12)
        response.raise_for_status()
        parsed = feedparser.parse(response.content)
        result["current"] = count_current_entries(parsed.entries, group, now)
        result["ok"] = result["current"] > 0
        if not result["ok"]:
            result["reason"] = "no_current_publisher_dated_entries"
    except requests.RequestException as error:
        result["reason"] = f"http_or_network_failure:{type(error).__name__}"
    except Exception as error:
        result["reason"] = f"invalid_feed:{type(error).__name__}"
    return result


def assess(results, min_publishers=2, min_hollywood=1):
    sources = {row["sourceGroup"] for row in results if row["ok"]}
    hollywood = sources.intersection(HOLLYWOOD)
    return {
        "passed": len(sources) >= min_publishers and len(hollywood) >= min_hollywood,
        "currentPublisherCount": len(sources),
        "hollywoodPublisherCount": len(hollywood),
        "currentPublishers": sorted(sources),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-publishers", type=int, default=2)
    parser.add_argument("--min-hollywood", type=int, default=1)
    args = parser.parse_args()
    feeds = load_section_source_policy()["sections"]["entertainment"]
    now = int(time.time())
    results = [examine_feed(feed, now) for feed in feeds]
    assessment = assess(results, args.min_publishers, args.min_hollywood)
    print(json.dumps({"assessment": assessment, "feeds": results}, indent=2))
    return 0 if assessment["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
