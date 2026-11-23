import unittest
from datetime import datetime, timezone

from refresh_market_economy_news import build_feed

NOW = datetime(2026, 11, 24, 3, tzinfo=timezone.utc)
FINANCE = "<h3>Ministry of Finance</h3>"
STATISTICS = "<h3>Ministry of Statistics &amp; Programme Implementation</h3>"


def release(code, day, title="Official release", href=None):
    href = href or f"/PressReleseDetail.aspx?PRID={code}"
    return (
        f'<li><a title="{title}" href="{href}">Short title…</a>'
        f'<span class="publishdatesmall">Posted on: {day}</li>'
    )


class OfficialReleaseFeedTest(unittest.TestCase):
    def test_captures_official_identity_and_filters_outside_ministries_and_dates(self):
        markup = (
            FINANCE + release("2331234", "20 Nov 2026", "Fiscal announcement")
            + release("2331235", "25 Nov 2026")
            + release("2331236", "31 Nov 2026")
            + release("2331237", "20 Nov 2026", href="https://example.com/PressReleseDetail.aspx?PRID=2331237")
            + "<h3>Other ministry</h3>" + release("2331238", "22 Nov 2026")
            + STATISTICS + release("2331239", "22 Nov 2026", "Consumer price index")
        )
        feed = build_feed(markup, {}, NOW)
        self.assertEqual(feed["checkedAt"], "2026-11-24T03:00:00.000Z")
        self.assertEqual([row["id"] for row in feed["items"]], ["2331239", "2331234"])
        self.assertEqual(feed["items"][0]["headline"], "Consumer price index")
        self.assertEqual(feed["items"][0]["ministry"], "Ministry of Statistics and Programme Implementation")
        self.assertEqual(feed["items"][0]["url"], "https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2331239&lang=1&reg=20")

    def test_merges_previous_month_and_caps_feed(self):
        prior = build_feed(FINANCE + release("2331234", "28 Oct 2026"), {}, NOW)
        fresh = FINANCE + "".join(release(str(2331300 + i), "24 Nov 2026") for i in range(19))
        output = build_feed(fresh + release("2331300", "24 Nov 2026"), prior, NOW)
        self.assertEqual(len(output["items"]), 20)
        self.assertEqual(output["items"][-1]["id"], "2331234")

    def test_empty_and_changed_index_refuse_publication(self):
        prior = build_feed(FINANCE + release("2331234", "20 Nov 2026"), {}, NOW)
        for markup in ("", "<h2>Unrecognized index layout</h2>", FINANCE + release("2331234", "20 Oct 2026")):
            with self.subTest(markup=markup), self.assertRaisesRegex(ValueError, "no recent"):
                build_feed(markup, prior, NOW)
        self.assertEqual(prior["items"][0]["id"], "2331234")


if __name__ == "__main__":
    unittest.main()
