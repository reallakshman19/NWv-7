/* eslint-disable */
// useNewspaperTabViewModel — Newspaper tab ViewModel pattern; page consumes useNewspaperPageViewModel
// DataStateBoundary integration: <DataStateBoundary onRetry={handleRefresh} errorMessage={error || "Failed to load today's newspaper."} />
import React from 'react';
import {
  FaNewspaper,
  FaSync,
  FaLanguage,
} from 'react-icons/fa';
import { useMediaQuery } from '../hooks/useMediaQuery';
import NewspaperCard from '../components/NewspaperCard';
import '../components/NewspaperLayout.css';
import {
  useNewspaperPageViewModel,
} from '../viewModels/useNewspaperPageViewModel';

const methodLabels = {
  gemini: 'AI Summary',
  server: 'Summary',
  extractive: 'Auto-Summary',
  headlines: 'Headlines',
};

const NewspaperPage = () => {
  const { isWebView } = useMediaQuery();

  const {
    sources,
    activeSource,
    currentSections,
    data,
    lastUpdated,
    sourceStatus,
    provenance,
    loading,
    error,

    isTranslated,
    dynamicTitles,
    isTranslatingTitles,
    digestMode,
    previewLines,
    setPreviewLines,

    showTranslationControls,

    handleRefresh,
    reload,
    handleSourceChange,
    toggleDigestMode,
    toggleTranslation,
  } = useNewspaperPageViewModel();

  return (
    <div className={`page-container mode-newspaper ${isWebView ? 'page-container--desktop' : ''}`}>
      <div className="header">
        <div className="header__title">
          <FaNewspaper className="header__title-icon" />
          <span>Daily Brief</span>
        </div>

        <div className="header__actions" style={{ gap: '8px' }}>
          <label htmlFor="newspaper-preview-lines" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Preview lines
            <select
              id="newspaper-preview-lines"
              aria-label="Preview lines"
              value={previewLines}
              onChange={event => setPreviewLines(Number(event.target.value))}
              style={{ marginLeft: '6px', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }}
            >
              {[2, 3, 4].map(lines => <option key={lines} value={lines}>{lines}</option>)}
            </select>
          </label>

          <button
            onClick={toggleDigestMode}
            className={`btn-icon ${digestMode ? 'active' : ''}`}
            title={digestMode ? 'Card View' : 'Digest View'}
            style={{
              color: digestMode ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontSize: '1.1rem',
            }}
          >
            {digestMode ? '📰' : '📖'}
          </button>

          {showTranslationControls && (
            <button
              onClick={toggleTranslation}
              className={`btn-icon ${isTranslated ? 'active' : ''}`}
              title={isTranslated ? 'Show Original (Tamil)' : 'Translate to English'}
              style={{
                color: isTranslated ? 'var(--accent-primary)' : 'var(--text-secondary)',
              }}
            >
              <FaLanguage size={24} />
            </button>
          )}

          <button onClick={handleRefresh} className="btn-icon" aria-label="Refresh" title="Refresh newspaper">
            <FaSync className={loading ? 'spin' : ''} />
          </button>
          {/* Force reload: reload(true) triggers a fresh fetch bypassing cache */}
        </div>
      </div>

      <div
        className="topline"
        style={{
          borderRadius: 0,
          margin: 0,
          borderLeft: 'none',
          borderBottom: '1px solid var(--border-default)',
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', minWidth: 'max-content' }}>
          {Object.values(sources).map(source => (
            <button
              key={source.id}
              onClick={() => handleSourceChange(source.id)}
              className={`btn ${activeSource === source.id ? 'btn--primary' : 'btn--secondary'}`}
              style={{
                padding: '8px 12px',
                fontSize: '0.85rem',
                whiteSpace: 'nowrap',
              }}
            >
              {source.label}
            </button>
          ))}
        </div>

        {lastUpdated && (
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: '8px',
              textAlign: 'center',
            }}
          >
            Edition acquired: {new Date(lastUpdated).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        )}
      </div>

      <div className="main-content" style={{ padding: '16px' }}>
        <p className="newspaper-source-note">
          {provenance === 'current-sections-publisher-headlines' ? 'Current publisher headlines from the news feed.' : 'Publisher headlines from the last 48 hours.'}
          {' '}Short publisher RSS excerpts appear with verified stories when available; full articles open on the publisher site.
          {' '}<a href={sources[activeSource].url} target="_blank" rel="noopener noreferrer">Open {sources[activeSource].label}</a>
        </p>
        {loading && !data ? (
          <div className="loading">
            <div className="loading__spinner"></div>
            <p>Fetching Today&apos;s Brief...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state__icon">⚠️</div>
            <p>{error}</p>
            <button onClick={handleRefresh} className="btn btn--primary mt-md">
              Retry
            </button>
          </div>
        ) : (
          <div className="newspaper-content">
            {!currentSections || currentSections.length === 0 ? (
              <div className="empty-state">
                <p>{sourceStatus?.[activeSource]?.detail || "No verified current headlines available for this publisher."}</p>
              </div>
            ) : (
              currentSections.map((section, idx) => {
                const sectionArticles = Array.isArray(section.articles) ? section.articles : [];

                return (
                  <div key={`${section.page || 'page'}-${idx}`} className="newspaper-section" style={{ marginBottom: '32px' }}>
                    <h2
                      className="zone-title"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{section.page}</span>

                      {isTranslatingTitles && isTranslated && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--accent-primary)',
                            fontWeight: 'normal',
                          }}
                        >
                          Translating...
                        </span>
                      )}
                    </h2>

                    {digestMode ? (
                      <div style={{ fontSize: '0.9rem', lineHeight: '1.7' }}>
                        {sectionArticles.map((article, aIdx) => {
                          const title = (isTranslated && (dynamicTitles[article.link] || article.title_en)) || article.title;

                          return (
                            <div
                              key={`${article.link || article.title || 'article'}-${aIdx}`}
                              style={{
                                padding: '8px 0',
                                borderBottom: '1px solid var(--border-default)',
                              }}
                            >
                              <a
                                href={article.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--text-primary)',
                                  textDecoration: 'none',
                                  fontWeight: 500,
                                }}
                              >
                                {title}
                              </a>
                              {article.preview && (
                                <p className="newspaper-card__preview" style={{ '--preview-lines': previewLines }}>
                                  {article.preview}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {sectionArticles.map((article, aIdx) => {
                          const articleWithTranslation = {
                            ...article,
                            title_en: dynamicTitles[article.link] || article.title_en,
                          };

                          return (
                            <NewspaperCard
                              key={`${article.link || article.title || 'article'}-${aIdx}`}
                              article={articleWithTranslation}
                              sourceName={sources[activeSource].label}
                              isTranslated={isTranslated}
                              previewLines={previewLines}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div className="market-disclaimer" style={{ marginTop: '32px' }}>
              Publisher headlines and attributed feed excerpts only. Verify important details from original articles.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewspaperPage;
