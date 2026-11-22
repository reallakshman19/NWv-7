import { describe, expect, it } from 'vitest';
import { isActionableLocalAlert } from './upAheadLocalPolicy.js';
import { getVisibleUpAheadProjection } from './upAheadProjection.js';

const now = Date.now();
const active = (id, title, category='alerts') => ({
  id, title, category, source: 'Local news',
  city: 'Muscat', region: 'oman',
  eventStartAt: null,
  expiryAt: now + 24 * 60 * 60 * 1000,
  publishedAt: now - 3 * 60 * 60 * 1000,
  observedAt: now - 3 * 60 * 60 * 1000,
});

describe('UpAhead source-backed actionable alert admission', () => {
  it('rejects single-patient rescue reporting even with Muscat location and recent clocks', () => {
    expect(isActionableLocalAlert(active('rescue','RAFO airlifts Russian national for medical emergency'))).toBe(false);
    expect(isActionableLocalAlert(active('medevac','Muscat medical evacuation to hospital by helicopter'))).toBe(false);
    expect(isActionableLocalAlert(active('advisory','Muscat newspaper issues generic advisory'))).toBe(false);
  });

  it('retains actionable notices with specific service and resident impact', () => {
    for (const title of [
      'Muscat water supply interruption tomorrow',
      'Muscat power shutdown in Seeb district',
      'Muscat road closure and traffic diversion',
      'Evacuation order for residents of Muscat',
      'Muscat airport closure due to storms',
    ]) expect(isActionableLocalAlert(active(title,title))).toBe(true);
  });

  it('filters retained v1 medical-rescue articles at browser projection time', () => {
    const rescue = active('rescue','RAFO airlifts Russian national for medical emergency');
    const shutdown = active('shutdown','Muscat power shutdown on November 24');
    const data = {
      fetchedAt: now,
      sections:{alerts:[rescue,shutdown]},
      timeline:[],weekly_plan:[],
    };
    const settings={upAhead:{locations:['Muscat'],categories:{alerts:true}}};
    const projection = getVisibleUpAheadProjection({data,settings});
    expect(projection.generalAlerts.map(row=>row.id)).toEqual(['shutdown']);
    expect(projection.combinedAlerts.map(row=>row.id)).toEqual(['shutdown']);
    expect(projection.projectedSections.alerts.map(row=>row.id)).toEqual(['shutdown']);
  });
});
