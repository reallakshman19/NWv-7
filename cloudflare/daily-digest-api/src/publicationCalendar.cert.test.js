import { describe, expect, it } from 'vitest';
import { resolvePublicationState } from './publicationCalendar.js';
import { AKASHVANI_MORNING_NEWS } from './adapters/akashvaniMorningNews.js';
import { INDIAN_EXPRESS_DAILY_BRIEFING } from './adapters/indianExpressDailyBriefing.js';

describe('Daily Digest publication calendars', () => {
  it('keeps Akashvani not-yet-expected before its window', () => {
    const state = resolvePublicationState(
      AKASHVANI_MORNING_NEWS, '2026-08-24', new Date('2026-08-24T02:00:00Z'),
    );
    expect(state.scheduleState).toBe('NOT_YET_EXPECTED');
    expect(state.missingAcquisitionState).toBe('WARNING');
  });

  it('uses warning through publication grace then critical after deadline', () => {
    const grace = resolvePublicationState(
      AKASHVANI_MORNING_NEWS, '2026-08-24', new Date('2026-08-24T03:30:00Z'),
    );
    const late = resolvePublicationState(
      AKASHVANI_MORNING_NEWS, '2026-08-24', new Date('2026-08-24T04:00:00Z'),
    );
    expect(grace.missingAcquisitionState).toBe('WARNING');
    expect(late.missingAcquisitionState).toBe('CRITICAL');
  });

  it('does not count Indian Express Sunday absence as failure', () => {
    const state = resolvePublicationState(
      INDIAN_EXPRESS_DAILY_BRIEFING, '2026-08-23', new Date('2026-08-23T05:00:00Z'),
    );
    expect(state.scheduleState).toBe('NOT_SCHEDULED');
    expect(state.missingAcquisitionState).toBe('OK');
  });
});
