// General-news identity only. Planner occurrence and Insight identity are separate contracts.
const TRACKING_KEYS = new Set(['utm','at_campaign','at_medium','cmpid','fbclid','gclid','mc_cid','mc_eid']);
const TN_CITIES = ['chennai','madurai','coimbatore','trichy','tiruchirappalli','tirunelveli','cuddalore','salem','nagapattinam','thanjavur','erode','vellore'];
const CITY_ALIASES = {tiruchirappalli:'trichy',tiruchi:'trichy'};
const text = v => String(v ?? '').trim();
const norm = v => text(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');

const URL_AUTHORITY = /^https?:\/\/([^/?#]+)/i;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const UNRESERVED = /^[a-z0-9._~-]$/i;

function safeHttpUrl(value) {
  const raw = text(value);
  const authority = raw.match(URL_AUTHORITY)?.[1];
  const hasControl = Array.from(raw).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!authority || /[^\x21-\x7e]|@/.test(authority) || hasControl || raw.includes('\\')) return null;

  // Require an ordinary DNS/IPv4 spelling or a bracketed IPv6 literal.
  // International host names are accepted in their ASCII (punycode) form.
  if (!authority.startsWith('[')) {
    const match = authority.match(/^([^:]+)(?::[0-9]*)?$/);
    if (!match) return null;
    const hostname = match[1].replace(/\.$/, '');
    const labels = hostname.split('.');
    if (!labels.every(label => DNS_LABEL.test(label))) return null;
    if (/^(?:[0-9]+|0x[0-9a-f]*)$/i.test(labels.at(-1))) {
      const isIPv4 = labels.length === 4 && labels.every(label =>
        /^(?:0|[1-9][0-9]{0,2})$/.test(label) && Number(label) <= 255);
      if (!isIPv4) return null;
    }
  }

  const url = new URL(raw);
  if (url.username || url.password) return null;
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return url;
}

function canonicalPath(path) {
  return path.replace(/%[0-9a-f]{2}|[^a-z0-9._~!$&'()*+,;=:@/-]/giu, token => {
    if (token.length === 3 && /^%[0-9a-f]{2}$/i.test(token)) {
      const decoded = String.fromCharCode(Number.parseInt(token.slice(1), 16));
      return UNRESERVED.test(decoded) ? decoded : token.toUpperCase();
    }
    return encodeURIComponent(token);
  })
    .replace(/(?:\/amp)+\/?$/i, '')
    .replace(/(?:\/amp)+\//g, '/')
    .replace(/([^/])\/$/, '$1') || '/';
}

function canonicalUrl(value, unwrapRedirect) {
  const url = safeHttpUrl(value);
  if (!url) return '';
  if (unwrapRedirect && url.hostname === 'news.google.com') {
    const target = url.searchParams.get('url');
    if (target) {
      try {
        const nested = safeHttpUrl(target);
        if (nested && nested.hostname !== url.hostname) return canonicalUrl(nested.href, false);
      } catch {
        // A malformed target does not invalidate the original article URL.
      }
    }
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_KEYS.has(lower) || (url.hostname === 'news.google.com' && lower === 'oc')) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = canonicalPath(url.pathname);
  return url.href;
}

export function canonicalNewsUrl(value) {
  try {
    return canonicalUrl(value, true);
  } catch {
    return '';
  }
}
export const newsUrl = s => canonicalNewsUrl(s?.canonicalUrl || s?.canonical_url || s?.url || s?.link);
export function newsIdentityKey(s = {}) {
  // URL must win over generated legacy IDs: the old producers erased semantic query parameters.
  return newsUrl(s) || text(s.canonicalId || s.canonical_id || s.id || s.hiddenKey).toLowerCase() || norm(s.title || s.headline);
}
function explicitDay(s) {
  const raw = s?.eventDate || s?.eventStartAt || s?.eventStartDate;
  if (!raw) return '';
  // Do not use publication day or acquisition market as event identity.
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  const ms = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0,10) : '';
}
function explicitCity(s) {
  const city = norm(s?.city || s?.location?.city || s?.geo?.city);
  if (city) return CITY_ALIASES[city] || city;
  // Only use a single, explicit city in a bounded incident headline, never feed region.
  const title = norm(s?.title || s?.headline);
  if (!/\b(?:crash|collision|accident|shooting|fire|blast|murder|flood|power shutdown|water supply)\b/.test(title)) return '';
  const cities = [...new Set(TN_CITIES.filter(c=>new RegExp(`\\b${c}\\b`).test(title)).map(c=>CITY_ALIASES[c]||c))];
  return cities.length===1 ? cities[0] : '';
}
function eventAction(s) {
  const t=norm(s?.title||s?.headline);
  if (/\bwalkathon\b/.test(t)) return 'walkathon';
  if (/\b(?:oman|india|tamil nadu|country|nation) observes?\b/.test(t)) return 'observance';
  if (/\b(?:state )?banquet\b/.test(t)) return 'banquet';
  if (/\bofficial meeting\b/.test(t)) return 'official_meeting';
  return '';
}
export function newsIdentityConflict(a,b) {
  const ua=newsUrl(a),ub=newsUrl(b);
  if (ua && ub && ua === ub) return '';
  if (ua && ub && ua !== ub) {
    const x=new URL(ua), y=new URL(ub);
    // The same endpoint with different nontracking query or case-sensitive opaque path is not an exact article.
    if (x.origin===y.origin && x.pathname===y.pathname && x.search!==y.search) return 'semantic_query_conflict';
    if (x.origin===y.origin && x.pathname!==y.pathname && x.pathname.toLowerCase()===y.pathname.toLowerCase()) return 'path_case_conflict';
  }
  const aa=eventAction(a),ab=eventAction(b);
  if(aa&&ab&&aa!==ab) return 'event_action_conflict';
  const da=explicitDay(a),db=explicitDay(b);
  if(da&&db&&da!==db) return 'event_date_conflict';
  const ca=explicitCity(a),cb=explicitCity(b);
  if(ca&&cb&&ca!==cb) return 'event_city_conflict';
  return '';
}
export function sameNewsArticle(a,b) {
  if(newsIdentityConflict(a,b)) return false;
  const ua=newsUrl(a),ub=newsUrl(b);
  if(ua&&ub) return ua===ub;
  if(ua||ub) return false;
  const ia=text(a?.canonicalId||a?.canonical_id||a?.id||a?.hiddenKey).toLowerCase();
  const ib=text(b?.canonicalId||b?.canonical_id||b?.id||b?.hiddenKey).toLowerCase();
  return Boolean(ia&&ia===ib);
}
export function sameRegionalNewsStory(a,b) {
  if(newsIdentityConflict(a,b)) return false;
  if(sameNewsArticle(a,b)) return true;
  const ta=norm(a?.title||a?.headline).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const tb=norm(b?.title||b?.headline).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const pa=Number(a?.publishedAt),pb=Number(b?.publishedAt);
  return ta===tb && ta.split(' ').length>=5 && pa>0 && pb>0 && Math.abs(pa-pb)<=36*3600000;
}
export function stableNewsRowKey(s={}) {
  return [newsIdentityKey(s),text(s.id),text(s.sourceGroup||s.source),text(s.publishedAt),text(s.title||s.headline)].join('\u0000');
}
/**
 * The historical producers lowercased paths and discarded query parameters.
 * A URL requiring a more specific identity must use the same ID even alone.
 */
export function hasLegacyNewsIdAmbiguity(url) {
  if (!url) return false;
  const parsed = new URL(url);
  const caseSensitivePath = parsed.pathname.replace(/%[0-9a-f]{2}/gi, '');
  return Boolean(parsed.search || /[A-Z]/.test(caseSensitivePath) || parsed.pathname.includes('%'));
}

export function disambiguateNewsIds(rows = []) {
  return rows.map(row => {
    const url = newsUrl(row);
    if (!hasLegacyNewsIdAmbiguity(url)) return row;
    const id = 'news-url:' + url;
    if (row.id === id) return row;
    return { ...row, id, legacyId: row.legacyId || row.id };
  });
}
