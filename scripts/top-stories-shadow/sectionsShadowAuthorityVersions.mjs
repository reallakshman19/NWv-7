import { TOP_STORIES_EVENT_CLASSIFIER_VERSION } from '../../src/services/topStories/topStoriesEventClassifier.js';
import { TOP_STORIES_RANKER_VERSION } from '../../src/services/topStories/topStoriesRanker.js';
import { TOP_STORIES_SOURCE_IDENTITY_VERSION } from '../../src/services/topStories/topStoriesSourceIdentity.js';
import { TOP_STORIES_NORMALIZATION_VERSION } from './normalizationDigest.mjs';

export const SECTIONS_SHADOW_EXECUTABLE_VERSIONS = Object.freeze({
  sourceIdentityVersion: TOP_STORIES_SOURCE_IDENTITY_VERSION,
  normalizationVersion: TOP_STORIES_NORMALIZATION_VERSION,
  eventClassifierVersion: TOP_STORIES_EVENT_CLASSIFIER_VERSION,
  rankerVersion: TOP_STORIES_RANKER_VERSION,
});
