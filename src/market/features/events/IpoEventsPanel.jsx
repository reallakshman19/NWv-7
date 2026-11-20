/**
 * NWv7 Market Desk R2.1 - WP-07 IPO, NFO & Finance Events Desk Workspace Panel
 * Comprehensive Primary Issues, Mutual Fund NFOs, Market Calendar & Finance News Briefing.
 *
 * Conforms to:
 * - Direct official issue links to NSE, BSE, SEBI with false-zero prevention (WP00-020).
 * - Mutual fund NFO lifecycle classifier with custody preservation and AMFI fallback.
 * - Evidence-backed market calendar (RBI MPC range, confirmed holidays, tentative windows).
 * - Finance news reuse from sectionsDataset envelope under user-local custody.
 * - Component-level failure isolation (MKT-032).
 */

import React, { useState } from 'react';
import { useEventsStore } from './eventsStore.js';
import {
  REGISTERED_ISSUE_SOURCES,
  ADDITIONAL_OFFICIAL_LINKS
} from './ipoData.js';
import { EventTimeline } from './EventTimeline.jsx';
import './events.css';

export function IpoEventsPanel({ onNavigateWorkspace = null, now = null }) {
  const [defaultNow] = useState(() => Date.now());
  const effectiveNow = now ?? defaultNow;
  const { state, actions } = useEventsStore();
  const [activeTab, setActiveTab] = useState(state.activeTab || 'ipo');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    actions.setActiveTab(tab);
  };

  return (
    <div className="events-workspace">
      {/* Top Header Bar */}
      <div className="events-header">
        <div className="events-title-group">
          <div className="events-title-row">
            {onNavigateWorkspace && (
              <button
                type="button"
                className="portfolio-btn portfolio-btn-secondary btn-xs"
                onClick={() => onNavigateWorkspace('overview')}
                title="Return to Market Overview"
              >
                &larr; Overview
              </button>
            )}
            <h2 className="events-title">IPO, NFO &amp; Financial Events</h2>
          </div>
          <span className="events-subtitle">
            Official exchange public issue trackers, mutual fund NFO announcements, economic calendar milestones, and finance news briefing.
          </span>
        </div>
      </div>

      {/* Statutory / Regulatory Disclaimer Banner */}
      <div className="events-disclaimer-banner" role="note">
        <strong>Official Market Registers &amp; Free Open Policy:</strong> Primary equity public issue bidding, subscription books, and allotment allocations are administered exclusively by the National Stock Exchange of India (NSE) and BSE Limited. Free/open policy enforced; zero unverified issue counts or fake empty assertions.
      </div>

      {/* Main Workspace Navigation Tabs */}
      <div className="events-tabs-nav" role="tablist" aria-label="Event desk views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ipo'}
          className={`events-nav-tab ${activeTab === 'ipo' ? 'active' : ''}`}
          onClick={() => handleTabChange('ipo')}
        >
          Official Public Issues (IPO/FPO)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'nfo'}
          className={`events-nav-tab ${activeTab === 'nfo' ? 'active' : ''}`}
          onClick={() => handleTabChange('nfo')}
        >
          Mutual Fund NFOs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'calendar'}
          className={`events-nav-tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => handleTabChange('calendar')}
        >
          Market Calendar &amp; Holidays
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'news'}
          className={`events-nav-tab ${activeTab === 'news' ? 'active' : ''}`}
          onClick={() => handleTabChange('news')}
        >
          Finance News Briefing
        </button>
      </div>

      {/* TAB 1: OFFICIAL PUBLIC ISSUES (IPO/FPO) */}
      {activeTab === 'ipo' && (
        <section className="events-view-section" aria-labelledby="view-heading-ipo">
          <div className="events-section-header">
            <div>
              <h3 id="view-heading-ipo" className="events-section-title">Official Exchange Public Issue Desks</h3>
              <span className="events-section-desc">Direct statutory portals for mainboard IPOs, SME issues, corporate advertisements, and SEBI draft prospectuses</span>
            </div>
          </div>

          <div className="portals-full-grid">
            {/* WP-00 Registered Exchange Issue Desks */}
            {REGISTERED_ISSUE_SOURCES.filter(s => s.id !== 'amfi-nfo').map(src => (
              <div key={src.id} className="portal-card">
                <div className="portal-card-top">
                  <h4 className="portal-card-title">{src.title}</h4>
                  <span className="portfolio-badge badge-source">{src.publisher}</span>
                </div>
                <p className="portal-card-desc">{src.description}</p>
                <div className="portal-card-footer">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-btn"
                  >
                    Open Official Desk &nearr;
                  </a>
                </div>
              </div>
            ))}

            {/* Additional Verified Official Statutory Links */}
            {ADDITIONAL_OFFICIAL_LINKS.map(link => (
              <div key={link.id} className="portal-card">
                <div className="portal-card-top">
                  <h4 className="portal-card-title">{link.title}</h4>
                  <span className="portfolio-badge badge-external">Official Filing</span>
                </div>
                <p className="portal-card-desc">{link.description}</p>
                <div className="portal-card-footer">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-btn"
                  >
                    View Official Filing &nearr;
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="events-callout-box">
            <h4>Bidding &amp; Allotment Verification Rule</h4>
            <p>
              Subscription status, retail bid multipliers, and basis of allotment must be verified directly through your registered broker or the designated Registrar &amp; Share Transfer Agent (RTA) such as Link Intime, KFintech, or Bigshare.
            </p>
          </div>
        </section>
      )}

      {/* TAB 2: MUTUAL FUND NFOS */}
      {activeTab === 'nfo' && (
        <section className="events-view-section" aria-labelledby="view-heading-nfo">
          <div className="events-section-header">
            <div>
              <h3 id="view-heading-nfo" className="events-section-title">Mutual Fund New Fund Offers (NFO)</h3>
              <span className="events-section-desc">Open subscriptions and upcoming fund launches verified against AMFI schedules</span>
            </div>
            <div>
              <a
                href="https://www.amfiindia.com/new-fund-offer"
                target="_blank"
                rel="noopener noreferrer"
                className="portfolio-btn btn-sm portfolio-btn-secondary"
              >
                Official AMFI NFO Portal &nearr;
              </a>
            </div>
          </div>

          {state.activeNfos && state.activeNfos.length > 0 ? (
            <div className="nfo-cards-grid">
              {state.activeNfos.map((nfo, idx) => (
                <div key={nfo.id || `${nfo.name}-${idx}`} className="nfo-item-card">
                  <div className="nfo-card-header">
                    <h4 className="nfo-scheme-name">{nfo.name}</h4>
                    <span className={`portfolio-badge ${nfo.state === 'OPEN' ? 'badge-open' : nfo.state === 'UPCOMING' ? 'badge-upcoming' : 'badge-tentative'}`}>
                      {nfo.stateLabel}
                    </span>
                  </div>

                  <div className="nfo-dates-row font-mono">
                    <span>
                      {nfo.closeDate || nfo.endDate
                        ? `${nfo.openDate || nfo.startDate} — ${nfo.closeDate || nfo.endDate}`
                        : `Launch: ${nfo.openDate || nfo.startDate} · Closing date pending`}
                    </span>
                  </div>

                  {nfo.fundHouse && <span className="nfo-amc-tag">{nfo.fundHouse}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="events-empty-state">
              <p>No verified current NFO schedule in this feed. Check the official source for open and upcoming offers.</p>
              <a
                href="https://www.amfiindia.com/new-fund-offer"
                target="_blank"
                rel="noopener noreferrer"
                className="portfolio-btn portfolio-btn-secondary btn-sm"
              >
                Check AMFI India New Fund Offers &nearr;
              </a>
            </div>
          )}

          {/* Historical / Closed Offers Inspection (Custody Preservation) */}
          {state.historicalNfos && state.historicalNfos.length > 0 && (
            <details className="nfo-history-accordion">
              <summary className="nfo-history-summary">
                Past / Closed Offers in Custody ({state.historicalNfos.length})
              </summary>
              <div className="nfo-history-list">
                {state.historicalNfos.map((nfo, idx) => (
                  <div key={nfo.id || `past-${idx}`} className="nfo-history-row font-mono">
                    <span className="nfo-hist-name">{nfo.name}</span>
                    <span className="nfo-hist-dates">{nfo.openDate || nfo.startDate} — {nfo.closeDate || nfo.endDate}</span>
                    <span className="portfolio-badge badge-closed">Closed</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {/* TAB 3: MARKET & ECONOMIC CALENDAR */}
      {activeTab === 'calendar' && (
        <section className="events-view-section" aria-labelledby="view-heading-cal">
          <div className="events-section-header">
            <div>
              <h3 id="view-heading-cal" className="events-section-title">Market &amp; Economic Calendar</h3>
              <span className="events-section-desc">RBI Monetary Policy Committee meetings, statutory trading holidays, and corporate earnings windows</span>
            </div>
          </div>

          <EventTimeline
            events={state.events}
            activeCategory={state.activeCategory}
            onSelectCategory={cat => actions.setActiveCategory(cat)}
            now={effectiveNow}
          />
        </section>
      )}

      {/* TAB 4: FINANCE NEWS BRIEFING */}
      {activeTab === 'news' && (
        <section className="events-view-section" aria-labelledby="view-heading-news">
          <div className="events-section-header">
            <div>
              <h3 id="view-heading-news" className="events-section-title">Finance &amp; Business News Briefing</h3>
              <span className="events-section-desc">Curated business, market, and policy headlines adapted from NWv7 editorial coverage</span>
            </div>
          </div>

          {state.newsError && (
            <div className="portfolio-alert portfolio-alert-warning" role="alert">
              {state.newsError}
            </div>
          )}

          {state.newsStories && state.newsStories.length > 0 ? (
            <div className="news-briefing-grid">
              {state.newsStories.map(story => (
                <div key={story.id} className="news-story-card">
                  <div className="news-story-meta">
                    <span className="news-publisher-badge font-mono">{story.publisher}</span>
                    {story.publishedAt && (
                      <span className="news-time-badge text-muted">
                        {story.publishedAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <h4 className="news-story-title">
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-story-link"
                    >
                      {story.title} &nearr;
                    </a>
                  </h4>
                  {story.summary && <p className="news-story-snippet">{story.summary}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="events-empty-state">
              <p>No editorial finance stories loaded in the current application session.</p>
            </div>
          )}

          {state.newsReceipt && (
            <div className="news-provenance-footer font-mono">
              <span>Source: {state.newsReceipt.sourceId} ({state.newsReceipt.accessMode}) · Status: {state.newsReceipt.state}</span>
            </div>
          )}
        </section>
      )}

      {/* Official Footnotes & Regulatory Links */}
      <section className="events-footer-links">
        <h4 className="footer-links-title">Official Primary Market Verification Portals</h4>
        <div className="footer-links-grid">
          <a href="https://www.nseindia.com/" target="_blank" rel="noopener noreferrer" className="macro-ext-link">
            NSE India &nearr;
          </a>
          <a href="https://www.bseindia.com/" target="_blank" rel="noopener noreferrer" className="macro-ext-link">
            BSE India &nearr;
          </a>
          <a href="https://www.sebi.gov.in/" target="_blank" rel="noopener noreferrer" className="macro-ext-link">
            SEBI Regulatory Portal &nearr;
          </a>
          <a href="https://www.amfiindia.com/" target="_blank" rel="noopener noreferrer" className="macro-ext-link">
            AMFI India &nearr;
          </a>
          <a href="https://www.rbi.org.in/" target="_blank" rel="noopener noreferrer" className="macro-ext-link">
            Reserve Bank of India &nearr;
          </a>
        </div>
      </section>
    </div>
  );
}
