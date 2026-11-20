from datetime import datetime, timezone, timedelta
import json
import pytest
from refresh_india_market import acquire, parse_chart, parse_nav, parse_bse, parse_nfo, validate, INDICES, STOCKS, iso, IST

NOW = datetime(2026, 11, 16, 10, tzinfo=timezone.utc)


def chart(quote_at=NOW, price=102, bars=None):
    if bars is None:
        bars = [(quote_at - timedelta(days=2), 99), (quote_at - timedelta(days=1), 100), (quote_at, price)]
    return {"chart": {"result": [{"meta": {"regularMarketTime": quote_at.timestamp(), "regularMarketPrice": price},
                                  "timestamp": [day.timestamp() for day, _ in bars],
                                  "indicators": {"quote": [{"close": [close for _, close in bars]}]}}]}}


def test_quote_keeps_actual_provider_clock_and_daily_change():
    row = parse_chart(chart(NOW - timedelta(days=2)), "NIFTY 50", "^NSEI", NOW)
    assert row["quoteAt"] == "2026-11-14T10:00:00Z"
    assert row["change"] == "2.00"
    assert row["changePercent"] == "2.00"


@pytest.mark.parametrize("current_bar", [[], [(NOW, None)], [(NOW, 101)]])
def test_quote_uses_latest_earlier_session_with_or_without_a_current_bar(current_bar):
    bars = [(NOW - timedelta(days=4), 99), (NOW - timedelta(days=3), 100), *current_bar]
    row = parse_chart(chart(bars=bars), "NIFTY 50", "^NSEI", NOW)
    assert row["change"] == "2.00"
    assert row["changePercent"] == "2.00"


def test_quote_excludes_current_ist_day_and_later_bars():
    # This current-session bar begins on the previous UTC date.
    current_bar = datetime(2026, 11, 15, 18, 30, tzinfo=timezone.utc)
    bars = [(NOW + timedelta(days=1), 900), (NOW - timedelta(days=3), 100), (current_bar, 900)]
    row = parse_chart(chart(bars=bars), "NIFTY 50", "^NSEI", NOW)
    assert row["change"] == "2.00"


@pytest.mark.parametrize("bars", [
    [(NOW, 102)],
    [(NOW - timedelta(days=4), 99), (NOW - timedelta(days=3), None), (NOW, 102)],
])
def test_quote_rejects_missing_prior_session_close(bars):
    with pytest.raises(ValueError, match="previous daily close"):
        parse_chart(chart(bars=bars), "NIFTY 50", "^NSEI", NOW)


def test_quote_rejects_unaligned_daily_bars():
    payload = chart()
    payload["chart"]["result"][0]["timestamp"].pop()
    with pytest.raises(ValueError, match="not aligned"):
        parse_chart(payload, "NIFTY 50", "^NSEI", NOW)


@pytest.mark.parametrize("payload", [chart(NOW - timedelta(days=6)), chart(NOW + timedelta(hours=1)), chart(price=-1)])
def test_old_future_or_negative_quote_never_gets_refreshed(payload):
    with pytest.raises(ValueError):
        parse_chart(payload, "NIFTY 50", "^NSEI", NOW)


def test_nav_uses_real_date_and_only_recent_eligible_rows():
    source = "Code;ISIN;Reinvest;Name;NAV;Date\n100001;;;Nifty Direct Growth;123.5;13-Nov-2026\n100002;;;Old Direct Growth;10;01-Jul-2026\n100003;;;Nifty Regular Growth;123;13-Nov-2026"
    rows = parse_nav(source, NOW)
    assert len(rows) == 1
    assert rows[0]["navDate"] == "2026-11-13"
    assert rows[0]["nav"] == 123.5


def test_nav_current_eight_columns_keep_plan_option_and_real_value():
    source = "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n100001;;;HDFC Nifty 50;Direct Plan;Growth Option;123.5;13-Nov-2026\n100002;;;HDFC Nifty 50;Regular Plan;Growth Option;122;13-Nov-2026"
    rows = parse_nav(source, NOW)
    assert len(rows) == 1
    assert rows[0]["name"] == "HDFC Nifty 50 - Direct Plan - Growth Option"
    assert rows[0]["nav"] == 123.5


def test_bse_qualifies_complete_offers_and_india_closing_day():
    rows = [{"COMPANY_NAME": "Fixture issue", "OPEN_DATE": "01-Nov-2026", "CLOSE_DATE": "16-Nov-2026"}]
    assert parse_bse(rows, NOW)[0]["status"] == "live"
    with pytest.raises(ValueError):
        parse_bse(rows, datetime(2026, 11, 16, 18, 30, tzinfo=timezone.utc))
    assert parse_bse([], NOW) == []  # Successful zero differs from unrecognized response.
    with pytest.raises(ValueError):
        parse_bse({"blocked": True}, NOW)


def test_nfo_rss_does_not_infer_open_status_from_launch_date():
    body = """<rss><channel><item><title>Fixture NFO</title><description><![CDATA[
    <table><tr><td><b>Launch Date</b></td><td>15-Nov-2026</td></tr></table>
    ]]></description></item></channel></rss>"""
    row = parse_nfo(body, NOW)[0]
    assert row["status"] == "announced"
    assert row["openDate"] == "2026-11-15"
    assert row["closeDate"] is None
    closed = body.replace("</table>", "<tr><td>Closure Date</td><td>14-Nov-2026</td></tr></table>")
    with pytest.raises(ValueError):
        parse_nfo(closed, NOW)
    with pytest.raises(ValueError):
        parse_nfo("<html><table /></html>", NOW)


def test_failure_is_preserved_without_carrying_old_sidecars():
    calls = []
    def getter(url):
        calls.append(url)
        if "finance.yahoo" in url:
            return json.dumps(chart())
        raise RuntimeError("source blocked")
    snapshot = acquire(NOW, getter)
    assert len(calls) == len(INDICES) + len(STOCKS) + 3 == 25
    assert snapshot["nfo"] == []
    assert snapshot["sourceHealth"]["nfo"]["status"] == "failed"
    assert snapshot["sourceHealth"]["mutualFunds"]["status"] == "failed"
    assert validate(snapshot, NOW)["status"] == "WARN"
    assert snapshot["indices"][0]["quoteAt"] == "2026-11-16T10:00:00Z"


def test_core_failure_blocks_publication_even_if_collection_clock_is_new():
    snapshot = {"generatedAt": "2026-11-16T10:00:00Z", "indices": []}
    with pytest.raises(ValueError, match="three"):
        validate(snapshot, NOW)
    rows = [parse_chart(chart(), name, symbol, NOW) for name, symbol in list(INDICES.items())[:3]]
    snapshot["indices"] = rows
    rows[0]["quoteAt"] = "2026-07-21T10:00:00Z"
    with pytest.raises(ValueError, match="timestamp"):
        validate(snapshot, NOW)


def test_validator_rejects_stale_collection_independently():
    with pytest.raises(ValueError, match="collection"):
        validate({"generatedAt": "2026-07-21T10:00:00Z"}, NOW)


def test_all_sixteen_qualified_equities_are_published_without_new_upstream_requests():
    calls = []
    def getter(url):
        calls.append(url)
        if "finance.yahoo" in url:
            return json.dumps(chart())
        raise RuntimeError("source unavailable")
    snapshot = acquire(NOW, getter)
    assert len(calls) == len(INDICES) + len(STOCKS) + 3 == 25
    assert len(snapshot["equities"]) == 16
    assert snapshot["equityCoverage"] == {"universeSize": 16, "quotedCount": 16, "unavailableSymbols": []}
    assert snapshot["sourceHealth"]["equities"]["status"] == "snapshot"
    assert [row["symbol"] for row in snapshot["equities"]] == STOCKS
    assert all(row["id"] == f"equity:NSE:{row['symbol']}" for row in snapshot["equities"])
    assert all(row["providerSymbol"] == f"{row['symbol']}.NS" for row in snapshot["equities"])
    assert all(row["value"] == 102.0 and row["quoteAt"] == iso(NOW) for row in snapshot["equities"])
    assert all(row["currency"] == "INR" and row["sourceAuthority"] == "third-party" for row in snapshot["equities"])
    assert all(row["sourceUrl"].startswith("https://query1.finance.yahoo.com/v8/finance/chart/") for row in snapshot["equities"])
    assert snapshot["movers"]["scope"] == "tracked-universe"
    assert snapshot["movers"]["sessionDate"] == NOW.astimezone(IST).date().isoformat()
    assert validate(snapshot, NOW)["equities"] == 16


def test_failed_equity_is_not_fabricated_and_does_not_block_valid_indices():
    calls = []
    def getter(url):
        calls.append(url)
        if "WIPRO.NS" in url:
            raise ConnectionError("WIPRO unavailable")
        if "finance.yahoo" in url:
            return json.dumps(chart())
        raise RuntimeError("optional source failed")
    snapshot = acquire(NOW, getter)
    assert len(calls) == 25
    assert len(snapshot["equities"]) == 15
    assert snapshot["equityCoverage"]["unavailableSymbols"] == ["WIPRO"]
    assert snapshot["sourceHealth"]["equities"]["status"] == "partial"
    assert snapshot["sourceHealth"]["WIPRO"]["status"] == "failed"
    assert all(row["symbol"] != "WIPRO" for row in snapshot["equities"])
    assert validate(snapshot, NOW)["status"] == "WARN"


def test_movers_use_one_source_day_and_not_the_whole_nse_exchange():
    def getter(url):
        if "finance.yahoo" in url:
            quote_at = NOW - timedelta(days=1) if "WIPRO.NS" in url else NOW
            return json.dumps(chart(quote_at=quote_at))
        raise RuntimeError("optional source failed")
    snapshot = acquire(NOW, getter)
    assert len(snapshot["equities"]) == 16
    assert snapshot["movers"]["scope"] == "tracked-universe"
    assert snapshot["movers"]["sessionDate"] == NOW.astimezone(IST).date().isoformat()
    assert "WIPRO" not in {row["symbol"] for row in snapshot["movers"]["gainers"] + snapshot["movers"]["losers"]}


@pytest.mark.parametrize("mutate", [
    lambda row: row.update(id="equity:NSE:UNRELATED"),
    lambda row: row.update(value=0),
    lambda row: row.update(quoteAt="2026-12-01T00:00:00Z"),
    lambda row: row.update(sourceAuthority="official"),
    lambda row: row.update(currency="USD"),
])
def test_publisher_rejects_unqualified_equity_observations(mutate):
    from copy import deepcopy
    def getter(url):
        if "finance.yahoo" in url:
            return json.dumps(chart())
        raise RuntimeError("source unavailable")
    snapshot = acquire(NOW, getter)
    bad = deepcopy(snapshot)
    mutate(bad["equities"][0])
    with pytest.raises(ValueError, match="equity"):
        validate(bad, NOW)


def test_publisher_rejects_duplicate_equity_and_retains_old_snapshot_compatibility():
    def getter(url):
        if "finance.yahoo" in url:
            return json.dumps(chart())
        raise RuntimeError("source unavailable")
    snapshot = acquire(NOW, getter)
    snapshot["equities"].append(snapshot["equities"][0].copy())
    with pytest.raises(ValueError, match="equity"):
        validate(snapshot, NOW)
    del snapshot["equities"]
    assert validate(snapshot, NOW)["equities"] == 0
