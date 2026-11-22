import React from 'react';

/** Original, inline SVG-only hazard symbols. They do not assert an active warning. */
export default function SevereWeatherIcon({ type = 'warning', size = 24 }) {
  const common = { viewBox:'0 0 48 48', width:size, height:size, fill:'none',
    stroke:'currentColor', strokeWidth:2.4, strokeLinecap:'round', strokeLinejoin:'round',
    role:'img', 'aria-label': type.replace(/-/g, ' ') };
  const cyclone = <><path d="M40 22C40 11 31 5 21 7C12 9 7 17 9 26C11 35 20 40 29 36C37 33 39 24 34 18C30 13 22 13 18 18C13 24 19 33 26 30C30 28 31 22 27 21C24 20 22 22 23 25"/><circle cx="24" cy="25" r="1.5" fill="currentColor"/></>;
  const sandstorm = <><path d="M5 16h26c8 0 9-7 4-8-4-1-6 2-5 4M4 24h36M9 31h21c8 0 11 7 5 9-4 2-7-1-5-4"/><circle cx="14" cy="12" r="2"/><circle cx="41" cy="20" r="2"/><circle cx="15" cy="37" r="2.5"/></>;
  const types = {
    cyclone,
    sandstorm,
    duststorm: sandstorm,
    thunderstorm: <><path d="M14 30a11 11 0 1 1 20-7 8 8 0 0 1 2 15h-7M18 31h-5"/><path d="m25 25-7 11h6l-3 9 12-16h-7"/></>,
    'heavy-rain': <><path d="M12 29a10 10 0 0 1 18-10 8 8 0 0 1 6 14H11"/><path d="m13 37-2 5m11-5-2 5m11-5-2 5"/></>,
    flood: <><path d="M5 17c4-4 8 4 12 0s8 4 12 0 8 4 14 0M5 26c4-4 8 4 12 0s8 4 12 0 8 4 14 0M5 35c4-4 8 4 12 0s8 4 12 0 8 4 14 0"/></>,
    heat: <><circle cx="28" cy="17" r="7"/><path d="M28 3v4m0 20v4M14 17h5m18 0h6M17 6l4 4m14 14 4 4M21 25l-4 4M35 10l4-4M13 11v20a8 8 0 1 0 9 0V11a4.5 4.5 0 0 0-9 0Z"/></>,
    fog: <><path d="M7 16h34M3 23h30M12 30h32M6 37h27"/></>,
    warning: <><path d="M24 5 45 42H3L24 5Z"/><path d="M24 17v12m0 6v.01"/></>,
  };
  return <svg {...common}>{types[type] || types.warning}</svg>;
}
