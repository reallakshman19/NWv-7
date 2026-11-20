/**
 * NWv-7 Market Desk R2.1 — WP-01 Overview and Navigation Feature Package
 *
 * Provides the standalone Overview dashboard, responsive navigation,
 * indicative session status header, and error-boundary protected slot interfaces.
 */

export {
  Overview,
  Overview as MarketOverview,
  DEFAULT_OVERVIEW_SLOTS,
} from './Overview.jsx';

export {
  MarketNav,
  MOBILE_DIRECT_IDS,
  MOBILE_MORE_IDS,
  MOBILE_DISPLAY_LABELS,
} from './MarketNav.jsx';

export {
  MarketSessionHeader,
} from './MarketSessionHeader.jsx';

export {
  OverviewSlotErrorBoundary,
} from './OverviewSlotErrorBoundary.jsx';
