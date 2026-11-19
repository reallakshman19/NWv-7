"""Deterministic market live diagnostic contract. No network calls in tests."""
from datetime import datetime, timezone, timedelta
import json
import threading
from unittest.mock import patch

import pytest
import market_live_dryrun as mod

NOW = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)


def chart():
    bars = [(NOW-timedelta(days=2), 99), (NOW-timedelta(days=1), 100), (NOW, 102)]
    return json.dumps({"chart":{"result":[{
        "meta":{"regularMarketTime": NOW.timestamp(), "regularMarketPrice":102},
        "timestamp":[dt.timestamp() for dt,_ in bars],
        "indicators":{"quote":[{"close":[value for _,value in bars]}]}
    }]}})


def fixtures(failed_urls=()):
    requests=[]
    lock=threading.Lock()
    def getter(url):
        with lock:
            requests.append(url)
        if any(part in url for part in failed_urls):
            raise ConnectionError("simulated response leaked secret-price-999999")
        if url.startswith("https://query1.finance.yahoo.com/v8/finance/chart/"):
            return chart()
        # Optional sources are deliberately unavailable; no fake NAV/IPO rows.
        raise ConnectionError("simulated optional source unavailable")
    return getter,requests


def run(getter):
    return mod.run(now=NOW,getter=getter)


def test_allowlist_is_exactly_bounded_and_has_no_unexpected_hosts():
    assert len(mod.ALLOWED_URLS)==25
    assert sum("finance.yahoo.com" in url for url in mod.ALLOWED_URLS)==22
    assert sum("amfiindia.com" in url for url in mod.ALLOWED_URLS)==2
    assert sum("bseindia.com" in url for url in mod.ALLOWED_URLS)==1


def test_full_source_fixture_runs_once_per_url_and_keeps_raw_prices_private():
    getter, requests=fixtures()
    report=run(getter)
    assert report["status"]=="PROBE_COMPLETED"
    assert report["requestContract"]["attempted"]==25
    assert report["requestContract"]["distinct"]==25
    assert report["requestContract"]["denied"]==0
    assert len(requests)==len(set(requests))==25
    assert report["coverage"]["indexObserved"]==6
    assert report["coverage"]["equityObserved"]==16
    assert report["coverage"]["unavailableSymbols"]==[]
    assert report["publisherValidation"]["status"]=="WARN"  # Optional sources failed.
    assert report["readiness"]["technicalStatus"]=="PASS"
    assert report["technicalStatus"]=="PASS"
    assert report["releaseStatus"]=="HOLD"
    assert report["rightsStatus"]=="UNVERIFIED"
    assert len(report["candidateSha256"])==64
    assert report["candidateByteCount"]>1000
    receipt=json.dumps(report)
    assert "secret-price-999999" not in receipt
    assert '"value"' not in receipt and '"price"' not in receipt
    assert "regularMarketPrice" not in receipt
    assert "https://query1.finance.yahoo.com" not in receipt


def test_single_equity_failure_is_partial_without_duplicating_request():
    getter,requests=fixtures(failed_urls=("WIPRO.NS",))
    report=run(getter)
    assert report["coverage"]["equityObserved"]==15
    assert report["coverage"]["unavailableSymbols"]==["WIPRO"]
    assert report["sourceReceipt"]["WIPRO"]["status"]=="failed"
    assert report["technicalStatus"]=="PASS"  # 15 qualified equities are real.
    assert report["readiness"]["notes"][0]["code"]=="PARTIAL_EQUITY_COVERAGE"
    assert len(requests)==25


def test_all_core_indices_fail_closed_without_republished_quote():
    getter,requests=fixtures(failed_urls=("^NSEI","%5ENSEI","^BSESN","%5EBSESN","^NSEBANK","%5ENSEBANK"))
    report=run(getter)
    assert report["technicalStatus"]=="HOLD"
    assert report["publisherValidation"]["status"]=="HOLD"
    assert report["releaseStatus"]=="HOLD"
    assert len(requests)==25


def test_getter_refuses_unknown_hosts_and_duplicate_calls_without_transport():
    calls=[]
    getter=mod.BoundedGetter(lambda url:(calls.append(url),"ok")[1])
    url=next(iter(mod.ALLOWED_URLS))
    assert getter(url)=="ok"
    with pytest.raises(mod.BudgetExceeded):
        getter(url)
    with pytest.raises(mod.BudgetExceeded):
        getter("https://attacker.example/quote")
    assert calls==[url]
    assert getter.denied==2 and getter.attempt_count==1


def test_budget_blocks_more_than_25_distinct_requests():
    getter=mod.BoundedGetter(lambda url:"ok")
    for url in mod.ALLOWED_URLS:
        getter(url)
    assert getter.attempt_count==25
    with pytest.raises(mod.BudgetExceeded):
        getter("https://example.invalid/26th")
    assert getter.denied==1


def test_runtime_exception_never_leaks_provider_exception_or_candidate():
    with patch.object(mod,"acquire",side_effect=RuntimeError("secret-price-999999")):
        report=run(lambda _:None)
    assert report["status"]=="PROBE_ERROR"
    assert report["technicalStatus"]=="HOLD"
    assert report["releaseStatus"]=="HOLD"
    assert "secret-price-999999" not in json.dumps(report)


def test_source_clock_ranges_report_observation_times_not_price():
    getter,_=fixtures()
    report=run(getter)
    assert report["coverage"]["sourceIndexTimes"]["newestAt"]==mod.iso(NOW)
    assert report["coverage"]["sourceEquityTimes"]["oldestAt"]==mod.iso(NOW)
    assert report["checkedAt"]==mod.iso(NOW)


def test_timezones_are_mandatory_for_collector_clock():
    with pytest.raises(ValueError,match="timezone"):
        mod.run(now=datetime(2026,11,19,10,0),getter=lambda _:None)


def test_subprocess_readiness_does_not_write_public_artifact():
    getter,_=fixtures()
    # The real Node checker runs against an isolated ephemeral candidate.
    before=set(mod.ROOT.glob("public/data/*"))
    report=run(getter)
    after=set(mod.ROOT.glob("public/data/*"))
    assert before==after
    assert report["readiness"]["manualBlocks"][0]["code"]=="RIGHTS_UNVERIFIED"


@pytest.mark.parametrize(("message","expected"),[
    ("429 Client Error: Too Many Requests for url:https://unsafe/data?price=102", "HTTP_429"),
    ("403 Client Error: Forbidden for url:https://unsafe/data?price=102", "HTTP_403"),
    ("HTTPSConnectionPool(host='unsafe'): ReadTimeout", "TIMEOUT"),
    ("Quote timestamp is future-dated or older than five days", "SOURCE_CLOCK_OR_CLOSE"),
    ("Unrecognized AMFI NAV column headings", "PARSE_OR_SCHEMA"),
    ("Source body exceeds four MB", "BODY_LIMIT"),
    ("502 unexplained", "OTHER_SOURCE_FAILURE"),
])
def test_failure_classifier_never_retains_provider_message(message,expected):
    result=mod.classify_failure(message)
    assert result==expected
    assert "unsafe" not in result and "price" not in result.lower()
