"""Collect attributed Indian government release headlines from the PIB index."""
import argparse
import json
import re
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

SOURCE_URL = "https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=20"
RELEASE_URL = "https://www.pib.gov.in/PressReleaseDetail.aspx?PRID="
SCHEMA = "market-economy-news-v1"
MINISTRIES = {
    "ministry of finance": "Ministry of Finance",
    "ministry of statistics and programme implementation": (
        "Ministry of Statistics and Programme Implementation"
    ),
}
MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_RELEASES = 20
RETENTION_DAYS = 30
INDIA_TIME = timezone(timedelta(hours=5, minutes=30))
MONTHS = {name: index for index, name in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1
)}


def release_id(href):
    link = urlsplit(href)
    if link.scheme not in ("", "https") or link.netloc not in ("", "www.pib.gov.in", "pib.gov.in"):
        return None
    if link.path not in ("/PressReleseDetail.aspx", "/PressReleaseDetail.aspx"):
        return None
    match = re.fullmatch(r"PRID=(\d{6,10})", link.query, flags=re.ASCII)
    return match[1] if match else None


def published_day(text):
    match = re.search(r"Posted on:\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b", text)
    if not match or match[2] not in MONTHS:
        return None
    try:
        return date(int(match[3]), MONTHS[match[2]], int(match[1]))
    except ValueError:
        return None


class ReleaseIndex(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []
        self.heading = None
        self.ministry = None
        self.row = None

    def handle_starttag(self, tag, attributes):
        if tag == "h3":
            self.heading = []
            self.ministry = None
            self.row = None
        elif tag == "li" and self.ministry:
            self.row = {"title": "", "id": None, "anchor": False, "headline": [], "text": []}
        elif tag == "a" and self.row is not None and self.row["id"] is None:
            attrs = dict(attributes)
            if key := release_id(attrs.get("href") or ""):
                self.row.update(id=key, title=attrs.get("title") or "", anchor=True)

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)
        if self.row is not None:
            self.row["text"].append(data)
            if self.row["anchor"]:
                self.row["headline"].append(data)

    def handle_endtag(self, tag):
        if tag == "h3" and self.heading is not None:
            heading = " ".join("".join(self.heading).lower().replace("&", "and").split())
            self.ministry = MINISTRIES.get(heading)
            self.heading = None
        elif tag == "a" and self.row is not None:
            self.row["anchor"] = False
        elif tag == "li" and self.row is not None:
            row = self.row
            self.row = None
            headline = " ".join((row["title"] or "".join(row["headline"])).split())
            published = published_day("".join(row["text"]))
            if row["id"] and published and 0 < len(headline) <= 500 and not re.search(r"[<>\x00-\x1f]", headline):
                self.items.append({
                    "id": row["id"], "headline": headline, "ministry": self.ministry,
                    "publishedOn": published.isoformat(), "url": RELEASE_URL + row["id"] + "&lang=1&reg=20",
                })


def build_feed(html, prior, now):
    index = ReleaseIndex()
    index.feed(html)
    index.close()
    today = now.astimezone(INDIA_TIME).date()
    oldest = (today - timedelta(days=RETENTION_DAYS)).isoformat()
    newest = today.isoformat()
    observed = {row["id"]: row for row in index.items if oldest <= row["publishedOn"] <= newest}
    if not observed:
        raise ValueError("The PIB index yielded no recent Finance or Statistics releases")
    for row in prior.get("items", []):
        if oldest <= row["publishedOn"] <= newest:
            observed.setdefault(row["id"], {**row, "url": RELEASE_URL + row["id"] + "&lang=1&reg=20"})
    return {
        "schemaVersion": SCHEMA,
        "checkedAt": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "items": sorted(
            observed.values(), key=lambda row: (row["publishedOn"], int(row["id"])), reverse=True
        )[:MAX_RELEASES],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("public/data/market_economy_news.json"))
    args = parser.parse_args()
    with urlopen(Request(SOURCE_URL, headers={"User-Agent": "NWv-7 Market Economy Headlines"}),
                 timeout=12) as response:
        redirect = urlsplit(response.geturl())
        if redirect.scheme != "https" or redirect.hostname not in ("pib.gov.in", "www.pib.gov.in"):
            raise ValueError("Unexpected PIB source location")
        if response.headers.get_content_type() != "text/html":
            raise ValueError("Unexpected PIB response type")
        original = response.read(MAX_SOURCE_BYTES + 1)
    if len(original) > MAX_SOURCE_BYTES:
        raise ValueError("The PIB release index exceeded the source size limit")
    prior = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {}
    feed = build_feed(original.decode("utf-8-sig"), prior, datetime.now(timezone.utc))
    staging = args.output.with_suffix(".tmp")
    staging.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    staging.replace(args.output)
    print(f"Verified {len(feed['items'])} PIB releases at {feed['checkedAt']}")


if __name__ == "__main__":
    main()
