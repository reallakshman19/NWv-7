import React, { useEffect, useState } from 'react';
import { publicDataUrl } from '../../../data/fetchClient.js';
import { safeGetJson, safeSetJson } from '../../../data/safeStorage.js';
import { boundedMarketJson } from '../../../services/marketJsonRequest.js';
import {
  ECONOMY_NEWS_ASSET, ECONOMY_NEWS_MAX_BYTES, PIB_RELEASES_URL,
  recentEconomyNews, validateEconomyNews
} from '../../contracts/economyNews.js';

import { recordMarketSourceFailure, recordMarketSourceObservation } from '../health/marketSourceRecorder.js';

const CACHE_KEY = 'nw7.market.economy-news.v1';
const SOURCE_LINKS = [
  ['PIB releases', PIB_RELEASES_URL],
  ['RBI press releases', 'https://www.rbi.org.in/scripts/FS_PressRelease.aspx'],
  ['MoSPI release calendar', 'https://www.mospi.gov.in/advance-release-calendar']
];

function readCachedBriefing() {
  const cached = safeGetJson(CACHE_KEY, null);
  return validateEconomyNews(cached).length ? null : cached;
}

export function EconomyNews() {
  const [briefing, setBriefing] = useState(readCachedBriefing);
  const [status, setStatus] = useState('loading');
  const [viewTime] = useState(Date.now);

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const url = publicDataUrl('data/' + ECONOMY_NEWS_ASSET);
    boundedMarketJson(url, { maxBytes: ECONOMY_NEWS_MAX_BYTES, signal: controller.signal })
      .then(payload => {
        if (controller.signal.aborted) return;
        if (validateEconomyNews(payload).length) throw new Error('Invalid official releases feed');

        const cached = readCachedBriefing();
        const latest = cached?.checkedAt > payload.checkedAt ? cached : payload;
        safeSetJson(CACHE_KEY, latest);
        if (latest === payload) {
          const newest = payload.items.reduce((latest, row) =>
            row.publishedOn > latest.publishedOn ? row : latest);
          recordMarketSourceObservation({
            sourceId: 'pib-economy-news', providerAsOf: newest.publishedOn,
            sourceUrl: newest.url, requestedAt: startedAt
          });
        }
        setBriefing(latest);
        setStatus(latest !== payload ? 'retained' : 'ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        recordMarketSourceFailure('pib-economy-news', error, startedAt);
        setStatus('retained');
      });
    return () => controller.abort();
  }, []);

  const releases = recentEconomyNews(briefing, viewTime);
  const checkedAt = briefing?.checkedAt;
  const delayed = checkedAt && viewTime - Date.parse(checkedAt) > 12 * 3600000;
  return (
    <div className="md3-economy">
      {(status === 'retained' || delayed) && releases.length > 0 && (
        <p role="status">Showing retained official releases.</p>
      )}
      {releases.length > 0 ? (
        <ul className="md3-economy-list">
          {releases.map(({ id, headline, url, publishedOn, ministry }) => (
            <li key={id}>
              <a href={url} target="_blank" rel="noopener noreferrer">{headline}</a>
              <small><time dateTime={publishedOn}>{publishedOn}</time> · {ministry} via PIB</small>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">{status === 'loading' ? 'Checking for official releases…' :
          'Recent releases are unavailable here. Open an official source below.'}</p>
      )}
      {checkedAt && <small>Feed checked <time dateTime={checkedAt}>{checkedAt.slice(0, 16).replace('T', ' ')} UTC</time></small>}
      <div className="md3-link-grid">
        {SOURCE_LINKS.map(([label, url]) => (
          <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>
        ))}
      </div>
    </div>
  );
}
