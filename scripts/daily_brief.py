"""Bounded, free headline-only newspaper publication; no page scraping or AI calls."""
import argparse
import calendar
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlparse

import feedparser
import requests

MAX_AGE_SECONDS = 48 * 60 * 60
MAX_FEED_BYTES = 1000000
SOURCES = {
    "THE_HINDU": {"domain": "thehindu.com", "feeds": [
        ("Front Page", "https://www.thehindu.com/news/national/feeder/default.rss"),
        ("Tamil Nadu", "https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss"),
        ("Business", "https://www.thehindu.com/business/feeder/default.rss"),
    ]},
    "INDIAN_EXPRESS": {"domain": "indianexpress.com", "fallbackFeeds": [
        ("Latest News", "https://news.google.com/rss/search?q=site:indianexpress.com+when:2d&hl=en-IN&gl=IN&ceid=IN:en"),
    ], "feeds": [
        ("Front Page", "https://indianexpress.com/section/india/feed/"),
        ("Chennai", "https://indianexpress.com/section/cities/chennai/feed/"),
        ("Business", "https://indianexpress.com/section/business/feed/"),
    ]},
    "DINAMANI": {"domain": "dinamani.com", "feeds": [
        ("Latest News", "https://news.google.com/rss/search?q=site:dinamani.com+when:2d&hl=ta&gl=IN&ceid=IN:ta"),
    ]},
    "DAILY_THANTHI": {"domain": "dailythanthi.com", "feeds": [
        ("Latest News", "https://news.google.com/rss/search?q=site:dailythanthi.com+when:2d&hl=ta&gl=IN&ceid=IN:ta"),
    ]},
}


def domain_matches(url, domain):
    host = (urlparse(str(url)).hostname or "").lower()
    return host == domain or host.endswith("." + domain)


def qualify_entries(entries, domain, now_seconds):
    articles = []
    seen = set()
    for entry in entries[:100]:
        parsed = entry.get("published_parsed") or entry.get("updated_parsed")
        if not parsed:
            continue
        published = calendar.timegm(parsed)
        if not 0 <= now_seconds - published <= MAX_AGE_SECONDS:
            continue
        title, link = str(entry.get("title", "")).strip(), entry.get("link", "")
        publisher_url = entry.get("source", {}).get("href", "")
        direct = domain_matches(link, domain)
        discovery = (urlparse(link).hostname == "news.google.com"
                     and domain_matches(publisher_url, domain))
        if not title or not (direct or discovery) or link in seen:
            continue
        seen.add(link)
        articles.append({"title": title, "link": link,
                         "publishedAt": published * 1000,
                         "publisherUrl": publisher_url or "https://" + domain,
                         "acquiredVia": "publisher-rss" if direct else "google-news-publisher-discovery"})
    return sorted(articles, key=lambda row: row["publishedAt"], reverse=True)[:10]


def acquire_feed(task, now_seconds):
    source_id, domain, page, url = task
    try:
        with requests.get(url, timeout=(4, 8), stream=True, headers={"User-Agent": "NWv7-Personal-Headlines/1.0"}) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_content(16384):
                size += len(chunk)
                if size > MAX_FEED_BYTES:
                    raise ValueError("RSS response exceeds size limit")
                chunks.append(chunk)
        parsed = feedparser.parse(b"".join(chunks))
        if not parsed.entries:
            raise ValueError("No RSS entries returned")
        articles = qualify_entries(parsed.entries, domain, now_seconds)
        return {"sourceId": source_id, "page": page, "url": url, "ok": True,
                "articles": articles, "currentCount": len(articles)}
    except Exception as error:
        return {"sourceId": source_id, "page": page, "url": url, "ok": False,
                "articles": [], "currentCount": 0, "error": str(error)[:200]}


def build_publication(results, now_seconds):
    sources = {key: [] for key in SOURCES}
    status = {key: {"feeds": [], "currentCount": 0} for key in SOURCES}
    seen = {key: set() for key in SOURCES}
    for result in results:
        key = result["sourceId"]
        status[key]["feeds"].append({field: value for field, value in result.items()
                                      if field not in {"articles", "sourceId", "page"}})
        articles = []
        for article in result["articles"]:
            identity = article["title"].casefold().strip()
            if identity in seen[key]:
                continue
            seen[key].add(identity)
            articles.append(article)
        if articles:
            sources[key].append({"page": result["page"], "articles": articles})
            status[key]["currentCount"] += len(articles)
    if not any(row["currentCount"] for row in status.values()):
        raise ValueError("No verified current newspaper headlines; refusing empty/stale publication")
    return {"schemaVersion": 2, "lastUpdated": datetime.fromtimestamp(now_seconds, timezone.utc).isoformat(),
            "provenance": "publisher-rss-and-scoped-discovery", "maxAgeHours": 48,
            "sources": sources, "sourceStatus": status}


def collect_publication(now, fetcher=acquire_feed):
    tasks = [(key, config["domain"], page, url) for key, config in SOURCES.items()
             for page, url in config["feeds"]]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda task: fetcher(task, now), tasks))
    # Discovery is a source-specific recovery, never permission to substitute a
    # different publisher or infer a publication date from the acquisition clock.
    for key, config in SOURCES.items():
        if any(row["sourceId"] == key and row["articles"] for row in results):
            continue
        for page, url in config.get("fallbackFeeds", []):
            results.append(fetcher((key, config["domain"], page, url), now))
    return build_publication(results, now)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="public/data/epaper_data.json")
    args = parser.parse_args()
    now = datetime.now(timezone.utc).timestamp()
    publication = collect_publication(now)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(publication, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"lastUpdated": publication["lastUpdated"], "sources": {
        key: value["currentCount"] for key, value in publication["sourceStatus"].items()}}))


if __name__ == "__main__":
    main()
