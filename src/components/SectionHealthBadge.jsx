import React from 'react';

const BADGE_STATES = Object.freeze({
  ok: {
    status: 'ok',
    icon: '🟢',
    label: 'OK',
    title: 'Section health: ok',
  },
  warning: {
    status: 'warning',
    icon: '🟠',
    label: 'Warning',
    title: 'Section health: warning or degraded',
  },
  critical: {
    status: 'critical',
    icon: '🔴',
    label: 'Critical',
    title: 'Section health: critical',
  },
  unknown: {
    status: 'unknown',
    icon: '⚪',
    label: 'Unknown',
    title: 'Section health diagnostics unavailable',
  },
});

function normalizeBadgeStatus(summary) {
  const status = String(summary?.status || '').toLowerCase();
  if (status === 'ok' || status === 'warning' || status === 'critical') return status;
  return 'unknown';
}

function getSectionHealthBadgeState(summary) {
  const state = BADGE_STATES[normalizeBadgeStatus(summary)] || BADGE_STATES.unknown;
  const sectionId = summary?.sectionId || 'section';
  const reasons = Array.isArray(summary?.reasons) && summary.reasons.length > 0
    ? ` Reasons: ${summary.reasons.join(', ')}`
    : '';

  return {
    ...state,
    sectionId,
    ariaLabel: `${state.title} for ${sectionId}.${reasons}`,
  };
}

export default function SectionHealthBadge({ summary = null, onClick = null }) {
  const state = getSectionHealthBadgeState(summary);

  return (
    <button
      type="button"
      className={`section-health-badge section-health-badge--${state.status}`}
      data-status={state.status}
      title={state.ariaLabel}
      aria-label={state.ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        if (typeof onClick === 'function') onClick(event);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.06)',
        color: 'inherit',
        cursor: 'help',
        font: 'inherit',
        fontSize: '0.72rem',
        lineHeight: 1,
        padding: '3px 7px',
      }}
    >
      <span aria-hidden="true">{state.icon}</span>
      <span className="section-health-badge__label">{state.label}</span>
    </button>
  );
}
