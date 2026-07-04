// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import plannerStorage from './plannerStorage.js';

const originalTz = process.env.TZ;
const referenceDate = new Date(2026, 4, 29, 12, 0, 0);

describe('plannerStorage local date keys', () => {
  beforeEach(() => {
    process.env.TZ = 'Asia/Kolkata';
    vi.useFakeTimers();
    vi.setSystemTime(referenceDate);
    localStorage.clear();
    vi.spyOn(plannerStorage, 'savePlanToApi').mockResolvedValue(true);
  });

  afterEach(() => {
    process.env.TZ = originalTz;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preserves an item saved for a local calendar day under that same day', () => {
    const localDate = new Date(2026, 4, 30, 0, 0, 0);

    plannerStorage.merge(['2026-05-30'], [{
      title: 'Local day event',
      eventDate: localDate,
    }]);

    const plan = plannerStorage.getPlan();
    expect(plan['2026-05-30']).toHaveLength(1);
    expect(plan['2026-05-30'][0].eventDateKey).toBe('2026-05-30');
  });
});
