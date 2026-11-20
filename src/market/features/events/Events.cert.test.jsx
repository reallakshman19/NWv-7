// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EventsQuickWidget,
  IpoEventsPanel,
  EventTimeline,
  eventsStore,
  MARKET_CALENDAR_EVENTS
} from './index.js';

describe('Market Desk R2.1 WP-07 Events, IPO, NFO & Calendar Certification Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    eventsStore.init();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    eventsStore.init();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('EventsQuickWidget Component', () => {
    it('initializes in zero-boot mode with zero network fetches on mount', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      render(<EventsQuickWidget />);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText('Market Events & Public Issues')).toBeTruthy();
      expect(screen.getByText('Next Major Milestone')).toBeTruthy();
    });

    it('renders honest navigation action without fake NFO counts (WP07-T23)', () => {
      render(<EventsQuickWidget />);

      // Must NOT contain fake counts like "3 open NFOs" or "5 active IPOs"
      expect(screen.queryByText(/\d+\s+open NFO/i)).toBeNull();
      expect(screen.queryByText(/\d+\s+active IPO/i)).toBeNull();

      // Must display honest action link to official announcements
      expect(screen.getByText(/View official AMFI NFO announcements/)).toBeTruthy();
      expect(screen.getByText(/NSE Public Issues/)).toBeTruthy();
      expect(screen.getByText(/BSE IPO Issues Desk/)).toBeTruthy();
    });

    it('navigates to ipo-events workspace via onOpenEventsDesk callback', () => {
      const handleOpen = vi.fn();
      render(<EventsQuickWidget onOpenEventsDesk={handleOpen} />);

      const deskBtn = screen.getByRole('button', { name: /Open IPO & Events Desk/i });
      fireEvent.click(deskBtn);

      expect(handleOpen).toHaveBeenCalledWith('ipo-events');
    });
  });

  describe('EventTimeline Component', () => {
    it('renders confirmed schedule and tentative badges accurately', () => {
      const fixedNow = Date.parse('2026-11-20T12:00:00Z');
      render(<EventTimeline events={MARKET_CALENDAR_EVENTS} now={fixedNow} />);

      // RBI MPC is confirmed schedule
      expect(screen.getByText(/RBI Monetary Policy Committee/)).toBeTruthy();
      expect(screen.getAllByText('Confirmed Schedule').length).toBeGreaterThanOrEqual(1);

      // Union budget and earnings are tentative
      expect(screen.getByText(/Union Budget 2027–28/)).toBeTruthy();
      expect(screen.getAllByText('Tentative').length).toBeGreaterThanOrEqual(1);
    });

    it('displays multi-day range for RBI MPC meeting', () => {
      const fixedNow = Date.parse('2026-11-20T12:00:00Z');
      render(<EventTimeline events={MARKET_CALENDAR_EVENTS} now={fixedNow} />);

      expect(screen.getByText(/2026-12-02 — 2026-12-04/)).toBeTruthy();
    });

    it('filters calendar events by category (POLICY, HOLIDAY, EARNINGS)', () => {
      const handleSelectCategory = vi.fn();
      render(
        <EventTimeline
          events={MARKET_CALENDAR_EVENTS}
          activeCategory="HOLIDAY"
          onSelectCategory={handleSelectCategory}
        />
      );

      // Holiday is visible
      expect(screen.getByText(/Christmas — Market Trading Holiday/)).toBeTruthy();

      // Policy is filtered out
      expect(screen.queryByText(/RBI Monetary Policy Committee/)).toBeNull();

      // Clicking category button invokes callback
      const policyBtn = screen.getByRole('button', { name: 'Policy & Rates' });
      fireEvent.click(policyBtn);
      expect(handleSelectCategory).toHaveBeenCalledWith('POLICY');
    });
  });

  describe('IpoEventsPanel Component', () => {
    it('renders all four workspace navigation tabs and disclaimers', () => {
      render(<IpoEventsPanel />);

      expect(screen.getByText('IPO, NFO & Financial Events')).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Official Public Issues (IPO/FPO)' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Mutual Fund NFOs' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Market Calendar & Holidays' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Finance News Briefing' })).toBeTruthy();
      expect(screen.getByRole('note')).toBeTruthy();
    });

    it('displays registered exchange desks and verified statutory links on IPO tab', () => {
      render(<IpoEventsPanel />);

      expect(screen.getByText('NSE Public Issues (IPO/FPO)')).toBeTruthy();
      expect(screen.getByText('BSE IPO Issues Desk')).toBeTruthy();
      expect(screen.getByText('NSE Public Issue Advertisements')).toBeTruthy();
      expect(screen.getByText('SEBI Draft Red Herring Prospectus (DRHP)')).toBeTruthy();
    });

    it('switches to NFO tab and renders truthful fallback when schedule is empty', () => {
      render(<IpoEventsPanel />);

      const nfoTab = screen.getByRole('tab', { name: 'Mutual Fund NFOs' });
      fireEvent.click(nfoTab);

      expect(screen.getByText(/No verified current NFO schedule in this feed/)).toBeTruthy();
      expect(screen.getByRole('link', { name: /Check AMFI India New Fund Offers/ })).toBeTruthy();
    });

    it('renders classified active and historical NFOs when ingested into custody', () => {
      const fixedNow = Date.parse('2026-11-20T12:00:00Z');
      eventsStore.ingestNfoRows([
        { id: 'nfo-1', name: 'Kotak Quant Active Fund', openDate: '2026-11-15', closeDate: '2026-11-28', fundHouse: 'Kotak Mutual Fund' },
        { id: 'nfo-2', name: 'ICICI Innovation Fund', openDate: '2026-10-01', closeDate: '2026-10-14' } // Expired
      ], fixedNow);

      render(<IpoEventsPanel now={fixedNow} />);

      const nfoTab = screen.getByRole('tab', { name: 'Mutual Fund NFOs' });
      fireEvent.click(nfoTab);

      // Active offer is rendered
      expect(screen.getByText('Kotak Quant Active Fund')).toBeTruthy();
      expect(screen.getByText('Open')).toBeTruthy();

      // Expired offer is retained in custody under historical details
      expect(screen.getByText(/Past \/ Closed Offers in Custody \(1\)/)).toBeTruthy();
      expect(screen.getByText('ICICI Innovation Fund')).toBeTruthy();
    });

    it('renders finance news briefing from ingested sectionsDataset envelope', () => {
      const sampleEnvelope = {
        data: {
          sections: {
            business: [
              {
                id: 'b-1',
                title: 'Sensex closes 300 points higher on IT earnings',
                source: 'Financial Express',
                link: 'https://example.com/sensex-gain',
                pubDate: '2026-11-20T10:30:00Z',
                summary: 'Equities rallied following quarterly announcements.'
              }
            ]
          }
        }
      };

      eventsStore.ingestNewsEnvelope(sampleEnvelope);

      render(<IpoEventsPanel />);

      const newsTab = screen.getByRole('tab', { name: 'Finance News Briefing' });
      fireEvent.click(newsTab);

      expect(screen.getByText(/Sensex closes 300 points higher/)).toBeTruthy();
      expect(screen.getByText('Financial Express')).toBeTruthy();
      expect(screen.getByText(/Equities rallied following quarterly announcements/)).toBeTruthy();
    });

    it('isolates news error gracefully without removing IPO or Calendar features (WP07-T22)', () => {
      eventsStore.setNewsError('Sections business feed network timeout');

      render(<IpoEventsPanel />);

      const newsTab = screen.getByRole('tab', { name: 'Finance News Briefing' });
      fireEvent.click(newsTab);

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/Sections business feed network timeout/)).toBeTruthy();

      // Switching back to IPO tab shows official issue desks intact
      const ipoTab = screen.getByRole('tab', { name: 'Official Public Issues (IPO/FPO)' });
      fireEvent.click(ipoTab);

      expect(screen.getByText('NSE Public Issues (IPO/FPO)')).toBeTruthy();
    });
  });
});
