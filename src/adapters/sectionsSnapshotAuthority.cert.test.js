import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_FUTURE_SKEW_MS,
  classifySectionsSnapshotAuthority,
  isAuthorityStoryUsable,
} from './sectionsSnapshotAuthority.js';

const now = 1_795_000_000_000;
const story = () => ({
  title: 'Qualified current title', url: 'https://publisher.test/article',
  publishedAt: now - 60_000, timestampConfidence: 'high',
});
const epoch = (sections = { topStories: [story()] }, fetchedAt = now) => ({
  schemaVersion: 2, fetchedAt, contentHash: 'authority-test', sections,
});

describe('A06-R3 shared authority content and freshness contract', () => {
  it('accepts one real eligible story, without imposing arbitrary section count', () => {
    expect(classifySectionsSnapshotAuthority(epoch(), now)).toMatchObject({
      valid: true, usableStories: 1,
    });
  });
  it.each([
    ['empty object', {}],
    ['empty section', { topStories: [] }],
    ['malformed story', { topStories: [{}] }],
    ['missing title', { topStories: [{ ...story(), title: '' }] }],
    ['invalid URL', { topStories: [{ ...story(), url: 'javascript:bad' }] }],
    ['missing timestamp', { topStories: [{ ...story(), publishedAt: 0 }] }],
    ['low-confidence top story', { topStories: [{ ...story(), timestampConfidence: 'low' }] }],
    ['stale top story', { topStories: [{ ...story(), publishedAt: now - 13 * 3600_000 }] }],
  ])('rejects %s', (_, sections) => {
    expect(classifySectionsSnapshotAuthority(epoch(sections), now)).toMatchObject({
      valid: false, reason: 'snapshot_content_unusable',
    });
  });
  it('rejects future publication epochs, stale epochs and unsupported versions', () => {
    expect(classifySectionsSnapshotAuthority(epoch(undefined, now + 365 * 86400_000), now).reason)
      .toBe('snapshot_future_timestamp');
    expect(classifySectionsSnapshotAuthority(epoch(undefined, now - 13 * 3600_000), now).reason)
      .toBe('snapshot_stale');
    expect(classifySectionsSnapshotAuthority({ ...epoch(), schemaVersion: 99 }, now).reason)
      .toBe('unsupported_snapshot_schema');
    expect(classifySectionsSnapshotAuthority(epoch(undefined, now + AUTHORITY_FUTURE_SKEW_MS), now).valid)
      .toBe(true);
  });
  it('aligns with consumer special cases: older non-top and live top story', () => {
    expect(isAuthorityStoryUsable({ ...story(), publishedAt: now - 20 * 3600_000 }, 'india', now)).toBe(true);
    expect(isAuthorityStoryUsable({ ...story(), title: 'LIVE news', publishedAt: now - 20 * 3600_000 },
      'topStories', now)).toBe(true);
  });
  it('accepts actual checked-in publisher snapshot against its publication clock', () => {
    const published = JSON.parse(fs.readFileSync('public/newsdata/sections_latest.json', 'utf8'));
    const classified = classifySectionsSnapshotAuthority(published, Number(published.fetchedAt) + 60_000);
    expect(classified).toMatchObject({ valid: true });
    expect(classified.usableStories).toBeGreaterThan(0);
  });
});
