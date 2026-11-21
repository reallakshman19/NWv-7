import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALERT_FALLBACK_HOURS,
  NEWS_RETAIN_HOURS,
  OFFER_FALLBACK_HOURS,
  PLANNER_PAST_GRACE_HOURS,
  UPAHEAD_EVENT_PAST_GRACE_HOURS,
  UPAHEAD_LOOKAHEAD_DAYS,
  UPAHEAD_MIN_DEFAULT_HOURS,
  UPAHEAD_MAX_ACTIVE_HOURS,
  UPAHEAD_MAX_ACTIVE_ITEMS,
  UPAHEAD_MAX_ACTIVE_BYTES,
  UPAHEAD_MAX_PUBLICATION_BYTES,
} from '../src/config/horizonPolicy.js';

const pyPath = path.join(process.cwd(), 'scripts', 'horizon_policy.py');
const py = fs.readFileSync(pyPath, 'utf8');
const policy = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'upahead_retention_policy.json'), 'utf8'));


function readPyConst(name) {
  const match = py.match(new RegExp(`^${name}\\s*=\\s*(\\d[\\d_]*)`, 'm'));
  assert(match, `missing Python constant ${name}`);
  return Number(match[1].replaceAll('_', ''));
}

assert.equal(NEWS_RETAIN_HOURS, readPyConst('NEWS_RETAIN_HOURS'));
assert.equal(UPAHEAD_LOOKAHEAD_DAYS, readPyConst('UPAHEAD_LOOKAHEAD_DAYS'));
assert.equal(UPAHEAD_EVENT_PAST_GRACE_HOURS, readPyConst('UPAHEAD_EVENT_PAST_GRACE_HOURS'));
assert.equal(PLANNER_PAST_GRACE_HOURS, readPyConst('PLANNER_PAST_GRACE_HOURS'));
assert.equal(ALERT_FALLBACK_HOURS, readPyConst('ALERT_FALLBACK_HOURS'));
assert.equal(OFFER_FALLBACK_HOURS, readPyConst('OFFER_FALLBACK_HOURS'));

assert.equal(UPAHEAD_MIN_DEFAULT_HOURS, readPyConst('UPAHEAD_MIN_DEFAULT_HOURS'));
assert.equal(UPAHEAD_MAX_ACTIVE_HOURS, readPyConst('UPAHEAD_MAX_ACTIVE_HOURS'));
assert.equal(UPAHEAD_MAX_ACTIVE_ITEMS, readPyConst('UPAHEAD_MAX_ACTIVE_ITEMS'));
assert.equal(UPAHEAD_MAX_ACTIVE_BYTES, readPyConst('UPAHEAD_MAX_ACTIVE_BYTES'));
assert.equal(UPAHEAD_MAX_PUBLICATION_BYTES, readPyConst('UPAHEAD_MAX_PUBLICATION_BYTES'));
assert.equal(policy.minimumDefaultRetentionHours, UPAHEAD_MIN_DEFAULT_HOURS);
assert.equal(policy.maximumActiveWindowHours, UPAHEAD_MAX_ACTIVE_HOURS);
assert.equal(policy.active.maxItems, UPAHEAD_MAX_ACTIVE_ITEMS);
assert.equal(policy.active.maxBytes, UPAHEAD_MAX_ACTIVE_BYTES);
assert.equal(policy.publication.maxSnapshotBytes, UPAHEAD_MAX_PUBLICATION_BYTES);
assert.equal(policy.categoryDefaultRetentionHours.alerts, ALERT_FALLBACK_HOURS);
assert.equal(policy.categoryDefaultRetentionHours.shopping, OFFER_FALLBACK_HOURS);
assert.equal(policy.pending.maxItems, 500);
assert.equal(policy.pending.maxBytes, 1_000_000);

console.log('horizon and retention limits match Python/JS and JSON policy');
