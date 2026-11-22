/**
 * On-demand, read-only REAL provider browser proof for Market R3D.
 * No scheduled collection, no publication of third-party rates/NAVs.
 * Run after `npm run build`, with Playwright Chromium installed.
 * This checks real cross-origin browser access, not merely a Node HTTP GET.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:4173/';
const REPORT = 'reports/market-r3d-browser-provider-live.json';
const started = new Date().toISOString();
const results = [];

async function acquireInBrowser(page, id, url) {
  const observation = await page.evaluate(async requestUrl => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch(requestUrl, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return { ok: false, error: 'HTTP_' + response.status, httpStatus: response.status };
      const payload = await response.json();
      // Only the requested response is handled in memory. The report never
      // serializes rates, NAVs, scheme names or user-specific search terms.
      if (requestUrl.includes('frankfurter.dev')) {
        const day = payload?.date;
        const dateMs = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
          ? Date.parse(day + 'T00:00:00Z') : NaN;
        const valid = Number.isFinite(payload?.rate) && payload.rate > 0 &&
          Number.isFinite(dateMs) && dateMs <= Date.now() + 300000 &&
          ['OMR', 'USD'].includes(payload?.base) && payload?.quote === 'INR';
        return { ok: Boolean(valid), error: valid ? null : 'INVALID_FX_PROVIDER_PAYLOAD',
          httpStatus: response.status, providerAsOf: valid ? day : null,
          observationAgeHours: valid ? Math.round((Date.now() - dateMs) / 3600000) : null };
      }
      const row = payload?.data?.[0];
      const originalDate = String(row?.date || '');
      const dmy = /^(\\d{2})-(\\d{2})-(\\d{4})$/.exec(originalDate);
      const ymd = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(originalDate);
      const parts = dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
        : ymd ? [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] : null;
      const asOf = parts ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : NaN;
      const checked = parts && Number.isFinite(asOf) &&
        new Date(asOf).toISOString().slice(0, 10) ===
          parts.map((x, i) => String(x).padStart(i === 0 ? 4 : 2, '0')).join('-') &&
        asOf <= Date.now() + 300000;
      const valid = payload?.status === 'SUCCESS' &&
        Number(payload?.meta?.scheme_code) === 125497 &&
        Number.isFinite(Number(row?.nav)) && Number(row.nav) > 0 &&
        checked;
      return { ok: Boolean(valid), error: valid ? null : 'INVALID_MFAPI_PROVIDER_PAYLOAD',
        httpStatus: response.status,
        providerClockPresent: Boolean(checked),
        providerAsOf: valid ? new Date(asOf).toISOString().slice(0, 10) : null };
    } catch (error) {
      return { ok: false, error: String(error?.name || 'REQUEST_FAILED') + ': ' + String(error?.message || '').slice(0, 140) };
    } finally {
      clearTimeout(timer);
    }
  }, url);
  const safe = { sourceId: id, ...observation };
  results.push(safe);
  return safe;
}

async function awaitPreview() {
  for (let retry = 0; retry < 65; retry += 1) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Wait for local preview server only. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('LOCAL_VITE_PREVIEW_NOT_READY');
}

let preview = null;
let browser = null;
try {
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { stdio: 'ignore' });
  await awaitPreview();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const [id, url] of [
    ['frankfurter-omr-inr', 'https://api.frankfurter.dev/v2/rate/omr/inr'],
    ['frankfurter-usd-inr', 'https://api.frankfurter.dev/v2/rate/usd/inr'],
    ['mfapi-scheme-125497', 'https://api.mfapi.in/mf/125497/latest']
  ]) {
    await acquireInBrowser(page, id, url);
  }
  await context.close();
} catch (error) {
  results.push({ sourceId: 'harness', ok: false, error: String(error?.message || error) });
} finally {
  await browser?.close().catch(() => {});
  preview?.kill('SIGTERM');
  await fs.mkdir('reports', { recursive: true });
  const success = results.length === 3 && results.every(item => item.ok);
  const report = {
    verificationType: 'real-browser-cross-origin-acquisition',
    source: 'Playwright Chromium from locally previewed actual built app origin',
    startedAt: started, finishedAt: new Date().toISOString(),
    sourceRequests: results.length,
    status: success ? 'PASS' : 'HOLD',
    noRateOrNavValuesPublished: true,
    results
  };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!success) process.exitCode = 1;
}
