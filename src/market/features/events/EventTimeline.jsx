/**
 * NWv7 Market Desk R2.1 - WP-07 Event Timeline Visualizer
 * Accessible, chronological timeline of financial and economic calendar events,
 * showing verification states (CONFIRMED vs TENTATIVE), multi-day ranges, and Asia/Kolkata countdowns.
 */

import React, { useMemo, useState } from 'react';
import {
  EVENT_CATEGORIES,
  VERIFICATION_STATUSES,
  calculateEventStatus
} from './ipoData.js';

export function EventTimeline({
  events = [],
  activeCategory = 'ALL',
  onSelectCategory = null,
  now = null
}) {
  const [defaultNow] = useState(() => Date.now());
  const effectiveNow = now ?? defaultNow;

  const filteredEvents = useMemo(() => {
    let list = Array.isArray(events) ? [...events] : [];
    if (activeCategory && activeCategory !== 'ALL') {
      list = list.filter(e => e.category === activeCategory);
    }
    // Sort chronologically by startDate
    return list.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  }, [events, activeCategory]);

  return (
    <div className="event-timeline-container">
      {/* Category Filter Bar */}
      <div className="timeline-category-bar" role="group" aria-label="Event category filter">
        {EVENT_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            className={`portfolio-btn btn-xs ${activeCategory === cat ? 'portfolio-btn-primary' : 'portfolio-btn-outline'}`}
            onClick={() => onSelectCategory && onSelectCategory(cat)}
          >
            {cat === 'ALL' ? 'All Events' : cat === 'POLICY' ? 'Policy & Rates' : cat === 'HOLIDAY' ? 'Trading Holidays' : 'Earnings Seasons'}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="events-empty-state">
          <p>No events recorded in this category.</p>
        </div>
      ) : (
        <div className="timeline-list">
          {filteredEvents.map(evt => {
            const status = calculateEventStatus(evt, effectiveNow);
            const isConfirmed = evt.verification === VERIFICATION_STATUSES.CONFIRMED_SCHEDULE;
            const isTentative = evt.verification === VERIFICATION_STATUSES.TENTATIVE;
            const isMultiDay = evt.startDate !== (evt.endDate || evt.startDate);

            return (
              <div key={evt.id} className={`timeline-item ${status.isOngoing ? 'ongoing' : ''} ${status.isPast ? 'past' : ''}`}>
                <div className="timeline-date-col font-mono">
                  <span className="timeline-date-text">
                    {isMultiDay ? `${evt.startDate} — ${evt.endDate}` : evt.startDate}
                  </span>
                  <span className={`timeline-countdown-badge ${status.isOngoing ? 'badge-ongoing' : status.isPast ? 'badge-past' : 'badge-upcoming'}`}>
                    {status.label}
                  </span>
                </div>

                <div className="timeline-content-card">
                  <div className="timeline-header-row">
                    <h4 className="timeline-event-title">{evt.title}</h4>
                    <div className="timeline-badges-row">
                      {isConfirmed && (
                        <span className="portfolio-badge badge-confirmed" title="Official event-specific source supports this schedule">
                          Confirmed Schedule
                        </span>
                      )}
                      {isTentative && (
                        <span className="portfolio-badge badge-tentative" title="Tentative seasonal window or official notification pending">
                          Tentative
                        </span>
                      )}
                      <span className="portfolio-badge badge-category">
                        {evt.category}
                      </span>
                    </div>
                  </div>

                  <p className="timeline-event-desc">{evt.description}</p>

                  <div className="timeline-footer-row">
                    <span className="timeline-authority">
                      Authority: <strong>{evt.authority}</strong>
                    </span>

                    {evt.segments && evt.segments.length > 0 && (
                      <span className="timeline-segments">
                        Segments: {evt.segments.join(', ')}
                      </span>
                    )}

                    {evt.sourceUrl && (
                      <a
                        href={evt.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="timeline-source-link"
                      >
                        Official Schedule Notice ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
