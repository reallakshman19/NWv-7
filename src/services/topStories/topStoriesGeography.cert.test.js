import { describe, expect, it } from 'vitest';
import { getTopStoriesPolicy } from './topStoriesPolicy.js';
import { selectTopStorySlotsWithTrace } from './topStoriesSelection.js';

function candidate(id, extra = {}) {
  return {
    id,
    title: `Public safety event ${id}`,
    source: `Publisher ${id}`,
    section: `section-${id}`,
    region: 'in',
    _topStoryRank: { slotBand: 'primary', clusterKey: id, normalizedScore: 0.8 },
    ...extra,
  };
}

function select(rows) {
  return selectTopStorySlotsWithTrace(rows, { policy: getTopStoriesPolicy() });
}

describe('Top Stories geography diversity', () => {
  it('does not treat acquisition region in as one event geography across editorial regions', () => {
    const rows = ['world', 'india', 'tn', 'muscat'].flatMap(section => (
      Array.from({ length: 4 }, (_, index) => candidate(`${section}-${index}`, { section }))
    ));
    const { selected } = select(rows);
    expect(selected).toHaveLength(16);
    expect(selected.map(row => row.id)).toEqual(rows.map(row => row.id));
  });

  it('applies one geographic budget to editorial aliases of the same region', () => {
    const rows = Array.from({ length: 12 }, (_, index) => candidate(`tn-${index}`, {
      section: ['tn', 'chennai', 'trichy'][index % 3],
    }));
    expect(select(rows).selected).toHaveLength(9);
  });

  it('retains the geographic cap for an explicit shared event city across sections', () => {
    const rows = Array.from({ length: 12 }, (_, index) => candidate(`city-${index}`, {
      ...(index % 3 === 0 ? { city: 'Muscat' }
        : index % 3 === 1 ? { location: { city: 'Muscat' } }
          : { geo: 'Muscat' }),
    }));
    expect(select(rows).selected).toHaveLength(9);
  });

  it('retains one geographic budget for an explicit shared country with code aliases', () => {
    const rows = Array.from({ length: 12 }, (_, index) => candidate(`country-${index}`, {
      ...(index % 2 === 0 ? { countryCode: 'IN' } : { country: 'India' }),
    }));
    expect(select(rows).selected).toHaveLength(9);
  });
});
