/**
 * NWv7 Market Desk R2.1 - WP-07 Events Quick Widget Card
 * Embeddable overview widget for Market Overview (WP-01).
 *
 * Conforms to:
 * - Zero-boot network silence: does NOT issue network requests on mount.
 * - Honest navigation actions: never claims unverified active-issue counts (WP07-T23).
 * - Highlights next upcoming market calendar milestone with Asia/Kolkata countdown.
 */

import React, { useState } from 'react';
import { useEventsStore } from './eventsStore.js';
import {
  REGISTERED_ISSUE_SOURCES,
  calculateEventStatus
} from './ipoData.js';

function findNextEvent(events = [], now) {
  const list = [...events].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  for (const evt of list) {
    const status = calculateEventStatus(evt, now);
    if (!status.isPast) {
      return { event: evt, status };
    }
  }
  return null;
}

export function EventsQuickWidget({ onOpenEventsDesk = null, now = null }) {
  const { state } = useEventsStore();
  const [defaultNow] = useState(() => Date.now());
  const effectiveNow = now ?? defaultNow;

  // Find next upcoming or ongoing major event
  const nextEventInfo = findNextEvent(state.events, effectiveNow);

  return (
    <div className="events-quick-card">
      <div className="events-card-header">
        <div className="events-title-col">
          <h3 className="events-card-title">Market Events &amp; Public Issues</h3>
          <span className="events-card-subtitle">Official primary market notices, NFOs &amp; calendar milestones</span>
        </div>
      </div>

      <div className="events-card-body">
        {/* Next Major Milestone Callout */}
        {nextEventInfo ? (
          <div className="next-event-banner">
            <div className="next-event-top">
              <span className="next-event-tag">Next Major Milestone</span>
              <span className={`event-countdown-pill ${nextEventInfo.status.isOngoing ? 'ongoing' : 'upcoming'}`}>
                {nextEventInfo.status.label}
              </span>
            </div>
            <h4 className="next-event-title">{nextEventInfo.event.title}</h4>
            <div className="next-event-meta font-mono">
              <span>{nextEventInfo.event.startDate}</span>
              <span>· {nextEventInfo.event.authority}</span>
            </div>
          </div>
        ) : (
          <div className="next-event-banner">
            <span className="text-muted">No upcoming calendar events scheduled.</span>
          </div>
        )}

        {/* Quick Issue Portal Links */}
        <div className="quick-portals-grid">
          <div className="portal-shortcut-box">
            <span className="portal-label">Primary Equity Issues</span>
            <div className="portal-links-row">
              {REGISTERED_ISSUE_SOURCES.filter(s => s.id !== 'amfi-nfo').map(s => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-ext-link"
                >
                  {s.title} ↗
                </a>
              ))}
            </div>
          </div>

          <div className="portal-shortcut-box">
            <span className="portal-label">Mutual Fund NFOs</span>
            <div className="portal-links-row">
              <a
                href="https://www.amfiindia.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="portal-ext-link"
              >
                View official AMFI NFO announcements ↗
              </a>
            </div>
          </div>
        </div>

        <p className="events-disclaimer-note">
          Official exchange bidding books and SEBI statutory filings govern live issue availability, price bands, and allotment.
        </p>
      </div>

      <div className="events-card-footer">
        <button
          type="button"
          className="portfolio-btn portfolio-btn-outline"
          onClick={() => onOpenEventsDesk && onOpenEventsDesk('ipo-events')}
        >
          Open IPO &amp; Events Desk →
        </button>
      </div>
    </div>
  );
}
