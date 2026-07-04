export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function payloadTimestamp(payload) {
  const record = asObject(payload);
  return parseTimestamp(
    record.fetchedAt || record.generatedAt || record.generated_at ||
    record.timestamp || record.updatedAt
  );
}

export function storyTimestamp(item) {
  const record = asObject(item);
  return parseTimestamp(
    record.publishedAt || record.pubDate || record.date || record.eventStartAt ||
    record.expiryAt || record.fetchedAt
  );
}

export function statusFrom(errors, warnings) {
  if (errors.length > 0) return 'FAIL';
  if (warnings.length > 0) return 'WARN';
  return 'PASS';
}

export function makeResult(errors, warnings, metrics = {}) {
  return {
    ok: errors.length === 0,
    status: statusFrom(errors, warnings),
    errors,
    warnings,
    metrics,
  };
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function storyIdentity(item) {
  const record = asObject(item);
  return record.id || record.url || record.link || record.title || 'unknown';
}
