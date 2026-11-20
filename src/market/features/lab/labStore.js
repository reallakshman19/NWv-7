/**
 * NWv7 Market Desk R2.1 - WP-08
 * Investment Lab Reactive Store
 *
 * Contract: market-r21-contract-v1
 * Uses useSyncExternalStore pattern with referentially stable immutable snapshots.
 */

import { useSyncExternalStore } from 'react';

const INITIAL_STATE = Object.freeze({
  activeTab: 'sip', // 'sip' | 'lumpsum' | 'swp' | 'xirr' | 'prepay'
  sip: Object.freeze({
    mode: 'regular', // 'regular' | 'stepup' | 'goal'
    monthlyContribution: 5000,
    termYears: 10,
    nominalAnnualPercent: 12,
    stepUpType: 'AMOUNT',
    stepUpValue: 1000,
    targetCorpus: 1000000,
    contributionTiming: 'END_OF_MONTH'
  }),
  lumpsum: Object.freeze({
    principal: 100000,
    termYears: 5,
    nominalAnnualPercent: 10,
    compoundingFrequency: 4, // Quarterly
    inflationAnnualPercent: 6.0
  }),
  swp: Object.freeze({
    initialCorpus: 2500000,
    monthlyWithdrawal: 20000,
    nominalAnnualPercent: 8.0,
    termYears: 20,
    withdrawalTiming: 'BEGINNING_OF_MONTH'
  }),
  xirr: Object.freeze({
    cashFlows: Object.freeze([
      Object.freeze({ id: 'cf-1', date: '2023-01-15', amount: -50000, note: 'Initial SIP / Purchase' }),
      Object.freeze({ id: 'cf-2', date: '2023-07-15', amount: -25000, note: 'Additional Investment' }),
      Object.freeze({ id: 'cf-3', date: '2024-03-20', amount: 15000, note: 'Dividend / Partial Redemption' }),
      Object.freeze({ id: 'cf-4', date: '2024-11-15', amount: -30000, note: 'Market Dip Top-up' })
    ]),
    terminalDate: '2026-11-20',
    terminalValue: 145000,
    includeTerminal: true
  }),
  prepay: Object.freeze({
    loanPrincipal: 3000000,
    loanAnnualPercent: 8.5,
    loanTermYears: 20,
    monthlySurplus: 10000,
    investmentAnnualPercent: 12.0
  })
});

class LabStore {
  constructor() {
    this.state = INITIAL_STATE;
    this.listeners = new Set();
  }

  getSnapshot = () => {
    return this.state;
  };

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  setActiveTab(tabId) {
    if (this.state.activeTab === tabId) return;
    this.state = Object.freeze({
      ...this.state,
      activeTab: tabId
    });
    this.notify();
  }

  updateSip(updates) {
    this.state = Object.freeze({
      ...this.state,
      sip: Object.freeze({
        ...this.state.sip,
        ...updates
      })
    });
    this.notify();
  }

  updateLumpsum(updates) {
    this.state = Object.freeze({
      ...this.state,
      lumpsum: Object.freeze({
        ...this.state.lumpsum,
        ...updates
      })
    });
    this.notify();
  }

  updateSwp(updates) {
    this.state = Object.freeze({
      ...this.state,
      swp: Object.freeze({
        ...this.state.swp,
        ...updates
      })
    });
    this.notify();
  }

  updatePrepay(updates) {
    this.state = Object.freeze({
      ...this.state,
      prepay: Object.freeze({
        ...this.state.prepay,
        ...updates
      })
    });
    this.notify();
  }

  updateXirr(updates) {
    this.state = Object.freeze({
      ...this.state,
      xirr: Object.freeze({
        ...this.state.xirr,
        ...updates
      })
    });
    this.notify();
  }

  addXirrCashFlow(cashFlow) {
    const newId = 'cf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const newEntry = Object.freeze({
      id: newId,
      date: cashFlow.date || new Date().toISOString().slice(0, 10),
      amount: Number(cashFlow.amount) || 0,
      note: String(cashFlow.note || '')
    });
    this.state = Object.freeze({
      ...this.state,
      xirr: Object.freeze({
        ...this.state.xirr,
        cashFlows: Object.freeze([...this.state.xirr.cashFlows, newEntry])
      })
    });
    this.notify();
  }

  removeXirrCashFlow(id) {
    this.state = Object.freeze({
      ...this.state,
      xirr: Object.freeze({
        ...this.state.xirr,
        cashFlows: Object.freeze(this.state.xirr.cashFlows.filter(cf => cf.id !== id))
      })
    });
    this.notify();
  }

  setXirrCashFlows(cashFlows) {
    const frozen = Object.freeze(cashFlows.map((cf, i) => Object.freeze({
      id: cf.id || ('cf-' + i),
      date: String(cf.date || ''),
      amount: Number(cf.amount) || 0,
      note: String(cf.note || '')
    })));
    this.state = Object.freeze({
      ...this.state,
      xirr: Object.freeze({
        ...this.state.xirr,
        cashFlows: frozen
      })
    });
    this.notify();
  }

  reset() {
    this.state = INITIAL_STATE;
    this.notify();
  }
}

export const labStore = new LabStore();

export function useLabStore() {
  return useSyncExternalStore(labStore.subscribe, labStore.getSnapshot);
}
