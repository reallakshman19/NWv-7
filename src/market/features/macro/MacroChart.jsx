/**
 * NWv7 Market Desk R2.1 - WP-06 Macro & FX SVG Chart Component
 * Accessible, pure SVG visualizer with dynamic observation-year axis labels,
 * negative/positive bar drawing for annual macro indicators, and daily line charts for FX.
 */

import React, { useState, useMemo } from 'react';

export function MacroChart({
  mode = 'BAR', // 'BAR' | 'LINE'
  data = [],    // BAR: [{ year: '2020', value: -5.77 }, ...], LINE: [{ date: '2024-11-10', rate: 242.41 }, ...]
  unit = '%',
  title = 'Annual Indicator History'
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

    if (mode === 'BAR') {
      // Annual macro bars (e.g. GDP growth / Inflation)
      const values = data.map(d => Number(d.value)).filter(Number.isFinite);
      if (values.length === 0) return null;

      let min = Math.min(0, ...values);
      let max = Math.max(0, ...values);
      if (min === max) {
        min -= 1;
        max += 1;
      }
      // Add 10% breathing room
      const span = max - min;
      min -= span * 0.1;
      max += span * 0.1;

      const yScale = val => padTop + plotHeight - ((val - min) / (max - min)) * plotHeight;
      const zeroY = yScale(0);

      const colWidth = plotWidth / data.length;
      const barWidth = Math.max(4, Math.min(24, colWidth * 0.65));

      const bars = data.map((d, idx) => {
        const val = Number(d.value);
        const yVal = yScale(val);
        const x = padLeft + idx * colWidth + (colWidth - barWidth) / 2;
        const barHeight = Math.abs(yVal - zeroY);
        const y = val >= 0 ? yVal : zeroY;

        return {
          year: d.year,
          val,
          x,
          y,
          width: barWidth,
          height: Math.max(2, barHeight),
          isPositive: val >= 0
        };
      });

      return {
        mode: 'BAR',
        bars,
        zeroY,
        min,
        max,
        firstYear: data[0].year,
        lastYear: data[data.length - 1].year
      };
    }

    if (mode === 'LINE') {
      // Daily FX Line
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
        mode: 'LINE',
        points,
        linePath,
        isGain,
        min,
        max,
        firstDate: data[0].date,
        lastDate: data[data.length - 1].date
      };
    }

    return null;
  }, [data, mode, plotHeight, plotWidth]);

  if (!chartModel) {
    return (
      <div className="macro-chart-empty">
        <p>No qualified historical observations available for charting.</p>
      </div>
    );
  }

  const activeBar = chartModel.mode === 'BAR' && hoverIndex !== null ? chartModel.bars[hoverIndex] : null;
  const activePoint = chartModel.mode === 'LINE' && hoverIndex !== null ? chartModel.points[hoverIndex] : null;

  return (
    <div className="macro-chart-card">
      <div className="macro-chart-header">
        <span className="macro-chart-title">{title}</span>
        <span className="macro-chart-range-label">
          {chartModel.mode === 'BAR'
            ? `${chartModel.firstYear} — ${chartModel.lastYear} (${data.length} observations)`
            : `${chartModel.firstDate} — ${chartModel.lastDate} (${data.length} trading days)`}
        </span>
      </div>

      <div className="macro-svg-wrapper">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${width} ${height}`}
          className="macro-svg-element"
        >
          {/* Y Axis Guide Lines */}
          <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke="#30363d" strokeDasharray="3 3" />
          <line x1={padLeft} y1={padTop + plotHeight / 2} x2={width - padRight} y2={padTop + plotHeight / 2} stroke="#21262d" strokeDasharray="3 3" />
          <line x1={padLeft} y1={padTop + plotHeight} x2={width - padRight} y2={padTop + plotHeight} stroke="#30363d" />

          {/* Y Axis Labels */}
          <text x={padLeft - 6} y={padTop + 4} textAnchor="end" className="svg-axis-label">
            {chartModel.max.toFixed(1)}{unit}
          </text>
          <text x={padLeft - 6} y={padTop + plotHeight / 2 + 4} textAnchor="end" className="svg-axis-label">
            {((chartModel.max + chartModel.min) / 2).toFixed(1)}{unit}
          </text>
          <text x={padLeft - 6} y={padTop + plotHeight + 4} textAnchor="end" className="svg-axis-label">
            {chartModel.min.toFixed(1)}{unit}
          </text>

          {/* Zero baseline for Macro Bar mode */}
          {chartModel.mode === 'BAR' && (
            <line
              x1={padLeft}
              y1={chartModel.zeroY}
              x2={width - padRight}
              y2={chartModel.zeroY}
              stroke="#8b949e"
              strokeWidth="1.2"
            />
          )}

          {/* Macro Bars */}
          {chartModel.mode === 'BAR' && chartModel.bars.map((b, idx) => (
            <rect
              key={b.year}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill={b.isPositive ? '#3fb950' : '#f85149'}
              rx="2"
              className={`macro-chart-bar ${hoverIndex === idx ? 'hovered' : ''}`}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}

          {/* FX Line */}
          {chartModel.mode === 'LINE' && (
            <>
              <path
                d={chartModel.linePath}
                fill="none"
                stroke={chartModel.isGain ? '#388bfd' : '#f85149'}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              {chartModel.points.map((p, idx) => (
                <circle
                  key={p.date}
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill="#58a6ff"
                  className={`macro-chart-dot ${hoverIndex === idx ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              ))}
            </>
          )}

          {/* Dynamic X Axis Labels */}
          {chartModel.mode === 'BAR' && (
            <>
              <text x={padLeft} y={height - 8} textAnchor="start" className="svg-axis-label">
                {chartModel.firstYear}
              </text>
              <text x={width - padRight} y={height - 8} textAnchor="end" className="svg-axis-label">
                {chartModel.lastYear}
              </text>
            </>
          )}

          {chartModel.mode === 'LINE' && (
            <>
              <text x={padLeft} y={height - 8} textAnchor="start" className="svg-axis-label">
                {chartModel.firstDate}
              </text>
              <text x={width - padRight} y={height - 8} textAnchor="end" className="svg-axis-label">
                {chartModel.lastDate}
              </text>
            </>
          )}
        </svg>

        {/* Hover inspection overlay */}
        {activeBar && (
          <div
            className="macro-chart-tooltip"
            style={{ left: Math.min(width - 120, Math.max(10, activeBar.x - 30)), top: Math.max(10, activeBar.y - 35) }}
          >
            <strong>{activeBar.year}</strong>: {activeBar.val > 0 ? '+' : ''}{activeBar.val.toFixed(2)}{unit}
          </div>
        )}

        {activePoint && (
          <div
            className="macro-chart-tooltip"
            style={{ left: Math.min(width - 140, Math.max(10, activePoint.x - 40)), top: Math.max(10, activePoint.y - 35) }}
          >
            <span>{activePoint.date}</span>: <strong>{activePoint.rate.toFixed(2)}</strong>
          </div>
        )}
      </div>

      {/* Screen reader table fallback */}
      <table className="sr-only" aria-label={`${title} data table`}>
        <thead>
          <tr>
            <th>Observation</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {chartModel.mode === 'BAR' && chartModel.bars.map(b => (
            <tr key={b.year}>
              <td>{b.year}</td>
              <td>{b.val}{unit}</td>
            </tr>
          ))}
          {chartModel.mode === 'LINE' && chartModel.points.map(p => (
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
