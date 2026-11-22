/**
 * Conservative event-location conflict checks. A city mentioned as the
 * subject of an exhibition/event abroad is not where that event happens.
 * Absence of a conflict is NOT proof of event location: preserve city evidence
 * and human editorial review as separate checks.
 */
import { WEATHER_LOCATION_REGISTRY } from './weatherLocations.js';
import { stripTravelPublisherSuffix } from './travelRssParser.js';

function clean(value) {
  return String(value || '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

const knownCities = [...new Set(Object.values(WEATHER_LOCATION_REGISTRY)
  .map(location => clean(location.display))
  .filter(name => name.length >= 5))]
  .sort((a, b) => b.length - a.length);

function containsPlace(text, place) {
  return (' ' + text + ' ').includes(' ' + place + ' ');
}

export function hasContradictoryTravelEventLocation(story, profile) {
  if (!profile?.key) return false;
  const selected = [...new Set([profile.display, profile.key, ...(profile.cityKeywords || [])]
    .map(clean).filter(name => name.length >= 4))];
  const explicitCity = clean(story?.city || story?.location?.city);
  if (explicitCity && !selected.includes(explicitCity)) return true;

  const publisher = story?.source || story?.publisher || '';
  const headline = clean(stripTravelPublisherSuffix(story?.title || story?.headline, publisher));
  if (!headline || !selected.some(name => containsPlace(headline, name))) return false;

  const foreignCities = knownCities.filter(name =>
    !selected.includes(name) && containsPlace(headline, name));
  if (foreignCities.length === 0) return false;

  // Example: "London gallery opens exhibition about Muscat architecture".
  // The foreign city is the leading event locale; the requested city is
  // introduced only as the exhibition topic.
  const aboutSelected = selected.some(name =>
    ['about ', 'inspired by ', 'featuring ', 'depicting ', 'showcasing ', 'exploring ']
      .some(prefix => containsPlace(headline, prefix.trim() + ' ' + name)));
  if (aboutSelected && foreignCities.some(name => headline.startsWith(name + ' '))) return true;

  // "Muscat artwork displayed at London gallery" is an event in London.
  // "London company opens office in Muscat" remains eligible.
  const inSelected = selected.some(name =>
    ['in ', 'at ', 'near '].some(prefix => containsPlace(headline, prefix.trim() + ' ' + name)));
  if (!inSelected && foreignCities.some(name =>
    ['in ', 'at ', 'near '].some(prefix => containsPlace(headline, prefix.trim() + ' ' + name)))) return true;
  return false;
}
