from datetime import datetime, timezone, timedelta
import json
import pytest
from refresh_india_market import acquire, parse_chart, parse_nav, parse_bse, parse_nfo, validate, INDICES, STOCKS

NOW = datetime(2026, 11, 16, 10, tzinfo=timezone.utc)


def chart(quote_at=NOW, price=102):
    return {"chart": {"result": [{"meta": {"regularMarketTime": quote_at.timestamp(), "regularMarketPrice": price},
                                  "indicators": {"quote": [{"close": [99, 100, price]}]}}]}}


def test_quote_keeps_actual_provider_clock_and_daily_change():
    row = parse_chart(chart(NOW - timedelta(days=2)), "NIFTY 50", "^NSEI", NOW)
    assert row["quoteAt"] == "2026-11-14T10:00:00Z"
    assert row["change"] == "2.00"
    assert row["changePercent"] == "2.00"


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


def test_nfo_rejects_unrelated_tables_and_qualifies_headers():
    with pytest.raises(ValueError):
        parse_nfo("<table><tr><th>Name</th><th>Other</th></tr></table>", NOW)
    html = "<table><tr><th>Scheme Name</th><th>Opening Date</th><th>Closing Date</th></tr><tr><td>Fixture NFO</td><td>17-Nov-2026</td><td>30-Nov-2026</td></tr></table>"
    assert parse_nfo(html, NOW)[0]["status"] == "upcoming"


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
