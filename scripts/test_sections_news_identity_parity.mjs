import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalNewsUrl } from '../src/services/newsStoryIdentity.js';
import { parseLiveFeedText } from './sections-live/sectionsLiveAuthority.mjs';

const tamilPath = 'https://example.org/தமிழ்/செய்தி';
const escapedTamil = new URL(tamilPath).href;
const vectors = [
  [tamilPath, escapedTamil],
  [escapedTamil.replace(/%[A-F0-9]{2}/g, escape => escape.toLowerCase()), escapedTamil],
  ['https://example.org/News?q=~story&z=*', 'https://example.org/News?q=%7Estory&z=*'],
  ['https://example.org/A%7e%2f%3f%25/', 'https://example.org/A~%2F%3F%25'],
  ['HTTPS://WWW.Example.org.:443/a/b/%2e%2e/c?UTM_source=feed&x=a%20b', 'https://example.org/a/c?x=a+b'],
  ['https://example.org/e?id=42', 'https://example.org/e?id=42'],
  ['https://example.org/e?id=43', 'https://example.org/e?id=43'],
  ['https://news.google.com/rss?oc=5&url=broken', 'https://news.google.com/rss?url=broken'],
  ['https://news.google.com/rss?url=' + encodeURIComponent(tamilPath), escapedTamil],
  ['https://news.google.com/rss?url=https%3A%2F%2Fwww.news.google.com%2Floop', 'https://news.google.com/rss?url=https%3A%2F%2Fwww.news.google.com%2Floop'],
  ['http://[2001:0DB8:0:0::2]:80/a', 'http://[2001:db8::2]/a'],
  ['https://xn--fa-hia.de/Été', 'https://xn--fa-hia.de/%C3%89t%C3%A9'],
  ['https://faß.de/e', ''],
  ['https://user@example.org/e', ''],
  ['https://example.org\\evil.test/e', ''],
  ['http://127.1/e', ''],
  ['https://example.org/a?%F0%90%80%80=1&%EE%80%80=2&x=2&x=1', 'https://example.org/a?x=2&x=1&%F0%90%80%80=1&%EE%80%80=2'],
  ['https://[::FFFF:127.0.0.1]/article', 'https://[::ffff:7f00:1]/article'],
  ['https://example.org/a/\u0085', 'https://example.org/a/%C2%85'],
  ['https://example.org/a/\uFEFF', 'https://example.org/a'],
  ['https://example.org/a/\u001D', ''],
  ['https://example.org/a//', 'https://example.org/a//'],
  ['https://example.org/amp/amp/news/amp/AMP/', 'https://example.org/news'],
  ['https://xn--a.de/news', ''],
  ['https://news.google.com/rss?url=https%3A%2F%2Fxn--a.de%2Fnews', 'https://news.google.com/rss?url=https%3A%2F%2Fxn--a.de%2Fnews'],
];

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const external = JSON.parse(execFileSync(python, ['-X', 'utf8', '-B', '-c', [
  'import json,sys',
  'sys.path.insert(0,"scripts")',
  'from sections_news_identity import canonical_news_url,section_story_id',
  'print(json.dumps([[canonical_news_url(u),section_story_id({"url":u,"id":None}),canonical_news_url(canonical_news_url(u))] for u in json.load(sys.stdin)]))',
].join('\n')], { input: JSON.stringify(vectors.map(([url]) => url)), encoding: 'utf-8' }));

const digest = key => createHash('sha1').update(key).digest('hex').slice(0, 16);
vectors.forEach(([raw, expected], index) => {
  assert.equal(canonicalNewsUrl(raw), expected, 'JavaScript ' + raw);
  assert.equal(canonicalNewsUrl(expected), expected, 'JavaScript canonical form ' + raw);
  assert.deepEqual(external[index], [expected, expected ? digest(expected) : null, expected], 'Python ' + raw);
});

const now = Date.parse('2026-11-17T08:00:00.000Z');
const lane = { sectionKey: 'tn', sourceName: 'Publisher', sourceGroup: 'publisher' };
const urls = [tamilPath, escapedTamil, vectors[5][0], vectors[6][0]];
const rss = '<rss><channel>' + urls.map((url, index) =>
  '<item><title>Report ' + index + '</title><link>' + url + '</link><pubDate>Tue, 17 Nov 2026 07:00:00 GMT</pubDate></item>'
).join('') + '</channel></rss>';
const result = parseLiveFeedText(rss, lane, now);
assert.deepEqual(result.items.map(item => item.id), [external[0][1], external[5][1], external[6][1]]);
assert.equal(result.diagnostics.duplicatesRejected, 1);
console.log('Section URL canonicalization parity: ' + vectors.length + ' vectors and controlled live RSS replay passed.');
