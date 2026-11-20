/**
 * NWv7 Market Desk R2.1 - WP-08
 * Canonical Barrel for src/market/math/
 *
 * Contract: market-r21-contract-v1
 */

export {
  calcXirr,
  findXirrRoots,
  normalizeCashFlows,
  parseDateToDays,
  DEFAULT_ANNUALIZATION_BASIS
} from './xirrSolver.js';

export {
  calcSip,
  calcStepUpSip,
  calcGoalSip,
  calculateSip
} from './sipEngine.js';

export {
  calcSwp,
  SWP_DISCLAIMER
} from './swpEngine.js';

export {
  calcLumpsum
} from './lumpsumEngine.js';

export {
  calcEmi,
  comparePrepayVsInvest,
  PREPAY_COMPARATOR_DISCLAIMER
} from './loanEngine.js';

export {
  calcCagr,
  calcAbsoluteReturn
} from './cagrEngine.js';

export {
  calcRuleOf72
} from './ruleOf72Engine.js';
