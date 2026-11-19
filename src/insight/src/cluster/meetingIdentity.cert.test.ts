import { expect, it } from 'vitest';
import { hasSharedMeetingIdentity } from './meetingIdentity';
const NOW = Date.parse('2026-11-19T05:00:00Z');
const story = (title: string, offset = 0) => ({ title, publishedAt: NOW + offset });
it('recognizes reordered leaders and genuine context about one meeting', () => {
  const a = story('APEC Live: Trump, Xi and Putin to meet at trilateral China summit');
  expect(hasSharedMeetingIdentity(a, story("Trump, Putin, Xi's Historic Meet In China Today. What's On Agenda?"))).toBe(true);
  expect(hasSharedMeetingIdentity(a, story('Why the world is watching the Trump-Xi-Putin meet in Shenzhen'))).toBe(true);
});
it('does not join different summits, venues, labelled dates, actor groups or distant reports', () => {
  const a = story('Trump, Xi and Putin meet at APEC summit in China on 2026-11-19');
  for (const b of [
    story('Trump, Xi and Putin meet at G20 summit in China on 2026-11-19'),
    story('Trump, Xi and Putin meet at APEC summit in France on 2026-11-19'),
    story('Trump, Xi and Putin meet at APEC summit in China on 2026-11-20'),
    story('Trump, Modi and Macron meet at APEC summit in China on 2026-11-19'),
    story(a.title, 48 * 3_600_000), story('China leaders discuss summit agenda and world news'),
    story('Teachers Students Parents discuss APEC summit news'),
  ]) expect(hasSharedMeetingIdentity(a, b)).toBe(false);
});
it('does not use three shared company names as diplomatic actor evidence', () => {
  const a = { ...story('Apple Google Microsoft meet at technology summit'), entities: { orgs: ['Apple', 'Google', 'Microsoft'] } };
  expect(hasSharedMeetingIdentity(a, { ...a, title: 'Microsoft Google Apple meet at company summit' })).toBe(false);
});
