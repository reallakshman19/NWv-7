/**
 * NWv7 Market Desk R2.1 - WP-05 Fund NAV Trajectory & Comparison Chart
 * Pure SVG, zero-dependency accessible charting component.
 * Supports:
 * - Trajectory inspection for single scheme with 1M, 6M, 1Y, 3Y, 5Y, ALL horizons
 * - Normalized base-100 multi-scheme comparison overlay
 * - Min/Max reference guides, hover inspection, accessible data table fallback
 */

import React, { useState, useMemo } from 'react';
import { sanitizeAndSortNavHistory, subtractCalendarPeriod } from './fundMath.js';

export const CHART_RANGES = Object.freeze([
  { id: '1M', label: '1M', months: 1, years: 0 },
  { id: '6M', label: '6M', months: 6, years: 0 },
  { id: '1Y', label: '1Y', months: 0, years: 1 },
  { id: '3Y', label: '3Y', months: 0, years: 3 },
  { id: '5Y', label: '5Y', months: 0, years: 5 },
  { id: 'ALL', label: 'ALL', months: 0, years: 0 }
]);

const COMPARISON_COLORS = ['#388bfd', '#3fb950', '#d29922', '#a371f7'];

export function FundNavChart({
  observations = [],
  activeRange = '1Y',
  onRangeChange = null,
  isComparison = false,
  comparisonData = null, // { alignedDates: [], seriesByScheme: {} }
  schemesMeta = {} // schemeCode -> { name, color }
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  // Single-scheme filtered observations
  const filteredSingle = useMemo(() => {
    if (isComparison || !Array.isArray(observations) || observations.length === 0) return [];
    const sorted = sanitizeAndSortNavHistory(observations);
    if (sorted.length === 0) return [];

    if (activeRange === 'ALL') return sorted;

    const rangeConfig = CHART_RANGES.find(r => r.id === activeRange) || CHART_RANGES[2];
    const latestDate = sorted[sorted.length - 1].date;
    const targetDate = subtractCalendarPeriod(latestDate, { months: rangeConfig.months, years: rangeConfig.years });

    return sorted.filter(o => o.date >= targetDate);
  }, [observations, activeRange, isComparison]);

  // Chart dimensions
  const width = 640;
  const height = 260;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Compute Scales
  const chartModel = useMemo(() => {
    if (isComparison && comparisonData && Array.isArray(comparisonData.alignedDates) && comparisonData.alignedDates.length > 0) {
      const dates = comparisonData.alignedDates;
      const codes = Object.keys(comparisonData.seriesByScheme || {});

      let minVal = Infinity;
      let maxVal = -Infinity;

      for (const code of codes) {
        const series = comparisonData.seriesByScheme[code];
        for (const pt of series) {
          if (pt.normalized < minVal) minVal = pt.normalized;
          if (pt.normalized > maxVal) maxVal = pt.normalized;
        }
      }

      if (!Number.isFinite(minVal)) minVal = 90;
      if (!Number.isFinite(maxVal)) maxVal = 110;
      if (minVal === maxVal) { minVal *= 0.95; maxVal *= 1.05; }

      const yBuffer = (maxVal - minVal) * 0.08;
      const yMin = Math.max(0, minVal - yBuffer);
      const yMax = maxVal + yBuffer;

      const lines = codes.map((code, idx) => {
        const series = comparisonData.seriesByScheme[code] || [];
        const color = COMPARISON_COLORS[idx % COMPARISON_COLORS.length];
        const points = series.map((pt, i) => {
          const x = padLeft + (i / (dates.length - 1 || 1)) * plotWidth;
          const y = padTop + plotHeight - ((pt.normalized - yMin) / (yMax - yMin)) * plotHeight;
          return { x, y, pt, code };
        });
        const pathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        return { code, color, points, pathStr };
      });

      return { isComparison: true, dates, yMin, yMax, lines, minVal, maxVal };
    }

    // Single series
    const data = filteredSingle;
    if (data.length < 2) return null;

    let minNav = data[0].nav;
    let maxNav = data[0].nav;
    let minIdx = 0;
    let maxIdx = 0;

    data.forEach((pt, idx) => {
      if (pt.nav < minNav) { minNav = pt.nav; minIdx = idx; }
      if (pt.nav > maxNav) { maxNav = pt.nav; maxIdx = idx; }
    });

    const buffer = (maxNav - minNav) * 0.08 || minNav * 0.05;
    const yMin = Math.max(0, minNav - buffer);
    const yMax = maxNav + buffer;

    const points = data.map((pt, i) => {
      const x = padLeft + (i / (data.length - 1)) * plotWidth;
      const y = padTop + plotHeight - ((pt.nav - yMin) / (yMax - yMin)) * plotHeight;
      return { x, y, pt };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + plotHeight).toFixed(1)} Z`;

    const startNav = data[0].nav;
    const endNav = data[data.length - 1].nav;
    const isGain = endNav >= startNav;

    return {
      isComparison: false,
      data,
      yMin,
      yMax,
      minNav,
      maxNav,
      minIdx,
      maxIdx,
      points,
      linePath,
      areaPath,
      isGain,
      startNav,
      endNav
    };
  }, [filteredSingle, isComparison, comparisonData, padLeft, padTop, plotWidth, plotHeight]);

  if (!chartModel) {
    return (
      <div className="fund-chart-empty">
        <p>Insufficient historical observations to render trajectory chart.</p>
      </div>
    );
  }

  const activePoint = (hoverIndex !== null && chartModel.points?.[hoverIndex]) ? chartModel.points[hoverIndex] : null;

  return (
    <div className="fund-nav-chart-card">
      <div className="fund-chart-header">
        <div className="fund-chart-title-wrap">
          <span className="fund-chart-metric-title">
            {chartModel.isComparison ? 'Normalized Comparative Performance (Rebased to 100)' : 'NAV Trajectory'}
          </span>
          {!chartModel.isComparison && (
            <div className="fund-chart-val-wrap">
              <span className="fund-chart-latest-nav">
                ₹{chartModel.endNav.toFixed(2)}
              </span>
              <span className={`fund-chart-gain-pill ${chartModel.isGain ? 'profit' : 'loss'}`}>
                {chartModel.isGain ? '+' : ''}{(((chartModel.endNav - chartModel.startNav) / chartModel.startNav) * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Range Selector */}
        {!isComparison && onRangeChange && (
          <div className="fund-chart-range-bar" role="group" aria-label="Select historical horizon">
            {CHART_RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                className={`fund-range-btn ${activeRange === r.id ? 'active' : ''}`}
                onClick={() => onRangeChange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="fund-svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="fund-svg-chart"
          role="img"
          aria-label={chartModel.isComparison ? 'Comparative mutual fund return chart' : 'NAV historical trajectory chart'}
        >
          <defs>
            <linearGradient id="fundAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#388bfd" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#388bfd" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke="#30363d" strokeDasharray="3 3" />
          <line x1={padLeft} y1={padTop + plotHeight / 2} x2={width - padRight} y2={padTop + plotHeight / 2} stroke="#21262d" strokeDasharray="3 3" />
          <line x1={padLeft} y1={padTop + plotHeight} x2={width - padRight} y2={padTop + plotHeight} stroke="#30363d" />

          {/* Y Axis Labels */}
          <text x={padLeft - 6} y={padTop + 4} textAnchor="end" className="svg-axis-label">
            {chartModel.isComparison ? `${Math.round(chartModel.yMax)}` : `₹${Math.round(chartModel.yMax)}`}
          </text>
          <text x={padLeft - 6} y={padTop + plotHeight / 2 + 4} textAnchor="end" className="svg-axis-label">
            {chartModel.isComparison ? `${Math.round((chartModel.yMax + chartModel.yMin) / 2)}` : `₹${Math.round((chartModel.yMax + chartModel.yMin) / 2)}`}
          </text>
          <text x={padLeft - 6} y={padTop + plotHeight} textAnchor="end" className="svg-axis-label">
            {chartModel.isComparison ? `${Math.round(chartModel.yMin)}` : `₹${Math.round(chartModel.yMin)}`}
          </text>

          {/* Comparison Multiple Lines */}
          {chartModel.isComparison && chartModel.lines.map((line) => (
            <path
              key={line.code}
              d={line.pathStr}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ))}

          {/* Single Series Area and Line */}
          {!chartModel.isComparison && (
            <>
              <path d={chartModel.areaPath} fill="url(#fundAreaGrad)" />
              <path
                d={chartModel.linePath}
                fill="none"
                stroke={chartModel.isGain ? '#388bfd' : '#f85149'}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />

              {/* End Point marker */}
              <circle
                cx={chartModel.points[chartModel.points.length - 1].x}
                cy={chartModel.points[chartModel.points.length - 1].y}
                r="4"
                fill="#58a6ff"
              />
            </>
          )}

          {/* X Axis Date Labels */}
          {!chartModel.isComparison && (
            <>
              <text x={padLeft} y={height - 10} textAnchor="start" className="svg-axis-label">
                {chartModel.data[0].date}
              </text>
              <text x={width - padRight} y={height - 10} textAnchor="end" className="svg-axis-label">
                {chartModel.data[chartModel.data.length - 1].date}
              </text>
            </>
          )}

          {chartModel.isComparison && (
            <>
              <text x={padLeft} y={height - 10} textAnchor="start" className="svg-axis-label">
                {chartModel.dates[0]}
              </text>
              <text x={width - padRight} y={height - 10} textAnchor="end" className="svg-axis-label">
                {chartModel.dates[chartModel.dates.length - 1]}
              </text>
            </>
          )}

          {/* Interactive invisible hover overlay for single series */}
          {!chartModel.isComparison && chartModel.points.map((p, idx) => (
            <rect
              key={p.pt.date}
              x={p.x - (plotWidth / chartModel.points.length) / 2}
              y={padTop}
              width={plotWidth / chartModel.points.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              className="svg-hover-target"
            />
          ))}

          {/* Active Hover Guideline and Dot */}
          {activePoint && (
            <g pointerEvents="none">
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={padTop + plotHeight}
                stroke="#58a6ff"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={activePoint.x} cy={activePoint.y} r="5" fill="#ffffff" stroke="#58a6ff" strokeWidth="2" />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div
            className="fund-chart-tooltip"
            style={{
              left: Math.min(width - 150, Math.max(10, activePoint.x - 60)),
              top: Math.max(10, activePoint.y - 45)
            }}
          >
            <div className="tooltip-date">{activePoint.pt.date}</div>
            <div className="tooltip-val">NAV: ₹{activePoint.pt.nav.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* Comparison Legend */}
      {chartModel.isComparison && (
        <div className="fund-compare-legend">
          {chartModel.lines.map((line) => {
            const meta = schemesMeta[line.code];
            const lastPt = line.points[line.points.length - 1];
            const gain = lastPt ? (lastPt.pt.normalized - 100).toFixed(1) : '0.0';
            return (
              <div key={line.code} className="legend-item">
                <span className="legend-color-dot" style={{ backgroundColor: line.color }} />
                <span className="legend-name">{meta?.name || `Scheme ${line.code}`}</span>
                <span className={`legend-gain ${Number(gain) >= 0 ? 'profit' : 'loss'}`}>
                  {Number(gain) >= 0 ? '+' : ''}{gain}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Screen Reader Table Fallback */}
      <table className="sr-only" aria-label="NAV trajectory data summary">
        <thead>
          <tr>
            <th>Date</th>
            <th>NAV</th>
          </tr>
        </thead>
        <tbody>
          {!chartModel.isComparison && chartModel.data.slice(-10).map(d => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.nav}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
