import { compareDisplayedTopStories } from '../../src/services/topStories/topStoriesStabilityMetrics.js';
import { getUsablePilotObservations } from './pilotRailMetrics.mjs';
import { isUsablePilotDay, summarizePilotValues } from './pilotStatistics.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESIDENCE_GAP_MS = 45 * 60 * 1000;

function consecutiveDays(left, right) {
  const leftMs = Date.parse(`${left}T00:00:00.000Z`);
  const rightMs = Date.parse(`${right}T00:00:00.000Z`);
  return Number.isFinite(leftMs) && rightMs - leftMs === DAY_MS;
}

export function buildPilotBoundaryContinuity(days = []) {
  const usable = days.filter(isUsablePilotDay);
  const comparisons = [];
  for (let index = 1; index < usable.length; index += 1) {
    const priorDay = usable[index - 1];
    const currentDay = usable[index];
    if (!consecutiveDays(priorDay.date, currentDay.date)) continue;
    const priorRows = priorDay.dailyReport?.railAndFunnel?.observations || [];
    const currentRows = currentDay.dailyReport?.railAndFunnel?.observations || [];
    if (!priorRows.length || !currentRows.length) continue;
    const prior = priorRows[priorRows.length - 1];
    const current = currentRows[0];
    comparisons.push({
      priorDate: priorDay.date,
      currentDate: currentDay.date,
      intervalMs: Date.parse(current.scheduledAt) - Date.parse(prior.scheduledAt),
      metrics: compareDisplayedTopStories(
        prior.displayedEditorialIdentities || [],
        current.displayedEditorialIdentities || [],
      ),
    });
  }
  return {
    comparisonCount: comparisons.length,
    incumbentRetention: summarizePilotValues(
      comparisons.map(row => row.metrics.incumbentRetention),
    ),
    jaccard: summarizePilotValues(comparisons.map(row => row.metrics.jaccard)),
    countDelta: summarizePilotValues(comparisons.map(row => row.metrics.countDelta)),
    comparisons,
  };
}

function closeEpisode(episodes, active, identity, endedAt, rightCensored = false) {
  const episode = active.get(identity);
  if (!episode) return;
  episodes.push({
    ...episode,
    endedAt,
    durationMinutes: Math.max(0, (endedAt - episode.startedAt) / 60000),
    rightCensored,
  });
  active.delete(identity);
}

function closeAll(episodes, active, endedAt) {
  [...active.keys()].forEach(identity => closeEpisode(episodes, active, identity, endedAt));
}

export function buildPilotResidenceMetrics(days = []) {
  const observations = getUsablePilotObservations(days);
  const episodes = [];
  const active = new Map();
  const episodeCounts = new Map();
  let previous = null;
  observations.forEach((observation, index) => {
    const time = Date.parse(observation.scheduledAt);
    if (!Number.isFinite(time)) return;
    if (previous && time - previous.time > MAX_RESIDENCE_GAP_MS) {
      closeAll(episodes, active, previous.time);
    }
    const currentIds = new Set(observation.displayedEditorialIdentities || []);
    [...active.keys()].filter(identity => !currentIds.has(identity)).forEach(identity =>
      closeEpisode(episodes, active, identity, previous?.time ?? time));
    currentIds.forEach(identity => {
      if (active.has(identity)) {
        const episode = active.get(identity);
        episode.lastObservedAt = time;
        episode.observationCount += 1;
        return;
      }
      const episodeNumber = (episodeCounts.get(identity) || 0) + 1;
      episodeCounts.set(identity, episodeNumber);
      active.set(identity, {
        editorialIdentity: identity,
        episodeNumber,
        startedAt: time,
        lastObservedAt: time,
        observationCount: 1,
        leftCensored: index === 0,
      });
    });
    previous = { time };
  });
  if (previous) {
    [...active.keys()].forEach(identity =>
      closeEpisode(episodes, active, identity, previous.time, true));
  }
  return {
    observationCount: observations.length,
    episodeCount: episodes.length,
    reentryEpisodeCount: episodes.filter(row => row.episodeNumber > 1).length,
    leftCensoredCount: episodes.filter(row => row.leftCensored).length,
    rightCensoredCount: episodes.filter(row => row.rightCensored).length,
    durationMinutes: summarizePilotValues(episodes.map(row => row.durationMinutes)),
    uncensoredDurationMinutes: summarizePilotValues(episodes
      .filter(row => !row.leftCensored && !row.rightCensored)
      .map(row => row.durationMinutes)),
    episodes,
    continuityGapMinutes: MAX_RESIDENCE_GAP_MS / 60000,
  };
}
