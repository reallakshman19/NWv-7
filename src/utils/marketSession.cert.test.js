import { describe, expect, it } from 'vitest';
import { formatMarketQuote, getMarketQuoteAt, getMarketSessionState, getOldestMarketQuoteAt } from './marketSession.js';

const now = new Date('2026-11-19T05:00:00Z');
const previousClose = '2026-11-18T10:00:00Z';

describe('Market schedule and quote provenance', () => {
  it('keeps the regular schedule independent of collection and quote age', () => {
    expect(getMarketSessionState({ now, lastUpdated: now.getTime() })).toMatchObject({
      label: 'Regular NSE Hours', ageMinutes: null, ageLabel: '--', isOpen: true,
    });
    expect(getMarketSessionState({ now, quoteAt: previousClose, tradingHolidays: ['2026-01-26'] })).toMatchObject({
      label: 'Regular NSE Hours', ageMinutes: 1140, isOpen: true,
      holidayCalendarStatus: 'listed_year_completeness_unverified',
    });
    expect(getMarketSessionState({ now, quoteAt: previousClose, tradingHolidays: ['2026-11-19'] })).toMatchObject({
      label: 'Closed', reason: 'Holiday', ageMinutes: 1140, isOpen: false,
    });
  });

  it('uses provider quote timestamps and never substitutes the payload collection time', () => {
    expect(getOldestMarketQuoteAt([null, { quoteAt: 'time unknown' }, { timestamp: now.getTime() }, { quoteAt: previousClose }]))
      .toBe(Date.parse(previousClose));
    expect(getMarketQuoteAt({ fetchedAt: now.getTime() })).toBeNull();
    expect(getMarketQuoteAt({ sourceProvider: 'yahoo-chart-query1-direct', timestamp: now.getTime() })).toBeNull();
    expect(formatMarketQuote({ quoteAt: 'bad', sourceMode: 'yahoo-free-daily' }, 'snapshot')).toBe('Daily · quote time unavailable');
    expect(formatMarketQuote({ quoteAt: previousClose, sourceMode: 'seed' }, 'cache')).toBe('Seed data');
  });
});
