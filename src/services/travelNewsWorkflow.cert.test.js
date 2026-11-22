import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const TRAVEL_WORKFLOW = path.join(process.cwd(), '.github/workflows/travel-local-news.yml');

describe('Travel news workflow certification', () => {
  it('GitHub Actions workflow file exists and references travel-local-news', () => {
    expect(fs.existsSync(TRAVEL_WORKFLOW)).toBe(true);
    const content = fs.readFileSync(TRAVEL_WORKFLOW, 'utf8');
    expect(content).toContain('collect_travel_local_news.mjs');
    expect(content).toContain('travel-local-*.json');
    expect(content).toContain('TRAVEL_LOCATION_KEY');
  });

  it('RSS collector script exists and references location profile', () => {
    const collectorPath = path.join(process.cwd(), 'scripts/collect_travel_local_news.mjs');
    expect(fs.existsSync(collectorPath)).toBe(true);

    const content = fs.readFileSync(collectorPath, 'utf8');
    expect(content).toContain('buildTravelNewsQueries');
    expect(content).toContain('getTravelLocationProfile');
    expect(content).toContain('travel-local-');
    expect(content).toContain('sourceMode');
  });

  it('static source policy JSON is present for Colombo', () => {
    const policyPath = path.join(process.cwd(), 'public/data/travel-source-policy.json');
    expect(fs.existsSync(policyPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    expect(content.locations.map(loc => loc.key).sort()).toEqual(['chennai', 'colombo', 'muscat', 'trichy']);
    expect(content.locations.every(loc => loc.edition?.timeRange === '2d')).toBe(true);
    const trichy = content.locations.find(loc => loc.key === 'trichy');
    expect(trichy.queries).toContain('Tiruchi news');
    expect(trichy.queries).toContain('Tiruchirappalli news');
  });
});
