import React, { useMemo, useState } from 'react';
import Header, { DataStatePill } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { downloadCalendarEvent } from '../utils/calendar';
import { useLongPress } from '../hooks/useLongPress';
import ProgressBar from '../components/ProgressBar';
import RetailOffersPanel from '../components/up-ahead/RetailOffersPanel.jsx';
import { useRetailOffers } from '../hooks/useRetailOffers.js';
import { selectRetailOffers } from '../services/retailOffers.js';
import LocalCoverage from '../components/up-ahead/LocalCoverage.jsx';
import { shortenSourceLabel } from '../utils/storyMeta';
import { sanitizeHtmlText } from '../utils/htmlText.js';
import DataStateBoundary from '../components/DataStateBoundary.jsx';
import { formatUpAheadItemDate } from '../services/upAheadProjection.js';
import {
  useUpAheadPageViewModel,
  __upAheadPageViewModelInternalsForTest,
} from '../viewModels/useUpAheadPageViewModel';
import { useShellRuntimeProps } from '../viewModels/useShellRuntimeProps';
import './UpAhead.css';

const {
  formatConciseDate,
} = __upAheadPageViewModelInternalsForTest;

function UpAheadEvidencePanel({ evidence }) {
  if (!evidence) return null;

  return (
    <section className={`ua-evidence ua-evidence--${evidence.status}`} data-upahead-evidence="coverage-quality">
      <div className="ua-evidence__header">
        <div>
          <div className="ua-evidence__eyebrow">Coverage evidence</div>
          <h2>{evidence.title}</h2>
          <p>
            Source mode {evidence.sourceModeLabel} · {evidence.locationCount} location(s) · {evidence.coveredCategories.length}/{evidence.enabledCategories.length} categories covered.
          </p>
        </div>
        <div className="ua-evidence__score">
          <span>Score</span>
          <strong>{evidence.qualityScore}</strong>
        </div>
      </div>

      <div className="ua-evidence__grid">
        <div className="ua-evidence__tile">
          <span>Source</span>
          <strong>{evidence.sourceModeLabel}</strong>
        </div>
        <div className="ua-evidence__tile">
          <span>Locations</span>
          <strong>{evidence.locationCount}</strong>
        </div>
        <div className="ua-evidence__tile">
          <span>Timeline</span>
          <strong>{evidence.timelineStats.itemCount}</strong>
        </div>
        <div className="ua-evidence__tile">
          <span>Plan</span>
          <strong>{evidence.weeklyPlanStats.itemCount}</strong>
        </div>
        <div className="ua-evidence__tile">
          <span>Alerts</span>
          <strong>{evidence.visibleAlertCount}</strong>
        </div>
        <div className="ua-evidence__tile">
          <span>Offers</span>
          <strong>{evidence.visibleOfferCount}</strong>
        </div>
      </div>

      <div className="ua-evidence__chips">
        {evidence.locations.map(location => (
          <span key={location}>{location}</span>
        ))}
        {evidence.coveredCategories.slice(0, 8).map(category => (
          <span key={category}>{category}</span>
        ))}
      </div>

      <details className="ua-evidence__details">
        <summary>Evidence notes</summary>
        <ul>
          {evidence.notes.map((note, index) => (
            <li key={`ua-evidence-note-${index}`}>{note}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function UpAheadBriefingPanel({ briefing }) {
  if (!briefing) return null;

  const primaryBuckets = briefing.buckets.filter(bucket => bucket.count > 0).slice(0, 5);

  return (
    <section className={`ua-briefing ua-briefing--${briefing.status}`} data-upahead-briefing="professional-horizon">
      <div className="ua-briefing__header">
        <div>
          <div className="ua-briefing__eyebrow">Horizon briefing</div>
          <h2>{briefing.title}</h2>
          <p>
            {briefing.locationLabel} · {briefing.next72hCount} item(s) in the next 72h · {briefing.plannerReadyCount} planner-ready item(s).
          </p>
        </div>
      </div>

      <div className="ua-briefing__stats">
        <div><span>Alerts</span><strong>{briefing.alertCount}</strong></div>
        <div><span>Today</span><strong>{briefing.todayCount}</strong></div>
        <div><span>Next 72h</span><strong>{briefing.next72hCount}</strong></div>
        <div><span>Events</span><strong>{briefing.eventCount}</strong></div>
        <div><span>Offers</span><strong>{briefing.offerCount}</strong></div>
        <div><span>Releases</span><strong>{briefing.movieCount}</strong></div>
      </div>

      {briefing.highlights.length > 0 && (
        <div className="ua-briefing__highlights">
          {briefing.highlights.map(item => (
            <article key={item.id} className="ua-briefing__highlight">
              <span>{item.type}</span>
              <strong>{item.title}</strong>
              {item.date && <em>{formatConciseDate(item.date)}</em>}
            </article>
          ))}
        </div>
      )}

      <div className="ua-briefing__buckets">
        {primaryBuckets.map(bucket => (
          <div key={bucket.key} className="ua-briefing__bucket">
            <div className="ua-briefing__bucket-head">
              <strong>{bucket.label}</strong>
              <span>{bucket.count}</span>
            </div>
            <ul>
              {bucket.items.slice(0, 3).map(item => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  {item.date && <em>{formatConciseDate(item.date)}</em>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <details className="ua-briefing__details">
        <summary>Briefing notes</summary>
        <ul>
          {briefing.notes.map((note, index) => (
            <li key={`ua-briefing-note-${index}`}>{note}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function GridSection({
  items,
  colorClass,
  emptyMessage,
  isOffer = false,
  onAddToPlan,
}) {
  if (!items || items.length === 0) {
    return (
      <div className="modern-card empty-state" style={{ borderStyle: 'dashed', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {items.map((item, i) => (
        <div key={item.occurrenceKey || item.id || i} className="modern-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className={`ua-badge ${colorClass}`}>{formatUpAheadItemDate(item)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {item.groupedCount > 1 && (
                <span className="ua-tab-count" title={(item.sources || []).join(', ')}>🔗 {item.groupedCount} sources</span>
              )}
              {isOffer && <span style={{ fontSize: '1.2rem' }}>🏷️</span>}
            </div>
          </div>
          <h3 className="modern-card__title" style={{ marginTop: '8px' }}>{sanitizeHtmlText(item.title)}</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0', flex: 1 }}>
            {sanitizeHtmlText(item.description || 'No description available.', { maxLength: 200 })}
          </p>
          {(item.source || item.alertProvenance || item.retailerId) && <p className="ua-source-context">
            {item.alertProvenance || (item.retailerId ? `${item.offerMarket === 'oman' ? 'Oman' : 'India'} retailer offer`
              : item.sourceAuthority === 'official' ? 'Official calendar' : 'Event listing')}
            {item.source && ` · ${item.source}`}
            {item.city && ` · ${item.city}`}
          </p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="ua-source-link">Details ↗</a>
            <button
              className="ua-cal-btn"
              onClick={(event) => {
                const button = event.currentTarget;
                const result = onAddToPlan(item, item.eventDateKey || item.date || item.releaseDate);
                if (result?.ok !== true) {
                  button.textContent = 'Save failed';
                  return;
                }
                button.textContent = '✅ Saved';
                button.style.backgroundColor = 'var(--accent-primary)';
                button.style.color = 'white';

                setTimeout(() => {
                  button.textContent = '+ Plan';
                  button.style.backgroundColor = '';
                  button.style.color = '';
                }, 2000);
              }}
            >
              + Plan
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UpAheadSourceDirectory({ locations = ['Chennai', 'Muscat'], channel, data, settings }) {
  if (channel !== 'alerts') return null;
  return <LocalCoverage data={data} settings={settings} locations={locations} categories={['alerts', 'weather_alerts', 'civic']} alerts />;
}

function EntertainmentStyleGrid({
  items,
  emptyMessage,
}) {
  if (!items || items.length === 0) {
    return (
      <div className="modern-card empty-state" style={{ borderStyle: 'dashed', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="masonry-grid">
      {items.map((item, idx) => (
        <ImageCard
          key={item.occurrenceKey || item.id || idx}
          article={item}
          href={item.link}
          badge={shortenSourceLabel(item.source || item.platform || 'Up Ahead')}
          size="medium"
        />
      ))}
    </div>
  );
}

function TimelineCard({
  item,
  dayDate,
  handleAddToPlan,
  isWatched,
  toggleWatchlist,
}) {
  const [actionSheetItem, setActionSheetItem] = useState(null);

  const handleLongPress = () => {
    setActionSheetItem({ item, dateKey: dayDate });
  };
  const longPressHandlers = useLongPress(handleLongPress);

  const handleActionSheetClose = () => setActionSheetItem(null);

  return (
    <>
      <div className="timeline-card" style={{ marginBottom: '16px' }} {...longPressHandlers}>
        <div className="ua-media-content" style={{ padding: 0 }}>
          <div className="ua-media-header">
            <span className={`ua-badge type-${item.type}`}>{String(item.type || 'event').toUpperCase()}</span>
            <button className={`ua-watch-btn ${isWatched(item.id) ? 'active' : ''}`} onClick={() => toggleWatchlist(item.id)}>
              {isWatched(item.id) ? '★' : '☆'}
            </button>
          </div>
          <h3 className="ua-media-title">{sanitizeHtmlText(item.title)}</h3>
          <p className="ua-media-desc">{item.description ? sanitizeHtmlText(item.description, { maxLength: 100 }) : ''}</p>
          <div className="ua-media-footer">
            {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="ua-source-link">Read Source ↗</a>}
            <button
              className="ua-cal-btn"
              onClick={(event) => {
                const button = event.currentTarget;
                const result = handleAddToPlan(item, dayDate);
                if (result?.ok !== true) {
                  button.textContent = 'Save failed';
                  return;
                }
                button.textContent = '✅ Saved';
                button.style.backgroundColor = 'var(--accent-primary)';
                button.style.color = 'white';

                setTimeout(() => {
                  button.textContent = '📌 Plan';
                  button.style.backgroundColor = '';
                  button.style.color = '';
                }, 2000);
              }}
              title="Save to My Planner"
            >
              📌 Plan
            </button>
          </div>
        </div>
      </div>

      {actionSheetItem && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={handleActionSheetClose}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'slideUp 0.2s ease-out',
            }}
            onClick={event => event.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              {actionSheetItem.item.title}
            </h3>

            {actionSheetItem.item.link && (
              <button className="btn btn--secondary" style={{ textAlign: 'left', padding: '12px' }} onClick={() => {
                window.open(actionSheetItem.item.link, '_blank');
                handleActionSheetClose();
              }}>
                🌐 Open Source
              </button>
            )}

            <button className="btn btn--secondary" style={{ textAlign: 'left', padding: '12px' }} onClick={() => {
              downloadCalendarEvent(actionSheetItem.item.title, actionSheetItem.item.description || actionSheetItem.item.title);
              handleActionSheetClose();
            }}>
              📅 Add to Calendar
            </button>

            <button className="btn btn--secondary" style={{ textAlign: 'left', padding: '12px' }} onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: actionSheetItem.item.title,
                  url: actionSheetItem.item.link || window.location.href,
                }).catch(() => {});
              }
              handleActionSheetClose();
            }}>
              🔗 Share
            </button>

            <button className="btn btn--secondary" style={{ textAlign: 'left', padding: '12px' }} onClick={() => {
              const result = handleAddToPlan(actionSheetItem.item, actionSheetItem.dateKey);
              handleActionSheetClose();
              alert(result?.ok === true ? 'Saved to Planner' : 'Save failed');
            }}>
              📌 Save to Planner
            </button>

            {(import.meta.env.DEV) ? (
              <button className="btn btn--secondary" style={{ textAlign: 'left', padding: '12px' }} onClick={() => {
                alert(JSON.stringify({
                  id: actionSheetItem.item.id,
                  canonicalId: actionSheetItem.item.canonicalId,
                  decisionTrace: actionSheetItem.item.decisionTrace,
                  classificationBreakdown: actionSheetItem.item.classificationBreakdown,
                }, null, 2));
              }}>
                🐛 Debug Details
              </button>
            ) : null}

            <button className="btn" style={{ textAlign: 'center', padding: '12px', marginTop: '12px', backgroundColor: 'transparent', color: 'var(--text-muted)' }} onClick={handleActionSheetClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function UpAheadPage() {
  const shellRuntimeProps = useShellRuntimeProps();
  const [offerMode, setOfferMode] = useState('online');
  const [retailRefreshKey, setRetailRefreshKey] = useState(0);
  const {
    data,
    envelope,
    error,
    emptyMessages,
    loading,
    isRefreshing,
    loadingPhase,
    view,
    showDiagnostics,
    pullDistance,

    isStaticHost,
    upAheadSettings,
    locationLabel,

    hasVisibleContent,
    modeStr,
    modeLabel,

    civicItems,
    combinedAlerts,
    onlineOffers,
    offlineOffers,
    movieCards,
    festivalCards,
    eventItems,
    suggestedItems,
    upAheadEvidence,
    upAheadBriefing,

    setView,
    setShowDiagnostics,
    loadData,
    handleAddToPlan,
    removeUpAheadLocation,
    promptAddUpAheadLocation,
    watchlistError,
  } = useUpAheadPageViewModel();

  const shoppingEnabled=upAheadSettings?.categories?.shopping!==false;
  const retailState=useRetailOffers(retailRefreshKey,shoppingEnabled);
  const retailCounts=useMemo(()=>{
    if(!shoppingEnabled||!retailState.snapshot)return {online:0,offline:0};
    try{return Object.fromEntries(['online','offline'].map(channel=>[channel,selectRetailOffers(retailState.snapshot,{locations:upAheadSettings?.locations,channel,now:retailState.now}).length]));}
    catch{return {online:0,offline:0};}
  },[shoppingEnabled,retailState.snapshot,retailState.now,upAheadSettings?.locations]);
  const onlineOfferCount=onlineOffers.length+retailCounts.online;
  const offlineOfferCount=offlineOffers.length+retailCounts.offline;

  const handleRefresh = () => { setRetailRefreshKey(value => value + 1); return loadData({ forceRefresh: false }); };
  const handleForceRefresh = () => { setRetailRefreshKey(value => value + 1); return loadData({ forceRefresh: true }); };

  if (loading && !data) {
    return (
      <div className="page-container">
        <Header title="Up Ahead" loadingPhase={loadingPhase} shellRuntimeProps={shellRuntimeProps} />
        <div className="loading">
          <div className="loading__spinner"></div>
          <p>Scanning horizon...</p>
        </div>
      </div>
    );
  }

  const rightElementUI = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isRefreshing && <div className="scanning-indicator" style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>Scanning...</div>}
      {data && <DataStatePill mode={modeStr} label={modeLabel} />}
    </div>
  );

  return (
    <div className="page-container up-ahead-page">
      <div style={{
        height: `${pullDistance}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        color: 'var(--accent-primary)',
        fontSize: '0.8rem',
        transition: pullDistance === 0 ? 'height 0.3s ease' : 'none',
      }}>
        {pullDistance > 40 ? 'Release to refresh' : 'Pull to refresh'}
      </div>

      <Header
        title="Up Ahead"
        icon="🗓️"
        loadingPhase={loadingPhase}
        actions={rightElementUI}
        shellRuntimeProps={shellRuntimeProps}
      />

      <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '6px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
        {isRefreshing ? (
          <>
            <div className="loading__spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>
            <span>Scanning horizon...</span>
          </>
        ) : (
          <>
            <span>{modeLabel || (isStaticHost ? 'Snapshot' : 'Live Feed')} • {locationLabel}</span>
            <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }} title="Refresh Up Ahead">🔄</button>
            <button onClick={handleForceRefresh} className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} title="Check for new items and keep your active list">Force Refresh</button>
          </>
        )}
      </div>

      <main className="main-content">
        {!hasVisibleContent && <DataStateBoundary envelope={envelope} loading={loading} error={error}
          onRetry={handleRefresh} label="Up Ahead" emptyTitle="No matching dated items"
          emptyMessage="Check the official sources in Alerts and Offers for current notices and deals."
          errorTitle="Up Ahead unavailable"
          errorMessage={error || 'Unable to load Up Ahead.'}
          allowDegraded={false} treatEmptyAsReady={false} showMeta={true} showBanner={false} /> }
        {error && hasVisibleContent && (
          <div className="ua-storage-alert" role="status" aria-live="polite">{error}</div>
        )}
        {watchlistError && (
          <div className="ua-storage-alert" role="status" aria-live="polite">
            {watchlistError}
          </div>
        )}

        <div className="ua-view-toggle scrollable-tabs">
          <button className={`ua-toggle-btn ${view === 'plan' ? 'active' : ''}`} onClick={() => setView('plan')} title="Suggested">✨ Suggested</button>
          <button className={`ua-toggle-btn ${view === 'offers' ? 'active' : ''}`} onClick={() => setView('offers')} title="Offers">🏷️ Offers{(onlineOfferCount + offlineOfferCount) > 0 && <span className="ua-tab-count">{onlineOfferCount + offlineOfferCount}</span>}</button>
          <button className={`ua-toggle-btn ${view === 'movies' ? 'active' : ''}`} onClick={() => setView('movies')} title="Releases">🎬 Release{movieCards.length > 0 && <span className="ua-tab-count">{movieCards.length}</span>}</button>
          <button className={`ua-toggle-btn ${view === 'events' ? 'active' : ''}`} onClick={() => setView('events')} title="Events">{'🎫 Events'}{eventItems.length > 0 && <span className="ua-tab-count">{eventItems.length}</span>}</button>
          <button className={`ua-toggle-btn ${view === 'alerts' ? 'active' : ''}`} onClick={() => setView('alerts')} title="Alerts">🚨 Alerts{combinedAlerts.length > 0 && <span className="ua-tab-count">{combinedAlerts.length}</span>}</button>
          <button className={`ua-toggle-btn ${view === 'festivals' ? 'active' : ''}`} onClick={() => setView('festivals')} title="Holidays">🎉 Holidays{festivalCards.length > 0 && <span className="ua-tab-count">{festivalCards.length}</span>}</button>
          <button className={`ua-toggle-btn ${view === 'feed' ? 'active' : ''}`} onClick={() => setView('feed')} title="Civics">🏛️ Civics{civicItems.length > 0 && <span className="ua-tab-count">{civicItems.length}</span>}</button>
          <button
            type="button"
            className="ua-toggle-btn ua-quality-btn"
            onClick={() => setShowDiagnostics(true)}
            title="Diagnostics"
            style={{
              border: '1px solid rgba(139, 148, 158, 0.35)',
              background: 'rgba(13, 17, 23, 0.72)',
              color: 'var(--txt, #fff)',
              borderRadius: '999px',
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0, 212, 170, 0.42)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(139, 148, 158, 0.35)'}
          >
            <span>🏅</span>
            <strong>{upAheadEvidence?.qualityScore || 0}</strong>
          </button>
          {import.meta.env.DEV && (
            <button
              onClick={async () => {
                const { runPlannerBenchmark } = await import('../benchmarks/runPlannerBenchmark.js');
                const results = await runPlannerBenchmark();
                alert(`Planner Benchmark: ${results.summary}`);
              }}
              style={{ fontSize: '0.7rem', padding: '4px 8px', marginLeft: '8px' }}
            >
              🧪 Benchmark
            </button>
          )}
        </div>

        {showDiagnostics && (
          <aside className="ua-diagnostics-modal" role="dialog" aria-modal="true" aria-label="Up Ahead diagnostics">
            <div className="ua-diagnostics-modal__backdrop" onClick={() => setShowDiagnostics(false)} />
            <section className="ua-diagnostics-modal__sheet">
              <div className="ua-diagnostics-modal__header">
                <div>
                  <div className="ua-diagnostics-modal__eyebrow">Up Ahead diagnostics</div>
                  <h2>Coverage and briefing details</h2>
                </div>
                <button type="button" className="ua-diagnostics-modal__close" onClick={() => setShowDiagnostics(false)} aria-label="Close diagnostics">✕</button>
              </div>
              <UpAheadEvidencePanel evidence={upAheadEvidence} />
              <UpAheadBriefingPanel briefing={upAheadBriefing} />
            </section>
          </aside>
        )}

        {view === 'plan' && (
          <div className="ua-tab-view">
            <ProgressBar active={loading || isRefreshing} style={{ marginBottom: '10px', borderRadius: '4px' }} />
            {/* Suggested is the automatic, cross-category feed (releases, events,
                festivals, offers, civic). The planner itself is manual-add only. */}
            <GridSection
              items={suggestedItems}
              colorClass="type-event"
              emptyMessage="No suggestions right now. Pull to refresh."
              onAddToPlan={handleAddToPlan}
            />
          </div>
        )}

        {view === 'movies' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} /><EntertainmentStyleGrid items={movieCards} emptyMessage={emptyMessages.movies} /></div>}
        {view === 'offers' && (
          <div className="ua-tab-view">
            <ProgressBar active={loading || isRefreshing} />
            <div className="ua-offer-subtabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px', padding: '0 8px' }}>
              <button
                className={`ua-toggle-btn ${offerMode === 'online' ? 'active' : ''}`}
                onClick={() => setOfferMode('online')}
                title="Online offers (e-commerce & airlines)"
              >
                🛒 Online{onlineOfferCount > 0 && <span className="ua-tab-count">{onlineOfferCount}</span>}
              </button>
              <button
                className={`ua-toggle-btn ${offerMode === 'offline' ? 'active' : ''}`}
                onClick={() => setOfferMode('offline')}
                title="Local offline offers near your locations"
              >
                📍 Offline{offlineOfferCount > 0 && <span className="ua-tab-count">{offlineOfferCount}</span>}
              </button>
            </div>
            <RetailOffersPanel enabled={shoppingEnabled} locations={upAheadSettings?.locations} channel={offerMode} state={retailState} onAddToPlan={handleAddToPlan} />
            {(offerMode === 'online' ? onlineOffers : offlineOffers).length > 0 && <>
              <h3>Reported sale events</h3>
              <GridSection items={offerMode === 'online' ? onlineOffers : offlineOffers} colorClass="type-shopping" isOffer={true} onAddToPlan={handleAddToPlan} />
            </>}
          </div>
        )}
        {view === 'events' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} />
          <LocalCoverage data={data} settings={upAheadSettings} locations={upAheadSettings?.locations} categories={['events', 'sports']} />
          <GridSection items={eventItems} colorClass="type-event" emptyMessage={emptyMessages.events} onAddToPlan={handleAddToPlan} /></div>}
        {view === 'alerts' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} />
          <GridSection items={combinedAlerts} colorClass="type-alert" emptyMessage={emptyMessages.alerts} onAddToPlan={handleAddToPlan} />
          <UpAheadSourceDirectory data={data} settings={upAheadSettings} locations={upAheadSettings?.locations} channel="alerts" /></div>}

        {view === 'festivals' && (
          <div className="ua-tab-view">
            <ProgressBar active={loading || isRefreshing} />
            <p className="ua-source-context">Bundled 2026–2027 calendar for Chennai and Muscat. Oman 2027 dates are provisional until announced; check the source before booking.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center', padding: '8px' }}>
              {(upAheadSettings?.locations || ['Chennai', 'Muscat']).map(location => (
                <span key={location} className="ua-badge type-festival" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {location}
                  <span
                    title={`Remove ${location}`}
                    style={{ opacity: 0.7, cursor: 'pointer', fontSize: '0.75rem' }}
                    onClick={() => removeUpAheadLocation(location)}
                  >
                    ✕
                  </span>
                </span>
              ))}
              <button
                className="btn btn--secondary"
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                onClick={promptAddUpAheadLocation}
              >
                + Add
              </button>
              <button
                className="btn btn--primary"
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                onClick={() => loadData({ forceRefresh: true })}
              >
                🔄 Refresh Holidays
              </button>
            </div>
            <EntertainmentStyleGrid items={festivalCards} emptyMessage={emptyMessages.festivals} />
          </div>
        )}

        {view === 'feed' && (
          <div className="ua-tab-view">
            <ProgressBar active={loading || isRefreshing} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center', padding: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '4px' }}>Civic notices for:</span>
              {(upAheadSettings?.locations || ['Chennai', 'Muscat']).map(location => (
                <span key={location} className="ua-badge type-civic" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {location}
                  <span
                    title={`Remove ${location}`}
                    style={{ opacity: 0.7, cursor: 'pointer', fontSize: '0.75rem' }}
                    onClick={() => removeUpAheadLocation(location)}
                  >
                    ✕
                  </span>
                </span>
              ))}
              <button
                className="btn btn--secondary"
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                onClick={promptAddUpAheadLocation}
              >
                + Add
              </button>
            </div>
            <LocalCoverage data={data} settings={upAheadSettings} locations={upAheadSettings?.locations} categories={['civic']} />
            <GridSection
              items={civicItems}
              colorClass="type-civic"
              emptyMessage={emptyMessages.civic}
              onAddToPlan={handleAddToPlan}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default UpAheadPage;
