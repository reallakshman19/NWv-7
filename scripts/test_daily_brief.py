import calendar
import time
import pytest
from daily_brief import build_publication, qualify_entries, collect_publication

NOW = calendar.timegm(time.strptime('2026-11-16', '%Y-%m-%d'))


def entry(**changes):
    value = {'title': 'A current publisher headline', 'link': 'https://www.thehindu.com/news/article.ece',
             'published_parsed': time.gmtime(NOW - 3600)}
    return {**value, **changes}


def test_rejects_undated_stale_and_future_even_when_feed_is_retrieved_today():
    rows = [entry(published_parsed=None), entry(published_parsed=time.gmtime(NOW - 49 * 3600)),
            entry(published_parsed=time.gmtime(NOW + 3600))]
    assert qualify_entries(rows, 'thehindu.com', NOW) == []


def test_discovery_requires_exact_publisher_domain():
    rows = [entry(link='https://news.google.com/rss/articles/1', source={'href': 'https://www.dinamani.com'}),
            entry(link='https://news.google.com/rss/articles/2', source={'href': 'https://dinamani.com.evil.example'})]
    qualified = qualify_entries(rows, 'dinamani.com', NOW)
    assert len(qualified) == 1
    assert qualified[0]['acquiredVia'] == 'google-news-publisher-discovery'
    assert qualified[0]['publishedAt'] == (NOW - 3600) * 1000


def test_all_failed_or_empty_acquisition_cannot_publish_a_new_timestamp():
    with pytest.raises(ValueError, match='refusing'):
        build_publication([], NOW)


def test_partial_source_failure_is_explicit_and_never_relabelled():
    articles = qualify_entries([entry()], 'thehindu.com', NOW)
    result = build_publication([{'sourceId': 'THE_HINDU', 'page': 'Front Page', 'url': 'https://www.thehindu.com/feed',
                                 'ok': True, 'articles': articles, 'currentCount': 1}], NOW)
    assert len(result['sources']['THE_HINDU'][0]['articles']) == 1
    assert result['sources']['DAILY_THANTHI'] == []
    assert result['sourceStatus']['DAILY_THANTHI']['currentCount'] == 0
    assert result['lastUpdated'].endswith('+00:00')


@pytest.mark.parametrize('direct_available', [True, False])
def test_publisher_recovery_runs_only_when_its_direct_feeds_have_no_qualified_articles(direct_available):
    calls = []
    def fetcher(task, now):
        key, domain, page, url = task
        calls.append(url)
        is_discovery = 'news.google.com' in url
        rows = qualify_entries([entry(link='https://' + domain + '/current-story')], domain, now)
        if key == 'INDIAN_EXPRESS' and not direct_available and not is_discovery:
            rows = []
        return {'sourceId': key, 'page': page, 'url': url, 'ok': bool(rows), 'articles': rows, 'currentCount': len(rows)}
    result = collect_publication(NOW, fetcher)
    recovery = [url for url in calls if 'site:indianexpress.com' in url]
    assert len(recovery) == (0 if direct_available else 1)
    assert result['sourceStatus']['INDIAN_EXPRESS']['currentCount'] == 1
    assert result['sources']['INDIAN_EXPRESS'][0]['articles'][0]['publishedAt'] == (NOW - 3600) * 1000
