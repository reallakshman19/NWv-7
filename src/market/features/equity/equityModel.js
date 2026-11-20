/**
 * Pure data models, validation, formula guards, and CSV/JSON parser/generator
 * for the NWv7 Market Desk NSE Equity Watchlist.
 */
import { canonicalInstrumentKey, parseInstrumentKey } from '../../contracts/instrumentIdentity.js';

export const MAX_WATCHLIST_LIMIT = 12;
export const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB

const SYMBOL_REGEX = /^[A-Z0-9][A-Z0-9&-]{0,19}$/;
const FORMULA_START_REGEX = /^[=+@\t\r|-]/;

/**
 * Validates a custom user-entered ticker string.
 * Must be 1-20 characters, uppercase alphanumeric with optional & or -,
 * and must not start with a hyphen or formula prefix.
 */
export function validateCustomSymbol(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase().replace(/\.NS$/, '');
  if (FORMULA_START_REGEX.test(trimmed)) return null;
  return SYMBOL_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Resolves a symbol to canonical 'NSE:<SYMBOL>' key.
 */
export function toCanonicalKey(symbol) {
  const clean = validateCustomSymbol(symbol);
  return clean ? canonicalInstrumentKey('NSE', clean) : null;
}

/**
 * Extracts bare symbol from a canonical 'NSE:<SYMBOL>' key.
 */
export function fromCanonicalKey(key) {
  const parsed = parseInstrumentKey(key);
  return parsed && parsed.exchange === 'NSE' ? parsed.symbol : null;
}

/**
 * Checks if a string cell begins with a spreadsheet formula trigger.
 */
export function isFormulaInjection(value) {
  if (typeof value !== 'string') return false;
  if (FORMULA_START_REGEX.test(value)) return true;
  return FORMULA_START_REGEX.test(value.trim());
}

/**
 * RFC 4180 compliant CSV line tokenizer supporting quotes and escaped quotes.
 */
function parseCsvLine(line) {
  const row = [];
  let inQuotes = false;
  let currentToken = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentToken += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = '';
    } else {
      currentToken += char;
    }
  }
  row.push(currentToken.trim());
  return row;
}

/**
 * Parses and validates an uploaded JSON or CSV watchlist file.
 * Returns structured diagnostic preview without mutating any state.
 */
export function parseWatchlistFile(rawContent, currentKeys = [], maxLimit = MAX_WATCHLIST_LIMIT) {
  if (typeof rawContent !== 'string') {
    return { ok: false, error: 'Invalid input: content must be a text string' };
  }

  // File size check (<= 100 KB)
  const byteSize = new TextEncoder().encode(rawContent).length;
  if (byteSize > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `File size (${(byteSize / 1024).toFixed(1)} KB) exceeds the maximum allowed limit of 100 KB.`,
    };
  }

  const existingSet = new Set(currentKeys);
  const seenInFile = new Set();
  const validCandidates = [];
  const duplicateKeys = [];
  const capacityExcluded = [];
  const rejectedRows = [];

  const availableSlots = Math.max(0, maxLimit - currentKeys.length);
  const trimmed = rawContent.trim();

  // 1. Try parsing as JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      let items = [];

      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.keys)) {
          items = parsed.keys;
        } else if (Array.isArray(parsed.items)) {
          items = parsed.items;
        } else {
          return { ok: false, error: 'JSON does not contain a recognizable list of keys or items' };
        }
      }

      items.forEach((item, index) => {
        const rowNum = index + 1;
        let candidateSymbol = null;
        let candidateExchange = 'NSE';

        if (typeof item === 'string') {
          if (item.includes(':')) {
            const parts = item.split(':');
            candidateExchange = parts[0].trim().toUpperCase();
            candidateSymbol = parts[1];
          } else {
            candidateSymbol = item;
          }
        } else if (item && typeof item === 'object') {
          candidateSymbol = item.symbol || item.key;
          if (item.exchange) candidateExchange = String(item.exchange).trim().toUpperCase();
          if (candidateSymbol && String(candidateSymbol).includes(':')) {
            const parts = String(candidateSymbol).split(':');
            candidateExchange = parts[0].trim().toUpperCase();
            candidateSymbol = parts[1];
          }
        }

        if (!candidateSymbol) {
          rejectedRows.push({ row: rowNum, raw: JSON.stringify(item), reason: 'Missing symbol' });
          return;
        }

        const rawString = String(candidateSymbol);
        if (isFormulaInjection(rawString)) {
          rejectedRows.push({ row: rowNum, raw: rawString, reason: 'Formula injection characters rejected' });
          return;
        }

        if (candidateExchange !== 'NSE') {
          rejectedRows.push({
            row: rowNum,
            raw: `${candidateExchange}:${rawString}`,
            reason: `Non-NSE exchange '${candidateExchange}' is not supported in equity watchlist`,
          });
          return;
        }

        const validSymbol = validateCustomSymbol(rawString);
        if (!validSymbol) {
          rejectedRows.push({
            row: rowNum,
            raw: rawString,
            reason: 'Invalid symbol format (must be 1-20 alphanumeric characters)',
          });
          return;
        }

        const canonical = `NSE:${validSymbol}`;
        if (existingSet.has(canonical) || seenInFile.has(canonical)) {
          duplicateKeys.push(canonical);
          return;
        }

        seenInFile.add(canonical);
        if (validCandidates.length < availableSlots) {
          validCandidates.push(canonical);
        } else {
          capacityExcluded.push(canonical);
        }
      });

      return {
        ok: true,
        validCandidates,
        duplicateKeys,
        capacityExcluded,
        rejectedRows,
        summary: {
          totalRows: items.length,
          canImport: validCandidates.length,
          duplicates: duplicateKeys.length,
          rejected: rejectedRows.length,
          overflow: capacityExcluded.length,
        },
      };
    } catch {
      return { ok: false, error: 'Malformed JSON payload could not be parsed' };
    }
  }

  // 2. Parse as CSV
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, error: 'File contains no data' };
  }

  // Check header row
  let startIndex = 0;
  const firstLineTokens = parseCsvLine(lines[0]).map(t => t.toLowerCase());
  let symbolColIndex = 0;
  let exchangeColIndex = -1;

  if (firstLineTokens.includes('symbol') || firstLineTokens.includes('exchange')) {
    startIndex = 1;
    symbolColIndex = firstLineTokens.indexOf('symbol');
    if (symbolColIndex === -1) symbolColIndex = 0;
    exchangeColIndex = firstLineTokens.indexOf('exchange');
  }

  for (let i = startIndex; i < lines.length; i++) {
    const rowNum = i + 1;
    const tokens = parseCsvLine(lines[i]);
    const rawSymbol = tokens[symbolColIndex] || '';
    const rawExchange = exchangeColIndex >= 0 ? (tokens[exchangeColIndex] || 'NSE') : 'NSE';

    if (!rawSymbol) {
      rejectedRows.push({ row: rowNum, raw: lines[i], reason: 'Empty symbol column' });
      continue;
    }

    if (isFormulaInjection(rawSymbol) || (tokens.some(t => isFormulaInjection(t)))) {
      rejectedRows.push({ row: rowNum, raw: lines[i], reason: 'Formula injection characters rejected' });
      continue;
    }

    let exchange = rawExchange.trim().toUpperCase();
    let symbolPart = rawSymbol;

    if (rawSymbol.includes(':')) {
      const parts = rawSymbol.split(':');
      exchange = parts[0].trim().toUpperCase();
      symbolPart = parts[1];
    }

    if (exchange !== 'NSE') {
      rejectedRows.push({
        row: rowNum,
        raw: lines[i],
        reason: `Non-NSE exchange '${exchange}' is not supported in equity watchlist`,
      });
      continue;
    }

    const validSymbol = validateCustomSymbol(symbolPart);
    if (!validSymbol) {
      rejectedRows.push({
        row: rowNum,
        raw: lines[i],
        reason: 'Invalid symbol format (must be 1-20 alphanumeric characters)',
      });
      continue;
    }

    const canonical = `NSE:${validSymbol}`;
    if (existingSet.has(canonical) || seenInFile.has(canonical)) {
      duplicateKeys.push(canonical);
      continue;
    }

    seenInFile.add(canonical);
    if (validCandidates.length < availableSlots) {
      validCandidates.push(canonical);
    } else {
      capacityExcluded.push(canonical);
    }
  }

  return {
    ok: true,
    validCandidates,
    duplicateKeys,
    capacityExcluded,
    rejectedRows,
    summary: {
      totalRows: lines.length - startIndex,
      canImport: validCandidates.length,
      duplicates: duplicateKeys.length,
      rejected: rejectedRows.length,
      overflow: capacityExcluded.length,
    },
  };
}

/**
 * Generates spreadsheet-safe CSV export string.
 */
export function generateWatchlistCsv(keys) {
  const nowIso = new Date().toISOString();
  const header = 'exchange,symbol,savedAt\n';
  const rows = (keys || []).map((k) => {
    const sym = fromCanonicalKey(k) || k;
    return `NSE,${sym},${nowIso}`;
  });
  return header + rows.join('\n');
}

/**
 * Generates V2 schema JSON envelope string.
 */
export function generateWatchlistJson(keys, revision = 1) {
  const envelope = {
    schemaVersion: 2,
    exchange: 'NSE',
    revision,
    keys: (keys || []).map(k => (k.startsWith('NSE:') ? k : `NSE:${k}`)),
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(envelope, null, 2);
}
