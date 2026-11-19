"""Bounded, no-key India daily market publisher. Never re-date previous values.

22 Yahoo chart requests, BSE upcoming issues, AMFI NAV and AMFI NFO (25 max).
Each request has one attempt, an eight-second timeout and a four-MB body cap.
Collection time and source quote/NAV time remain separate. Optional source errors
are published explicitly; three recent core indices are required before writing.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import json
import math
from pathlib import Path
import re
from urllib.parse import quote
from xml.etree import ElementTree

import requests
from bs4 import BeautifulSoup

INDICES = {"NIFTY 50": "^NSEI", "SENSEX": "^BSESN", "BANK NIFTY": "^NSEBANK",
           "NIFTY IT": "^CNXIT", "NIFTY AUTO": "^CNXAUTO", "NIFTY PHARMA": "^CNXPHARMA"}
# One tracked universe for the publisher and browser adapters; no additional requests.
UNIVERSE = json.loads((Path(__file__).resolve().parent.parent / "src/config/marketEquityUniverse.json").read_text(encoding="utf-8"))
STOCKS = UNIVERSE["symbols"]
if len(STOCKS) != 16 or len(STOCKS) != len(set(STOCKS)) or any(not re.fullmatch(r"[A-Z0-9&-]{1,20}", symbol) for symbol in STOCKS):
    raise ValueError("The tracked NSE equity universe must contain 16 distinct symbols")
BSE = "https://api.bseindia.com/BseIndiaAPI/api/IPOIssues/w?Type=UpcomingIPO&CategoryCode=E&issueType=P"
NAV = "https://portal.amfiindia.com/spages/NAVAll.txt"
NFO = "https://portal.amfiindia.com/rssNAV.aspx?nfo=y"
IST = timezone(timedelta(hours=5, minutes=30))
HEADERS = {"User-Agent": "Mozilla/5.0 NWv7IndiaMarket/1.0", "Accept": "application/json,text/plain,text/html"}


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    try:
        parsed = float(str(value).replace(",", ""))
        return parsed if math.isfinite(parsed) else None
    except (ValueError, TypeError):
        return None


def date_value(value):
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d/%m/%Y", "%d %b %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            pass
    return None


def get(url):
    with requests.get(url, headers=HEADERS, timeout=8, stream=True) as response:
        response.raise_for_status()
        parts, length = [], 0
        for part in response.iter_content(65536):
            length += len(part)
            if length > 4 * 1024 * 1024:
                raise ValueError("Source body exceeds four MB")
            parts.append(part)
        return b"".join(parts).decode("utf-8-sig")


def parse_chart(payload, name, symbol, now):
    result = payload["chart"]["result"][0]
    meta = result["meta"]
    quote_at = datetime.fromtimestamp(float(meta["regularMarketTime"]), timezone.utc)
    if quote_at > now + timedelta(minutes=5) or now - quote_at > timedelta(days=5):
        raise ValueError("Quote timestamp is future-dated or older than five days")
    timestamps = result.get("timestamp") or []
    closes = result["indicators"]["quote"][0]["close"]
    if len(timestamps) != len(closes):
        raise ValueError("Daily timestamps and closes are not aligned")

    quote_day = quote_at.astimezone(IST).date()
    previous_time = None
    previous = None
    for timestamp, close in zip(timestamps, closes):
        bar_time = number(timestamp)
        if bar_time is None:
            raise ValueError("Missing daily bar timestamp")
        bar_day = datetime.fromtimestamp(bar_time, IST).date()
        if bar_day < quote_day and (previous_time is None or bar_time > previous_time):
            previous_time = bar_time
            previous = number(close)

    price = number(meta.get("regularMarketPrice"))
    if price is None or price <= 0 or previous is None or previous <= 0:
        raise ValueError("Missing positive price or previous daily close")
    change = price - previous
    return {"name": name, "symbol": symbol, "value": f"{price:.2f}", "price": f"{price:.2f}",
            "change": f"{change:.2f}", "changePercent": f"{change / previous * 100:.2f}",
            "direction": "up" if change >= 0 else "down", "currency": "₹", "quoteAt": iso(quote_at),
            "sourceMode": "yahoo-free-daily", "source": "Yahoo Finance daily chart"}


def parse_nav(text, now):
    lines = text.splitlines()
    header = next((line for line in lines if "scheme code" in line.lower() or line.lower().startswith("code;")), "")
    columns = [column.strip().lower() for column in header.split(";")]
    def column(*names):
        return next((columns.index(name) for name in names if name in columns), None)
    code_col, name_col, nav_col, date_col = column("scheme code", "code"), column("scheme name", "name"), column("net asset value", "nav"), column("date")
    if None in (code_col, name_col, nav_col, date_col):
        raise ValueError("Unrecognized AMFI NAV column headings")
    plan_col, option_col = column("plan"), column("option")
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.split(";")]
        if len(cells) < len(columns) or not cells[code_col].isdigit():
            continue
        name = " - ".join(cells[index] for index in [name_col, plan_col, option_col] if index is not None)
        nav, day = number(cells[nav_col]), date_value(cells[date_col])
        if not day or day > now.astimezone(IST).date() or (now.astimezone(IST).date() - day).days > 7 or nav is None or nav <= 0:
            continue
        if not re.search(r"Direct", name, re.I) or not re.search(r"Growth", name, re.I):
            continue
        if not re.search(r"nifty|sensex|large.?cap|mid.?cap|flexi.?cap|elss|value fund", name, re.I):
            continue
        rows.append({"name": name, "code": cells[code_col], "schemeCode": cells[code_col], "nav": nav,
                     "navDate": day.isoformat(), "source": "AMFI", "sourceUrl": NAV, "sourceMode": "official-daily"})
    if not rows:
        raise ValueError("No recent eligible direct-growth NAV rows")
    return rows[:50]


def active_offer(row, now):
    opened, closed = date_value(row.get("openDate")), date_value(row.get("closeDate"))
    today = now.astimezone(IST).date()
    if not row.get("name") or not opened or not closed or closed < today or closed < opened or opened > today + timedelta(days=90):
        return None
    return {**row, "openDate": opened.isoformat(), "closeDate": closed.isoformat(),
            "status": "upcoming" if opened > today else "live"}


def parse_bse(payload, now):
    rows = payload if isinstance(payload, list) else payload.get("Table", payload.get("data"))
    if not isinstance(rows, list):
        raise ValueError("BSE issue response is not a supported table")
    results = []
    for row in rows[:100]:
        normalized = active_offer({"name": row.get("COMPANY_NAME") or row.get("companyName"),
                                  "openDate": row.get("OPEN_DATE") or row.get("openDate"),
                                  "closeDate": row.get("CLOSE_DATE") or row.get("closeDate"),
                                  "issuePrice": row.get("PRICE_BAND") or row.get("priceRange"),
                                  "source": "BSE", "sourceUrl": BSE}, now)
        if normalized:
            results.append(normalized)
    if rows and not results:
        raise ValueError("BSE supplied rows but none have current, complete issue dates")
    return results


def parse_nfo(xml, now):
    feed = ElementTree.fromstring(xml)
    channel = feed.find("channel")
    if feed.tag != "rss" or channel is None:
        raise ValueError("Expected the official AMFI RSS channel")
    items = channel.findall("item")
    today = now.astimezone(IST).date()
    result = []
    for item in items[:100]:
        name = (item.findtext("title") or "").strip()
        description = BeautifulSoup(item.findtext("description") or "", "html.parser")
        fields = {}
        for row in description.find_all("tr"):
            cells = row.find_all("td", recursive=False)
            if len(cells) >= 2:
                label = cells[0].get_text(" ", strip=True).casefold()
                fields[label] = cells[1].get_text(" ", strip=True)
        opened = date_value(fields.get("launch date"))
        closed = date_value(fields.get("new fund offer closure date") or fields.get("closure date"))
        if not name or not opened:
            continue
        row = {"name": name, "openDate": opened.isoformat(), "source": "AMFI",
               "sourceUrl": NFO, "category": fields.get("scheme category", "")}
        if closed:
            qualified = active_offer({**row, "closeDate": closed.isoformat()}, now)
            if qualified:
                result.append(qualified)
        elif today - timedelta(days=21) <= opened <= today + timedelta(days=90):
            # The RSS feed usually omits closing dates. Its launch date is
            # useful as an announcement without asserting availability.
            result.append({**row, "status": "announced", "closeDate": None})
    if items and not result:
        raise ValueError("AMFI RSS returned no usable dated announcements")
    return result


def acquire(now, getter=get):
    health, indices, stocks = {}, [], []
    jobs = [(name, symbol, "indices") for name, symbol in INDICES.items()] + [(name, f"{name}.NS", "stocks") for name in STOCKS]

    def chart(job):
        name, symbol, section = job
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?range=5d&interval=1d"
        try:
            row = parse_chart(json.loads(getter(url)), name, symbol, now)
            return section, row, {"status": "snapshot", "provider": "Yahoo Finance", "sourceUrl": url, "quoteAt": row["quoteAt"]}
        except Exception as error:
            return section, None, {"status": "failed", "provider": "Yahoo Finance", "sourceUrl": url, "message": str(error)[:200]}

    with ThreadPoolExecutor(max_workers=4) as pool:
        for job, (section, row, receipt) in zip(jobs, pool.map(chart, jobs)):
            health[job[0]] = receipt
            if row:
                (indices if section == "indices" else stocks).append(row)
    extras = {}
    for key, url, parser in [("mutualFunds", NAV, lambda body: parse_nav(body, now)),
                             ("ipo", BSE, lambda body: parse_bse(json.loads(body), now)),
                             ("nfo", NFO, lambda body: parse_nfo(body, now))]:
        try:
            extras[key] = parser(getter(url))
            health[key] = {"status": "snapshot" if extras[key] else "empty", "provider": "BSE" if key == "ipo" else "AMFI",
                           "sourceUrl": url, "count": len(extras[key]), "message": "Qualified source response; zero current matches" if not extras[key] else "Source-dated rows"}
        except Exception as error:
            extras[key] = []
            health[key] = {"status": "failed", "provider": "BSE" if key == "ipo" else "AMFI", "sourceUrl": url, "message": str(error)[:200], "count": 0}
    ipo = {"upcoming": [], "live": [], "recent": []}
    for row in extras["ipo"]:
        ipo[row["status"]].append(row)
    # Preserve the source quote time for every qualifying tracked share. The
    # publication has a bounded 16-symbol universe, not NSE-wide movers.
    equities = [{**row,
                 "id": f"equity:NSE:{row['name']}", "symbol": row["name"],
                 "providerSymbol": row["symbol"], "exchange": "NSE", "region": "IN",
                 "value": float(row["value"]), "price": float(row["price"]),
                 "change": float(row["change"]), "changePercent": float(row["changePercent"]),
                 "currency": "INR", "unit": "currency", "cadence": "daily",
                 "sourceProvider": "Yahoo Finance", "sourceAuthority": "third-party",
                 "sourceUrl": health[row["name"]]["sourceUrl"]}
                for row in stocks]
    # Gainers and losers must share one observed India session date.
    newest_day = max((datetime.fromisoformat(row["quoteAt"].replace("Z", "+00:00")).astimezone(IST).date()
                      for row in equities), default=None)
    same_session = [row for row in equities
                    if datetime.fromisoformat(row["quoteAt"].replace("Z", "+00:00")).astimezone(IST).date() == newest_day]
    gainers = sorted((row for row in same_session if row["changePercent"] > 0),
                     key=lambda row: row["changePercent"], reverse=True)[:5]
    losers = sorted((row for row in same_session if row["changePercent"] < 0),
                    key=lambda row: row["changePercent"])[:5]
    health["equities"] = {"status": "snapshot" if len(equities) == len(STOCKS) else ("partial" if equities else "failed"),
                          "provider": "Yahoo Finance", "count": len(equities), "universeSize": len(STOCKS),
                          "message": "Tracked NSE shares; not exchange-wide movers"}
    snapshot = {"schemaVersion": "market-india-1", "generatedAt": iso(now), "fetchedAt": int(now.timestamp() * 1000),
                "sourceMode": "snapshot", "indices": indices, "globalIndices": [], "commodities": [], "currencies": [],
                "equities": equities,
                "equityCoverage": {"universeSize": len(STOCKS), "quotedCount": len(equities),
                                   "unavailableSymbols": [symbol for symbol in STOCKS if not any(row["symbol"] == symbol for row in equities)]},
                "sectorals": [row for row in indices if row["name"] not in {"NIFTY 50", "SENSEX"}],
                "movers": {"gainers": gainers, "losers": losers,
                           "scope": "tracked-universe", "sessionDate": newest_day.isoformat() if newest_day else None},
                "mutualFunds": extras["mutualFunds"], "ipo": ipo, "nfo": extras["nfo"], "ipoLastCheckedAt": iso(now),
                "fiidii": {}, "sourceHealth": health,
                "errors": {key: receipt["message"] for key, receipt in health.items() if receipt["status"] == "failed"}}
    return snapshot


def validate(snapshot, now):
    collected = datetime.fromisoformat(snapshot["generatedAt"].replace("Z", "+00:00"))
    if collected > now + timedelta(minutes=5) or now - collected > timedelta(hours=24):
        raise ValueError("Market collection is stale or future-dated")
    rows = snapshot.get("indices") or []
    if len(rows) < 3 or not any(row.get("name") == "NIFTY 50" for row in rows):
        raise ValueError("At least three recent India indices, including NIFTY 50, are required")
    for row in rows:
        stamp = datetime.fromisoformat(row["quoteAt"].replace("Z", "+00:00"))
        if number(row.get("value")) is None or number(row.get("value")) <= 0 or stamp > now + timedelta(minutes=5) or now - stamp > timedelta(days=5):
            raise ValueError("Unqualified index value or source quote timestamp")
    # Optional additive equities collection; older snapshots need not carry it.
    equities = snapshot.get("equities", [])
    if not isinstance(equities, list) or len(equities) > len(STOCKS):
        raise ValueError("Invalid tracked equity collection")
    seen = set()
    for row in equities:
        symbol = row.get("symbol")
        if symbol not in STOCKS or row.get("id") != f"equity:NSE:{symbol}" or symbol in seen:
            raise ValueError("Unqualified or duplicate NSE equity identity")
        seen.add(symbol)
        stamp = datetime.fromisoformat(str(row.get("quoteAt", "")).replace("Z", "+00:00"))
        if stamp.tzinfo is None or stamp > now + timedelta(minutes=5) or now - stamp > timedelta(days=5):
            raise ValueError("Unqualified equity quote timestamp")
        if number(row.get("value")) is None or number(row["value"]) <= 0 or row.get("currency") != "INR" or row.get("sourceAuthority") != "third-party":
            raise ValueError("Unqualified equity price/provenance")
    return {"status": "WARN" if snapshot.get("errors") else "PASS", "indices": len(rows),
            "equities": len(equities), "failures": snapshot.get("errors", {})}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="public/data")
    parser.add_argument("--validate")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    if args.validate:
        print(json.dumps(validate(json.loads(Path(args.validate).read_text(encoding="utf-8")), now), indent=2))
        return
    snapshot = acquire(now)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    # Uncommitted attempt evidence survives a failed gate without changing the last
    # published snapshot or its timestamps. Only qualified public files are staged.
    (output / "market_refresh_attempt.json").write_bytes((json.dumps({"generatedAt": iso(now), "sources": snapshot["sourceHealth"]}, indent=2) + "\n").encode("utf-8"))
    result = validate(snapshot, now)
    payloads = {"market_snapshot.json": snapshot,
                "mutual_fund_snapshot.json": {"generatedAt": iso(now), "mutualFunds": snapshot["mutualFunds"], "sourceHealth": snapshot["sourceHealth"]["mutualFunds"]},
                "market_source_health.json": {"generatedAt": iso(now), "validation": result, "sources": snapshot["sourceHealth"]}}
    for name, payload in payloads.items():
        target = output / name
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes((json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        temporary.replace(target)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
