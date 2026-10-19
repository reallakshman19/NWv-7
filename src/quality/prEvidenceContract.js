export const PR_EVIDENCE_HEADINGS = [
  'Problem and evidence',
  'Root cause',
  'What changed',
  'Scope control',
  'Verification on the exact PR head',
  'Operational acceptance',
  'Review disposition',
];

const REQUIRED_FIELDS = {
  'Problem and evidence': ['Issue / audit finding', 'Expected behavior', 'Observed behavior'],
  'Root cause': ['Root cause'],
  'Scope control': ['In scope', 'Explicitly unchanged'],
  'Verification on the exact PR head': ['PR head SHA', 'CI run URL'],
  'Operational acceptance': ['Deployment performed?', 'Rollback commit or recovery plan'],
  'Review disposition': ['Reviewer(s)', 'Merge decision'],
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

function clean(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function meaningful(value) {
  const valueText = clean(value);
  return Boolean(valueText && !PLACEHOLDER.test(valueText));
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
  const target = name.toLowerCase();
  const line = lines.find(raw => {
    const match = raw.match(/^\s*-\s*(.+?):\s*(.*)$/);
    return match && match[1].toLowerCase().includes(target);
  });
  return line ? line.replace(/^\s*-\s*[^:]+:\s*/, '').trim() : '';
}

export function validatePrEvidence(body, options = {}) {
  const failures = [];
  const sections = splitSections(body);
  const expectedHeadSha = String(options.expectedHeadSha || '').trim().toLowerCase();
  if (expectedHeadSha) {
    const verificationLines = sections.get('verification on the exact pr head') || [];
    const claimedHeadSha = fieldValue(verificationLines, 'PR head SHA').toLowerCase();
    if (claimedHeadSha !== expectedHeadSha) {
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
    const cells = line.split('|').map(v => v.trim()).filter(Boolean);
    return cells.length >= 3 &&
      !/claimed correction|^[-:\s]+$/.test(cells[0].toLowerCase()) &&
      cells.slice(0, 3).every(meaningful);
  });
  if (!mappingRows.length) {
    failures.push('What changed: add a filled code-to-test traceability table row');
  }

  const verification = sections.get('verification on the exact pr head') || [];
  for (const gate of REQUIRED_GATES) {
    const row = verification.map(line => line.split('|').map(v => v.trim()).filter(Boolean))
      .find(cells => cells.length >= 2 && cells[0].toLowerCase().startsWith(gate.toLowerCase()));
    if (!row || !STATUSES.has(row[1])) {
      failures.push(gate + ': status must be PASS, FAIL, NOT_RUN or BLOCKED');
    } else if (row.length < 3 || !meaningful(row[2])) {
      failures.push(gate + ': include an evidence URL or a specific pending/blocker reason');
    }
  }
  return { ok: failures.length === 0, failures };
}
