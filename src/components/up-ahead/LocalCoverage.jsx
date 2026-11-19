import React from 'react';
import { getUpAheadLocalCoverage } from '../../services/upAheadCoverage.js';

const LABEL = { checked: 'sources checked', partial: 'some sources unavailable',
  unknown: 'coverage unverified', unavailable: 'sources unavailable', disabled: 'disabled in settings' };
const clock = value => new Date(value).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export default function LocalCoverage({ data, categories, settings, locations, alerts = false }) {
  const coverage = getUpAheadLocalCoverage({ data, categories, settings, locations });
  return <aside className="ua-local-coverage" aria-label="Local source coverage">
    <p>{coverage.cities.map(row => `${row.city}: ${LABEL[row.status]}`).join(' · ')}</p>
    {coverage.bulletins.map(row => <div key={row.id} className="ua-local-bulletin" data-source-status={row.status}>
      <strong>{row.source} · {row.city}</strong>
      <p>{row.message}</p>
      <small>{row.issuedAt > 0 ? `Issued ${clock(row.issuedAt)}` : row.checkedAt > 0 ? `Checked ${clock(row.checkedAt)}` : 'Check time unavailable'}
        {row.validUntil > 0 && ` · Bulletin valid until ${clock(row.validUntil)}`}
        {' · '}<a href={row.url} target="_blank" rel="noopener noreferrer">Source ↗</a>
      </small>
    </div>)}
    {alerts && <small>Only dated matching notices are listed. An unavailable source or an empty news search does not establish that your area is unaffected.</small>}
  </aside>;
}
