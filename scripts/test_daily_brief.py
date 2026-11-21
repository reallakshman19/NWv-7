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


def test_direct_publisher_excerpt_is_bounded_and_clean():
    from daily_brief import MAX_PREVIEW_CHARS
    rows = qualify_entries([entry(
        summary='<p>Officials said a new transport service will link several districts, '
                'with additional routes expected to begin next month.</p><script>bad()</script>')],
        'thehindu.com', NOW)
    assert len(rows) == 1
    assert rows[0]['preview'].startswith('Officials said a new transport')
    assert 'bad()' not in rows[0]['preview']
    assert rows[0]['previewMethod'] == 'publisher-rss-excerpt'
    assert len(rows[0]['preview']) <= MAX_PREVIEW_CHARS + 1


def test_aggregator_and_headline_only_feeds_cannot_gain_previews():
    discovery = entry(link='https://news.google.com/rss/articles/ABC',
                      source={'href': 'https://www.dinamani.com'},
                      summary='<p>Unrelated aggregator teaser is not a publisher synopsis.</p>')
    assert 'preview' not in qualify_entries([discovery], 'dinamani.com', NOW)[0]
    assert 'preview' not in qualify_entries([entry(summary='A current publisher headline')],
                                            'thehindu.com', NOW)[0]
    assert 'preview' not in qualify_entries([entry()], 'thehindu.com', NOW)[0]


def test_publisher_excerpt_truncates_on_word_boundary():
    from daily_brief import MAX_PREVIEW_CHARS
    result = qualify_entries([entry(summary='A detailed publisher synopsis ' * 25)],
                             'thehindu.com', NOW)[0]
    assert result['preview'].endswith('…')
    assert len(result['preview']) <= MAX_PREVIEW_CHARS + 1


def test_direct_feed_content_synopsis_is_used_when_description_is_only_a_title():
    rows = qualify_entries([entry(
        summary='A current publisher headline',
        content=[{'type': 'text/html', 'value':
                  '<p>Officials published details of a district-wide school programme '
                  'and said additional resources will be distributed next month.</p>'}])],
        'thehindu.com', NOW)
    assert rows[0]['preview'].startswith('Officials published details')
    assert rows[0]['previewMethod'] == 'publisher-rss-excerpt'


def test_aggregator_content_is_not_promoted_to_publisher_excerpt():
    rows = qualify_entries([entry(
        link='https://news.google.com/rss/articles/abc',
        source={'href': 'https://www.dinamani.com'},
        content=[{'value': 'A third-party description containing more than forty-five characters.'}])],
        'dinamani.com', NOW)
    assert len(rows) == 1
    assert 'preview' not in rows[0]


def test_publication_counts_available_previews_per_publisher():
    rows = qualify_entries([
        entry(title='Story with details', summary='The publisher reported additional service routes across several districts next month.'),
        entry(title='Headline-only item', link='https://www.thehindu.com/news/second.ece'),
    ], 'thehindu.com', NOW)
    result = build_publication([{'sourceId': 'THE_HINDU', 'page': 'Front Page',
                                 'url': 'https://www.thehindu.com/feed', 'ok': True,
                                 'articles': rows, 'currentCount': 2}], NOW)
    assert result['sourceStatus']['THE_HINDU']['currentCount'] == 2
    assert result['sourceStatus']['THE_HINDU']['previewCount'] == 1
    assert result['sourceStatus']['DINAMANI']['previewCount'] == 0


def test_daily_thanthi_prefers_publisher_xml_and_retains_discovery_recovery():
    from daily_brief import SOURCES
    direct = SOURCES['DAILY_THANTHI']['feeds']
    fallback = SOURCES['DAILY_THANTHI']['fallbackFeeds']
    assert len(direct) == 1 and direct[0][1] == 'https://www.dailythanthi.com/feed'
    assert len(fallback) == 1 and 'news.google.com' in fallback[0][1]

    calls = []
    def fetcher(task, now):
        key, domain, page, url = task
        calls.append(url)
        is_direct = url == direct[0][1]
        rows = qualify_entries([entry(
            title='தமிழகப் போக்குவரத்துச் சேவைகள் விரிவாக்கம்',
            link='https://www.dailythanthi.com/news/tamilnadu/transport',
            summary='<p>மாவட்டங்களுக்கு இடையே புதிய போக்குவரத்துச் சேவைகள் அடுத்த மாதம் '
                    'தொடங்கப்படும் என்று அதிகாரிகள் தெரிவித்தனர்.</p>')], domain, now)
        if key == 'DAILY_THANTHI' and not is_direct:
            rows = []
        return {'sourceId': key, 'page': page, 'url': url, 'ok': True,
                'articles': rows, 'currentCount': len(rows)}
    edition = collect_publication(NOW, fetcher)
    assert edition['sourceStatus']['DAILY_THANTHI']['previewCount'] == 1
    assert edition['sources']['DAILY_THANTHI'][0]['articles'][0]['acquiredVia'] == 'publisher-rss'
    assert fallback[0][1] not in calls


def test_daily_thanthi_falls_back_to_headlines_on_official_feed_failure():
    from daily_brief import SOURCES
    direct = SOURCES['DAILY_THANTHI']['feeds'][0][1]
    recovery = SOURCES['DAILY_THANTHI']['fallbackFeeds'][0][1]
    called = []
    def fetcher(task, now):
        key, domain, page, url = task
        called.append(url)
        if key == 'DAILY_THANTHI' and url == direct:
            return {'sourceId': key, 'page': page, 'url': url, 'ok': False,
                    'articles': [], 'currentCount': 0, 'error': '403 Forbidden'}
        rows = qualify_entries([entry(
            link='https://news.google.com/rss/articles/abc',
            source={'href': 'https://dailythanthi.com'},
            summary='This is a Google discovery entry, not a publisher-authored description.')],
            domain, now) if key == 'DAILY_THANTHI' else []
        return {'sourceId': key, 'page': page, 'url': url, 'ok': True,
                'articles': rows, 'currentCount': len(rows)}
    result = collect_publication(NOW, fetcher)
    assert direct in called and recovery in called
    assert result['sourceStatus']['DAILY_THANTHI']['currentCount'] == 1
    assert result['sourceStatus']['DAILY_THANTHI']['previewCount'] == 0
