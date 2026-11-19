// Real routed Chromium evidence. HTTP providers are controlled fixtures;
// this certifies the page wiring, NOT the deployed Cloudflare Worker.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const PORT = 4188;
const BASE = `http://${HOST}:${PORT}`;
const CF = 'https://a06-sections.example.test/preview/sections/latest';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Date.now();

function epoch(id) {
  const n = now();
  const story = { id, title: 'A06 R3 ' + id + ' qualified story',
    url: 'https://publisher.example.test/a06/' + id,
    publishedAt: n - 60_000, source: 'A06 Controlled Fixture' };
  return { schemaVersion: 2, fetchedAt: n, contentHash: id,
    sections: { topStories: [story], india: [story], world: [story] } };
}

function answer(route, data) {
  return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) });
}

async function check(page, label, expectedText, trace) {
  // Navigating to the unchanged hash is same-document and need not reload React.
  // Force a new published-data epoch for each phase.
  if (label === 'cf-success') {
    await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded' });
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  try {
    await page.getByText(expectedText, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: 'artifacts/a06/sections-' + label + '-failure.png', fullPage: true });
    console.error('A06-R3 authority phase failed', {
      label, expectedText, trace, bodyExcerpt: (await page.locator('body').innerText()).slice(0, 1000),
    });
    throw error;
  }
  await page.screenshot({ path: 'artifacts/a06/sections-' + label + '.png', fullPage: true });
  if (!trace.includes('CF')) throw new Error(label + ': Cloudflare was not requested');
  if (label === 'cf-success' && trace.includes('GH')) {
    throw new Error('Healthy Cloudflare unexpectedly tried GitHub fallback');
  }
  if (label !== 'cf-success' && !trace.includes('GH')) {
    throw new Error(label + ': invalid Cloudflare did not try GitHub');
  }
  return { label, requested: trace.join(' > '), status: 'PASS' };
}

const server = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' });
const watchdog = setTimeout(() => process.exit(124), 200_000);
watchdog.unref();
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE)).ok) { ready = true; break; } } catch {}
    await wait(250);
  }
  if (!ready) throw new Error('A06-R3 Vite preview did not start');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 }, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  let phase = 'cf-success';
  let trace = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(CF)) {
      trace.push('CF');
      const data = phase === 'cf-success' ? epoch('CF_GOOD')
        : phase === 'cf-future' ? { ...epoch('CF_FUTURE'), fetchedAt: now() + 365 * 86400_000 }
          : { ...epoch('CF_EMPTY'), sections: {} };
      return answer(route, data);
    }
    if (url.includes('/newsdata/sections_latest.json')
      || url.includes('/public/newsdata/sections_latest.json')) {
      trace.push('GH');
      return answer(route, phase === 'both-empty'
        ? { ...epoch('GH_EMPTY'), sections: {} } : epoch('GH_GOOD'));
    }
    if (url.startsWith(BASE)) return route.continue();
    return route.abort();
  });

  await mkdir('artifacts/a06', { recursive: true });
  const results = [];
  for (const [key, expected] of [
    ['cf-success', 'Cloudflare authority active'],
    ['both-empty', 'Sections authorities unavailable'],
    ['cf-invalid', 'showing GitHub'],
    ['cf-future', 'showing GitHub'],
  ]) {
    phase = key;
    trace = [];
    results.push(await check(page, key, expected, trace));
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log(JSON.stringify({ suite: 'A06-R3 real Main route authority lifecycle', results }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
  await wait(300);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  clearTimeout(watchdog);
}
