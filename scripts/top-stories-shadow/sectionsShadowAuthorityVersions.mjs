import { TOP_STORIES_SOURCE_IDENTITY_VERSION } from '../../src/services/topStories/topStoriesSourceIdentity.js';
import { TOP_STORIES_NORMALIZATION_VERSION } from './normalizationDigest.mjs';

export const SECTIONS_SHADOW_RANKER_VERSION =
  'nw-top-stories-ranker-observed-v1';
export const SECTIONS_SHADOW_EVENT_CLASSIFIER_VERSION =
  'nw-top-stories-event-classifier-v1';

export const SECTIONS_SHADOW_EXECUTABLE_VERSIONS = Object.freeze({
  sourceIdentityVersion: TOP_STORIES_SOURCE_IDENTITY_VERSION,
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
  eventClassifierVersion: SECTIONS_SHADOW_EVENT_CLASSIFIER_VERSION,
  rankerVersion: SECTIONS_SHADOW_RANKER_VERSION,
});
