import React, { useState, useCallback } from 'react';
import { getFetchMode, setFetchMode, FETCH_MODES } from '../utils/fetchMode.js';
import { clearEnvelopeCache } from '../data/orchestrator/useDataset.js';

export default function FetchModeToggle() {
    const [mode, setMode] = useState(getFetchMode);
    const [saveFailed, setSaveFailed] = useState(false);

    const toggle = useCallback((next) => {
        if (next === mode) return;
        if (!setFetchMode(next)) {
            setSaveFailed(true);
            return;
        }
        setSaveFailed(false);
        setMode(next);
        clearEnvelopeCache();
        // Reload the page so all contexts and services re-initialise with the new mode.
        window.location.reload();
    }, [mode]);

    const isLive = mode === FETCH_MODES.LIVE;

    return (
        <div className="fetch-mode-toggle" role="group" aria-label="Data fetch mode (runtime and page restrictions apply)">
            <button
                type="button"
                className={`fmt-btn${!isLive ? ' fmt-btn--active' : ''}`}
                onClick={() => toggle(FETCH_MODES.HYBRID)}
                title="Hybrid: prefer published data; eligible pages may refresh feeds. Up Ahead has its own Worker-first source policy."
                aria-pressed={!isLive}
            >
                Hybrid
            </button>
            <button
                type="button"
                className={`fmt-btn${isLive ? ' fmt-btn--active' : ''}`}
                onClick={() => toggle(FETCH_MODES.LIVE)}
                title="Live: request fresh sources only where runtime permits; static hosts use published snapshots. Up Ahead follows its separate Worker-first policy."
                aria-pressed={isLive}
            >
                Live
            </button>
            {saveFailed && <span role="status">Could not save the data mode on this device.</span>}
        </div>
    );
}
