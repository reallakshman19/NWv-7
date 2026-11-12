import { useEffect } from 'react';
import { upAheadExpiryMs } from '../services/upAheadLifecycle.js';

export function useUpAheadExpiry(data, refreshProjection) {
  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    const items = [
      ...Object.values(data.sections || {}).flat(),
      ...(data.timeline || []).flatMap(day => day.items),
    ];
    let nextUpdate = nextDay.getTime();
    for (const item of items) {
      const expiry = upAheadExpiryMs(item);
      if (expiry > now && expiry < nextUpdate) nextUpdate = expiry;
    }
    // Update the display at the next expiry or calendar-day boundary.
    const timer = window.setTimeout(refreshProjection, nextUpdate - now);
    return () => window.clearTimeout(timer);
  }, [data, refreshProjection]);
}
