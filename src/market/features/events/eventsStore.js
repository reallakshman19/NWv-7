/**
 * NWv7 Market Desk R2.1 - WP-07 Unified Events and NFO Store
 * Manages calendar events, NFO custody, news briefing, and filter states.
 * Adheres strictly to zero-boot network silence.
 */

import { useSyncExternalStore } from 'react';
import { MARKET_CALENDAR_EVENTS } from './ipoData.js';
import { filterActiveNfos, filterHistoricalNfos, mergeNfoCustody } from './nfoEngine.js';
import { extractFinanceBriefing } from './newsReuseClient.js';

class EventsStore {
  constructor() {
    this.listeners = new Set();
    this.state = null;
    this.cachedSnapshot = null;
    this.init();
  }

  init() {
    this.state = {
      events: MARKET_CALENDAR_EVENTS,
      activeCategory: 'ALL',
      activeTab: 'ipo', // 'ipo' | 'nfo' | 'calendar' | 'news'
      nfoCustody: [],
      newsStories: [],
      newsReceipt: null,
      newsLoading: false,
      newsError: null,
      revision: 1
    };
    this.updateSnapshot();
  }

  updateSnapshot() {
    const activeNfos = filterActiveNfos(this.state.nfoCustody);
    const historicalNfos = filterHistoricalNfos(this.state.nfoCustody);

    this.cachedSnapshot = Object.freeze({
      ...this.state,
      activeNfos,
      historicalNfos,
      events: [...this.state.events]
    });

    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.cachedSnapshot;
  getServerSnapshot = () => this.cachedSnapshot;

  setActiveTab(tab) {
    if (this.state.activeTab !== tab) {
      this.state.activeTab = tab;
      this.updateSnapshot();
    }
  }

  setActiveCategory(category) {
    if (this.state.activeCategory !== category) {
      this.state.activeCategory = category;
      this.updateSnapshot();
    }
  }

  // Ingests NFO records into custody (merges without reviving expired rows)
  ingestNfoRows(rows = [], now = Date.now()) {
    if (!Array.isArray(rows)) return;
    this.state.nfoCustody = mergeNfoCustody(this.state.nfoCustody, rows, now);
    this.state.revision += 1;
    this.updateSnapshot();
  }

  // Passively ingests news from an already available sectionsDataset envelope
  ingestNewsEnvelope(sectionsEnvelope, now = Date.now()) {
    if (!sectionsEnvelope) return;
    const { stories, receipt } = extractFinanceBriefing(sectionsEnvelope, now);
    this.state.newsStories = stories;
    this.state.newsReceipt = receipt;
    this.state.newsLoading = false;
    this.state.newsError = null;
    this.state.revision += 1;
    this.updateSnapshot();
  }

  setNewsError(err) {
    this.state.newsError = typeof err === 'string' ? err : err?.message || 'Failed to load news';
    this.state.newsLoading = false;
    this.state.revision += 1;
    this.updateSnapshot();
  }
}

export const eventsStore = new EventsStore();

export function useEventsStore() {
  const state = useSyncExternalStore(
    eventsStore.subscribe,
    eventsStore.getSnapshot,
    eventsStore.getServerSnapshot
  );

  return {
    state,
    actions: eventsStore
  };
}
