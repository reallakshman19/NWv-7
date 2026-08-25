import { verifyDailyDigestBaseUrl } from './verify_daily_digest_activation_config.mjs';

function todayInIndia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cardShapeValid(card) {
  return Boolean(card?.slot && card?.canonicalId && card?.publisherFamily && card?.product
    && card?.edition && card?.title && /^https:\/\//.test(String(card?.canonicalUrl || '')));
}

export async function runDailyDigestSmoke({ baseUrl, digestDate = todayInIndia(), fetchImpl = fetch } = {}) {
  const verified = verifyDailyDigestBaseUrl(baseUrl);
  if (!verified.ok) return { ok: false, error: verified.error };
  const url = `${verified.endpointUrl}?date=${encodeURIComponent(digestDate)}`;
  const response = await fetchImpl(url, { method: 'GET', cache: 'no-cache' });
  if (!response?.ok) return { ok: false, error: `GET failed: ${response?.status || 'unknown'}`, status: response?.status };
  const data = await response.json();
  if (data?.digestDate !== digestDate) return { ok: false, error: 'digest_date_mismatch' };
  if (!Array.isArray(data.cards) || !data.cards.every(cardShapeValid)) return { ok: false, error: 'invalid_cards' };
  if (data.cards.length < 2 || data.cards.length > 4) return { ok: false, error: 'unexpected_card_count' };
  const preflight = await fetchImpl(verified.endpointUrl, { method: 'OPTIONS' });
  if (![200, 204].includes(preflight?.status)) return { ok: false, error: 'options_failed' };
  return {
    ok: true,
    digestDate,
    snapshotId: data.snapshotId,
    snapshotRevision: data.snapshotRevision,
    compositionState: data.compositionState,
    cardCanonicalIds: data.cards.map(card => card.canonicalId),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.argv[2] || process.env.DAILY_DIGEST_API_BASE_URL || process.env.VITE_API_BASE_URL || '';
  runDailyDigestSmoke({ baseUrl }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }).catch(error => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

export { todayInIndia, cardShapeValid };
