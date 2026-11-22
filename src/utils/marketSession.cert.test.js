import { describe, expect, it } from 'vitest';
import { formatMarketQuote, getMarketQuoteAt, getMarketSessionState, getOldestMarketQuoteAt } from './marketSession.js';
import { MARKET_TRADING_HOLIDAY_CALENDAR } from '../config/settings_market.js';

const now = new Date('2026-11-19T05:00:00Z');
const previousClose = '2026-11-18T10:00:00Z';

describe('Market schedule and quote provenance', () => {
  it('keeps the regular schedule independent of collection and quote age', () => {
    expect(getMarketSessionState({ now, lastUpdated: now.getTime() })).toMatchObject({
      label: 'Indicative NSE Hours', ageMinutes: null, ageLabel: '--', isOpen: null,
    });
    expect(getMarketSessionState({ now, quoteAt: previousClose, tradingHolidays: ['2026-01-26'] })).toMatchObject({
      label: 'Indicative NSE Hours', ageMinutes: 1140, isOpen: null,
      holidayCalendarStatus: 'listed_year_completeness_unverified',
    });
    expect(getMarketSessionState({ now, quoteAt: previousClose, tradingHolidays: ['2026-11-19'] })).toMatchObject({
      label: 'Closed (scheduled)', reason: 'Listed holiday (unverified)', ageMinutes: 1140, isOpen: false,
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

describe('NSE verified 2026 calendar and fail-closed session model', () => {
  const holidays = MARKET_TRADING_HOLIDAY_CALENDAR[2026];

  it('replays all 15 official weekday closures from NSE/CMTR/71775', () => {
    expect(holidays).toHaveLength(15);
    expect(new Set(holidays).size).toBe(15);
    for (const day of holidays) {
      const state = getMarketSessionState({ now: new Date(day + 'T05:00:00Z'), tradingHolidays: holidays });
      expect(state).toMatchObject({
        label: 'Closed (scheduled)', reason: 'NSE 2026 capital-market circular holiday',
        isOpen: false, holidayCalendarStatus: 'nse_circular_verified_list_live_status_unverified'
      });
    }
  });

  it('rejects the obsolete incorrect Holi date and closes on the verified date', () => {
    expect(holidays).toContain('2026-03-03');
    expect(holidays).not.toContain('2026-03-04');
    expect(getMarketSessionState({
      now: new Date('2026-03-03T05:00:00Z'), tradingHolidays: holidays
    }).isOpen).toBe(false);
  });

  it('never claims a live NSE session even on an ordinary 2026 weekday', () => {
    const state = getMarketSessionState({
      now: new Date('2026-11-19T05:00:00Z'), tradingHolidays: holidays
    });
    expect(state.label).toBe('Scheduled NSE Hours');
    expect(state.isOpen).toBeNull();
    expect(state.tone).not.toBe('success');
  });

  it('treats missing/future calendar years as unverified and a truncated 2026 list as incomplete', () => {
    expect(getMarketSessionState({ now: new Date('2027-01-05T05:00:00Z'), tradingHolidays: holidays }))
      .toMatchObject({ label: 'Indicative NSE Hours', isOpen: null, holidayCalendarStatus: 'unknown_year_weekday_rules' });
    expect(getMarketSessionState({ now: new Date('2026-11-19T05:00:00Z'), tradingHolidays: holidays.slice(0, 6) }))
      .toMatchObject({ label: 'Indicative NSE Hours', isOpen: null, holidayCalendarStatus: 'listed_year_completeness_unverified' });
  });

  it('marks an added user-local holiday as unverified rather than official NSE evidence', () => {
    const state = getMarketSessionState({
      now: new Date('2026-11-19T05:00:00Z'),
      tradingHolidays: [...holidays, '2026-11-19']
    });
    expect(state).toMatchObject({
      label: 'Closed (scheduled)', reason: 'Listed holiday (unverified)', isOpen: false
    });
  });

  it('does not falsely mark the official Sunday Muhurat special session closed all day', () => {
    const state = getMarketSessionState({
      now: new Date('2026-11-08T05:00:00Z'), tradingHolidays: holidays
    });
    expect(state.label).toBe('Special Session — verify NSE');
    expect(state.isOpen).toBeNull();
  });
});
