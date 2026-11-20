/**
 * NWv7 Market Desk R2.1 - WP-06 Currency Daily SVG Line Chart
 * Accessible, pure SVG visualizer for daily central-bank benchmark exchange rates.
 * Supports multi-horizon trajectories (7D, 30D, 90D) with hover tooltips and screen reader fallback.
 */

import React, { useState, useMemo } from 'react';

export function FxLineChart({
  data = [],
  unit = '',
  title = 'Daily Exchange Rate Benchmark'
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = 560;
  const height = 220;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 20;
  const padBottom = 30;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const chartModel = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;
    const rates = data.map(d => Number(d.rate)).filter(r => Number.isFinite(r) && r > 0);
    if (rates.length === 0) return null;

    let min = Math.min(...rates);
    let max = Math.max(...rates);
    if (min === max) {
      min *= 0.99;
      max *= 1.01;
    }
    const span = max - min;
    min -= span * 0.1;
    max += span * 0.1;

    const yScale = val => padTop + plotHeight - ((val - min) / (max - min)) * plotHeight;
    const colWidth = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;

    const points = data.map((d, idx) => {
      const x = padLeft + idx * colWidth;
      const y = yScale(Number(d.rate));
      return { date: d.date, rate: Number(d.rate), x, y };
    });

    const linePath = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');

    const isGain = points[points.length - 1].rate >= points[0].rate;

    return {
      points,
      linePath,
      isGain,
      min,
      max,
      firstDate: data[0].date,
      lastDate: data[data.length - 1].date
    };
  }, [data, plotHeight, plotWidth]);

  if (!chartModel) {
    return (
      <div className="macro-chart-empty">
        <p>No qualified historical observations available for charting.</p>
      </div>
    );
  }

  const activePoint = hoverIndex !== null ? chartModel.points[hoverIndex] : null;

  return (
    <div className="macro-chart-card">
      <div className="macro-chart-header">
        <span className="macro-chart-title">{title}</span>
        <span className="macro-chart-range-label">
          {chartModel.firstDate} — {chartModel.lastDate}
        </span>
      </div>
      <div className="macro-svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="macro-svg-element"
          role="img"
          aria-label={`${title} from ${chartModel.firstDate} to ${chartModel.lastDate}`}
        >
          {/* Axis and Gridlines */}
          <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotHeight} stroke="var(--border-color, #30363d)" />
          <line x1={padLeft} y1={padTop + plotHeight} x2={width - padRight} y2={padTop + plotHeight} stroke="var(--border-color, #30363d)" />

          {/* Polyline */}
          <path
            d={chartModel.linePath}
            fill="none"
            stroke={chartModel.isGain ? '#34d399' : '#f87171'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {chartModel.points.map((p, idx) => (
            <circle
              key={p.date}
              cx={p.x}
              cy={p.y}
              r={hoverIndex === idx ? 5 : 3}
              fill={chartModel.isGain ? '#34d399' : '#f87171'}
              className="macro-chart-dot"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}
        </svg>
      </div>
      {activePoint && (
        <div className="macro-chart-tooltip font-mono">
          <strong>{activePoint.date}:</strong> {activePoint.rate} {unit}
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {chartModel.points.map(p => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
