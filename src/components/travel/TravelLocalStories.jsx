import React from 'react';
import { rankStoriesForLocation } from '../../services/storyLocationPriority.js';
import { TRAVEL_NEWS_RETENTION_HOURS, formatTravelStoryAge } from '../../services/travelNewsFreshness.js';
import { auditTravelLocalStories, getStoriesDisplayMode } from '../../services/travelLocalUiQuality.js';
import { sanitizeHtmlText } from '../../utils/htmlText.js';
import './TravelLocalStories.css';

function storyUrl(story) {
  return story?.url || story?.link || story?.href || '#';
}

export default function TravelLocalStories({ newsData, profile, limit = 5 }) {
  if (!profile?.prioritizeStories) return null;

  const stories = rankStoriesForLocation(newsData, profile, { limit, requireCityEvidence: true, requireFreshPublication: true });
  const audit = auditTravelLocalStories(stories, profile);
  const displayMode = getStoriesDisplayMode(audit, profile);

  if (displayMode === 'hidden') return null;

  const isEmpty = displayMode === 'empty' || displayMode === 'low-quality';

  return (
    <section
      className={`travel-local-stories${isEmpty ? ' travel-local-stories--empty' : ''}`}
      data-travel-local-stories={isEmpty ? 'empty' : 'true'}
    >
      {/* Native disclosure gives keyboard and screen-reader users the same toggle.
          The profile key closes it again whenever a different city is selected. */}
      <details key={profile.key} className="travel-local-stories__disclosure">
        <summary className="travel-local-stories__summary">
          <span className="travel-local-stories__eyebrow">{profile.icon || '📍'} Travel local</span>
          <span className="travel-local-stories__summary-location">
            <strong>{profile.display} / {profile.countryLabel}</strong>
            <span className="travel-local-stories__chevron" aria-hidden="true" />
          </span>
        </summary>

        {isEmpty ? (
          <p>No strong {profile.display} local story match yet. Only verified city news published within the past {TRAVEL_NEWS_RETENTION_HOURS} hours is shown.</p>
        ) : (
          <div className="travel-local-stories__list">
            {stories.map(story => (
              <a
                key={story.id || story.url || story.title}
                href={storyUrl(story)}
                target="_blank"
                rel="noopener noreferrer"
                className="travel-local-stories__item"
              >
                <strong>{sanitizeHtmlText(story.title || story.headline)}</strong>
                <span>
                  {sanitizeHtmlText(story.source || story.sourceGroup || story._travelSection || 'Local source')}
                  {' · '}
                  {formatTravelStoryAge(story)}
                </span>
              </a>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
