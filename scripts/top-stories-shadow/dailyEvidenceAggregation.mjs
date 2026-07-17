import { aggregateTopStoriesDaily } from './dailyAggregation.mjs';
import { buildTopStoriesRailFunnelAnalytics } from './railFunnelAnalytics.mjs';

function reportDayBounds(date) {
  const startMs = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(startMs)) throw new Error('date must be valid');
  return { startMs, endMs: startMs + (24 * 60 * 60 * 1000) };
}

function isWithinBounds(value, bounds) {
  const time = Date.parse(value || 0);
  return Number.isFinite(time) && time >= bounds.startMs && time < bounds.endMs;
}

export function aggregateTopStoriesDailyEvidence(records = [], options = {}) {
  const result = aggregateTopStoriesDaily(records, options);
  const bounds = reportDayBounds(options.date);
  const targetObservations = result.replay.canonicalObservations.filter(observation =>
    isWithinBounds(observation.scheduledAt, bounds));
  return {
    ...result,
    report: {
      ...result.report,
      railAndFunnel: buildTopStoriesRailFunnelAnalytics(targetObservations),
    },
  };
}
