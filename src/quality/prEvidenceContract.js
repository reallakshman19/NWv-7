export const PR_EVIDENCE_HEADINGS = [
  'Problem and evidence',
  'Root cause',
  'What changed',
  'Scope control',
  'Verification on the exact PR head',
  'Operational acceptance',
  'Review disposition',
];

// All named template fields are mandatory. Use explicit "none", NOT_RUN,
// or BLOCKED with an explanation rather than leaving an inapplicable field empty.
const REQUIRED_FIELDS = {
  'Problem and evidence': [
    'Issue / audit finding',
    'Reproduced on commit',
    'Expected behavior',
    'Observed behavior',
    'Evidence (logs/screenshots/fixture)',
  ],
  'Root cause': [
    'Root cause',
    'Relevant upstream/downstream contracts',
    'Alternatives rejected and why',
  ],
  'Scope control': [
    'In scope',
    'Explicitly unchanged',
    'Related PRs / branch dependencies',
    'Data schema, freshness, source authority, cache, or policy changes (or none)',
  ],
  'Verification on the exact PR head': ['PR head SHA', 'CI run URL'],
  'Operational acceptance': [
    'Runtime/environment tested (Static / Live / Hybrid / Worker)',
    'Real data epoch / timestamp / source authority',
    'Before/after observations',
    'Warnings or degraded behavior remaining',
    'Deployment performed?',
    'Rollback commit or recovery plan',
  ],
  'Review disposition': [
    'Reviewer(s)',
    'Unresolved risks and evidence gaps',
    'Follow-up issue(s)',
    'Merge decision',
  ],
};

const REQUIRED_GATES = [
  'Lint',
  'Unit & regression tests',
  'Build',
  'Domain certification',
  'Integration / browser smoke',
  'Staging or production validation',
];

const STATUSES = new Set(['PASS', 'FAIL', 'NOT_RUN', 'BLOCKED']);
const PLACEHOLDER = /^(?:[-—]+|todo|tbd|pending|not specified|placeholder|fill in|n\/a)$/i;
const SHA = /^[0-9a-f]{40}$/i;

function clean(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function meaningful(value) {
  const valueText = clean(value);
  return Boolean(valueText && !PLACEHOLDER.test(valueText));
}

function normalizeLabel(value) {
  return String(value || '').replace(/[\x60]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitSections(body) {
  const result = new Map();
  let current = null;
  for (const line of clean(body).split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (match) {
      current = match[1].trim().toLowerCase();
      result.set(current, []);
    } else if (current) {
      result.get(current).push(line);
    }
  }
  return result;
}

function fieldValue(lines, name) {
  const target = normalizeLabel(name);
  const line = lines.find(raw => {
    const match = raw.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    return match && normalizeLabel(match[1]) === target;
  });
  return line ? line.replace(/^\s*-\s*[^:]+:\s*/, '').trim() : '';
}

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(v => v.trim());
}

export function validatePrEvidence(body, options = {}) {
  const failures = [];
  const sections = splitSections(body);
  const verification = sections.get('verification on the exact pr head') || [];
  const claimedHeadSha = fieldValue(verification, 'PR head SHA').toLowerCase();
  if (!SHA.test(claimedHeadSha)) {
    failures.push('PR head SHA must be a 40-character hexadecimal commit ID');
  }

  // Only an event-backed caller can attest the head, but when the caller
  // provides this option an absent/malformed authority must never disable it.
  if (Object.prototype.hasOwnProperty.call(options, 'expectedHeadSha')) {
    const supplied = options.expectedHeadSha;
    if (typeof supplied !== 'string' || !SHA.test(supplied)) {
      failures.push('GitHub event PR head SHA is missing or invalid');
    } else if (claimedHeadSha !== supplied.toLowerCase()) {
      failures.push('PR head SHA does not match the GitHub pull request head commit');
    }
  }

  for (const heading of PR_EVIDENCE_HEADINGS) {
    const lines = sections.get(heading.toLowerCase());
    if (!lines) {
      failures.push('Missing heading: ' + heading);
      continue;
    }
    for (const field of REQUIRED_FIELDS[heading] || []) {
      if (!meaningful(fieldValue(lines, field))) {
        failures.push('Missing substantive field in ' + heading + ': ' + field);
      }
    }
  }

  const changed = sections.get('what changed') || [];
  const mappingRows = changed.filter(line => {
    const cells = tableCells(line);
    return cells.length >= 3 &&
      !/claimed correction|^[-:\s]+$/.test(cells[0].toLowerCase()) &&
      cells.slice(0, 3).every(meaningful);
  });
  if (!mappingRows.length) {
    failures.push('What changed: add a filled code-to-test traceability table row');
  }

  for (const gate of REQUIRED_GATES) {
    const row = verification.map(tableCells)
      .find(cells => cells.length >= 2 && normalizeLabel(cells[0]) === normalizeLabel(gate));
    if (!row || !STATUSES.has(row[1])) {
      failures.push(gate + ': status must be PASS, FAIL, NOT_RUN or BLOCKED');
    } else if (row.length < 3 || !meaningful(row[2])) {
      failures.push(gate + ': include an evidence URL or a specific pending/blocker reason');
    }
  }
  return { ok: failures.length === 0, failures };
}
